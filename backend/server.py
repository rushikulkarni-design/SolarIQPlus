from dotenv import load_dotenv
from pathlib import Path
import os
import io
import logging
import smtplib
import secrets
from email.message import EmailMessage
import uuid
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
AI_EXECUTOR = ThreadPoolExecutor(max_workers=1)
YOLO_MODEL = None
YOLO_MODEL_ERROR = None
from fastapi.responses import StreamingResponse
from ai_chat_server import router as ai_chat_router

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import (
    FastAPI,
    APIRouter,
    Request,
    Response,
    HTTPException,
    Depends,
    UploadFile,
    File,
    Header,
    Query,
)
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from bson import ObjectId
import bcrypt
import jwt

from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_auth_requests

from panel_recommendation_api import router as panel_recommendation_router
from panel_recommendation import recommend_panels

from services.ocr_service import (
    run_ocr,
    tesseract_available,
    OcrEngineUnavailable,
    OcrFailed,
)  # noqa: E402

from services.bill_parser import (
    parse_bill_fields,
    classify_status,
    FIELD_KEYS,
)

from ml.ml_api import ml_router
from shadow_server import router as shadow_router
from xgboost_router import router as xgboost_router
# ---------------------------------------------------------------------------
# Optional rooftop AI dependencies
# ---------------------------------------------------------------------------

try:
    from PIL import Image
    PIL_AVAILABLE = True
except Exception:
    Image = None
    PIL_AVAILABLE = False


# ---------------------------------------------------------------------------
# PDF report dependencies
# ---------------------------------------------------------------------------

try:
    from pypdf import PdfReader, PdfWriter
    from reportlab.pdfgen import canvas as reportlab_canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader
    from reportlab.lib import colors
    PDF_REPORT_AVAILABLE = True
except Exception:
    PdfReader = None
    PdfWriter = None
    reportlab_canvas = None
    A4 = (595.2755905511812, 841.8897637795277)
    ImageReader = None
    colors = None
    PDF_REPORT_AVAILABLE = False


# IMPORTANT:
# We deliberately use YOLO-World without calling set_classes().
#
# Calling set_classes() forces Ultralytics to load its CLIP text model.
# On this machine that consumes too much RAM and causes:
#
#     MemoryError: bad allocation
#
# YOLO-World itself loads successfully on Python 3.11.
try:
    from ultralytics import YOLOWorld
    YOLO_AVAILABLE = True
except Exception:
    YOLOWorld = None
    YOLO_AVAILABLE = False


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["MONGO_DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"

APP_NAME = "solariq"

MIME_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "pdf": "application/pdf",
}

ROOFTOP_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger("solariq")

app = FastAPI()

# CORS: one middleware only. Add your frontend origin here if it uses another port.
_LOCAL_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]
_ENV_CORS_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.environ.get("CORS_ORIGINS", "").split(",")
    if origin.strip()
]
_CORS_ORIGINS = list(dict.fromkeys(_LOCAL_CORS_ORIGINS + _ENV_CORS_ORIGINS))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")

api_router.include_router(xgboost_router)
api_router.include_router(panel_recommendation_router)

# Keep model inference away from

# ---------------------------------------------------------------------------
# Local file storage
# ---------------------------------------------------------------------------

LOCAL_STORAGE_DIR = ROOT_DIR / "storage"
LOCAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def _storage_path(path: str) -> Path:
    target = (LOCAL_STORAGE_DIR / path).resolve()
    root = LOCAL_STORAGE_DIR.resolve()

    if target != root and root not in target.parents:
        raise HTTPException(
            status_code=400,
            detail="Invalid storage path",
        )

    return target


def put_object(path: str, data: bytes, content_type: str) -> dict:
    file_path = _storage_path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)

    with open(file_path, "wb") as f:
        f.write(data)

    return {
        "path": path,
        "size": len(data),
    }


def get_object(path: str):
    file_path = _storage_path(path)

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Stored file not found",
        )

    with open(file_path, "rb") as f:
        content = f.read()

    return content, "application/octet-stream"


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(
        plain.encode("utf-8"),
        hashed.encode("utf-8"),
    )


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
        "type": "access",
    }

    return jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh",
    }

    return jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def set_auth_cookies(
    response: Response,
    access: str,
    refresh: str,
):
    response.set_cookie(
        "access_token",
        access,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=43200,
        path="/",
    )

    response.set_cookie(
        "refresh_token",
        refresh,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=604800,
        path="/",
    )


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")

    if not token:
        auth_header = request.headers.get("Authorization", "")

        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
        )

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )

        if payload.get("type") != "access":
            raise HTTPException(
                status_code=401,
                detail="Invalid token type",
            )

        try:
            oid = ObjectId(payload["sub"])
        except Exception:
            raise HTTPException(
                status_code=401,
                detail="Invalid token",
            )

        user = await db.users.find_one(
            {"_id": oid}
        )

        if not user:
            raise HTTPException(
                status_code=401,
                detail="User not found",
            )

        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)

        return user

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Token expired",
        )

    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid token",
        )


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str


class LoginInput(BaseModel):
    email: EmailStr
    password: str

class GoogleLoginInput(BaseModel):
    credential: str = Field(min_length=20)

class SetPasswordInput(BaseModel):
    password: str = Field(min_length=6, max_length=128)

class ProfileUpdateInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class ProjectInput(BaseModel):
    name: str
    consumer_type: str = "Residential"
    location: str = ""
    capacity_kw: Optional[float] = None
    notes: Optional[str] = None

    # Existing / installed solar system details. These are optional so the
    # original planner flow continues to work for new installations.
    system_status: str = "Planning"
    installation_date: Optional[str] = None
    monitoring_start_date: Optional[str] = None
    inverter_brand: Optional[str] = None
    inverter_model: Optional[str] = None
    panel_brand: Optional[str] = None
    panel_wattage_w: Optional[float] = None
    panel_count: Optional[int] = None

    # Rooftop/project planning fields already used by the frontend.
    roof_area_m2: Optional[float] = None
    roof_tilt_deg: Optional[float] = None


class BillUpdateInput(BaseModel):
    fields: dict


def public_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user.get("name", ""),
        "role": user.get("role", "user"),
        "has_password": bool(user.get("password_hash")),
        "auth_provider": user.get("auth_provider", "email"),
    }

async def get_owned_project(
    project_id: str,
    user: dict,
) -> dict:
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(
            status_code=404,
            detail="Project not found",
        )

    doc = await db.projects.find_one(
        {
            "_id": oid,
            "user_id": user["_id"],
        }
    )

    if not doc:
        raise HTTPException(
            status_code=404,
            detail="Project not found",
        )

    return doc


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

@api_router.post("/auth/register")
async def register(
    data: RegisterInput,
    response: Response,
):
    email = data.email.lower()

    if await db.users.find_one({"email": email}):
        raise HTTPException(
            status_code=400,
            detail="Email already registered",
        )

    doc = {
        "email": email,
        "password_hash": hash_password(data.password),
        "name": data.name,
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    result = await db.users.insert_one(doc)

    uid = str(result.inserted_id)

    set_auth_cookies(
        response,
        create_access_token(uid, email),
        create_refresh_token(uid),
    )

    doc["_id"] = uid

    return public_user(doc)


@api_router.post("/auth/login")
async def login(
    data: LoginInput,
    response: Response,
):
    email = data.email.lower()

    user = await db.users.find_one(
        {"email": email}
    )

    if (
        not user
        or not user.get("password_hash")
        or not verify_password(data.password, user["password_hash"])
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    uid = str(user["_id"])

    set_auth_cookies(
        response,
        create_access_token(uid, email),
        create_refresh_token(uid),
    )

    user["_id"] = uid

    return public_user(user)


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie(
        "access_token",
        path="/",
    )

    response.delete_cookie(
        "refresh_token",
        path="/",
    )

    return {"ok": True}


@api_router.post("/auth/google")
async def google_login(data: GoogleLoginInput, response: Response):
    """Verify Google's ID token and sign the user in."""
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()

    if not client_id:
        raise HTTPException(
            status_code=503,
            detail="Google sign-in is not configured",
        )

    try:
        claims = google_id_token.verify_oauth2_token(
            data.credential,
            google_auth_requests.Request(),
            client_id,
        )
    except Exception as exc:
        print(f"Google ID token verification failed: {type(exc).__name__}: {exc}")
        raise HTTPException(
            status_code=401,
            detail="Google sign-in could not be verified",
        )

    email = str(claims.get("email", "")).strip().lower()
    name = str(claims.get("name", "")).strip()

    if (
        not email
        or claims.get("email_verified") is not True
        or not name
        or not claims.get("sub")
    ):
        raise HTTPException(
            status_code=401,
            detail="Google account email or profile is not verified",
        )

    user = await db.users.find_one({"email": email})

    if user is None:
        doc = {
            "email": email,
            "name": name,
            "role": "user",
            "auth_provider": "google",
            "google_sub": claims["sub"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        result = await db.users.insert_one(doc)
        doc["_id"] = result.inserted_id
        user = doc
    else:
        # Preserve existing password login and account settings.
        await db.users.update_one(
            {"_id": user["_id"]},
            {
                "$set": {
                    "name": name,
                    "google_sub": claims["sub"],
                    "auth_provider": "google",
                }
            },
        )
        user["name"] = name
        user["auth_provider"] = "google"

    uid = str(user["_id"])
    set_auth_cookies(
        response,
        create_access_token(uid, email),
        create_refresh_token(uid),
    )

    user["_id"] = uid
    return public_user(user)


@api_router.post("/auth/set-password")
async def set_password(
    data: SetPasswordInput,
    user: dict = Depends(get_current_user),
):
    """Allow an authenticated Google user to set a SolarIQ+ password."""

    if not user.get("google_sub") and user.get("auth_provider") != "google":
        raise HTTPException(
            status_code=403,
            detail="Password setup is only available for Google accounts",
        )

    # Allow Google-linked users to set or change their SolarIQ+ password.
    # The Google identity remains linked, so Google sign-in continues to work.
    result = await db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {
            "$set": {
                "password_hash": hash_password(data.password),
            }
        },
    )

    if result.matched_count != 1:
        raise HTTPException(
            status_code=404,
            detail="Account not found",
        )

    return {"message": "Password saved successfully"}


@api_router.get("/auth/me")
async def me(
    user: dict = Depends(get_current_user),
):
    return public_user(
        {
            "_id": user["_id"],
            **user,
        }
    )


@api_router.patch("/auth/me")
async def update_me(
    data: ProfileUpdateInput,
    user: dict = Depends(get_current_user),
):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    await db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {"$set": {"name": name}},
    )
    updated_user = {**user, "name": name}
    return public_user({"_id": updated_user["_id"], **updated_user})


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

@api_router.get("/projects")
async def list_projects(
    user: dict = Depends(get_current_user),
):
    docs = await db.projects.find(
        {
            "user_id": user["_id"],
        }
    ).sort(
        "created_at",
        -1,
    ).to_list(100)

    for d in docs:
        d["id"] = str(d.pop("_id"))

    return docs


@api_router.post("/projects")
async def create_project(
    data: ProjectInput,
    user: dict = Depends(get_current_user),
):
    doc = data.model_dump()

    # Normalize the monitoring status without changing any existing project
    # or PDF-report fields. The report generator continues to read the same
    # project/bill/rooftop fields it used before this monitoring extension.
    if doc.get("system_status") not in {
        "Planning",
        "Installed",
    }:
        doc["system_status"] = "Planning"

    # Existing systems begin their SolarIQ+ monitoring timeline on the
    # selected date. The frontend defaults this to today, while the backend
    # also provides a safe fallback when an installed system is registered
    # without an explicit date.
    if (
        doc.get("system_status") == "Installed"
        and not doc.get("monitoring_start_date")
    ):
        doc["monitoring_start_date"] = datetime.now(
            timezone.utc
        ).date().isoformat()

    doc.update(
        {
            "user_id": user["_id"],
            "created_at": datetime.now(
                timezone.utc
            ).isoformat(),
        }
    )

    result = await db.projects.insert_one(doc)

    doc["id"] = str(result.inserted_id)
    doc.pop("_id", None)

    return doc


@api_router.get("/projects/{project_id}")
async def get_project(
    project_id: str,
    user: dict = Depends(get_current_user),
):
    doc = await get_owned_project(
        project_id,
        user,
    )

    doc["id"] = str(doc.pop("_id"))

    return doc


# ---------------------------------------------------------------------------
# File upload / retrieval
# ---------------------------------------------------------------------------

@api_router.post("/uploads")
async def upload_file(
    kind: str = Query("document"),
    project_id: str = Query(None),
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    if project_id:
        await get_owned_project(
            project_id,
            user,
        )

    ext = (
        file.filename.split(".")[-1].lower()
        if "." in file.filename
        else "bin"
    )

    if ext not in MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Upload a PDF, JPG or PNG.",
        )

    path = (
        f"{APP_NAME}/uploads/"
        f"{user['_id']}/"
        f"{uuid.uuid4()}.{ext}"
    )

    data = await file.read()

    content_type = (
        file.content_type
        or MIME_TYPES.get(
            ext,
            "application/octet-stream",
        )
    )

    result = put_object(
        path,
        data,
        content_type,
    )

    file_id = str(uuid.uuid4())

    await db.files.insert_one(
        {
            "id": file_id,
            "storage_path": result["path"],
            "original_filename": file.filename,
            "content_type": content_type,
            "size": result.get(
                "size",
                len(data),
            ),
            "kind": kind,
            "user_id": user["_id"],
            "project_id": project_id,
            "is_deleted": False,
            "created_at": datetime.now(
                timezone.utc
            ).isoformat(),
        }
    )

    return {
        "id": file_id,
        "filename": file.filename,
        "content_type": content_type,
        "size": result.get(
            "size",
            len(data),
        ),
        "kind": kind,
        "project_id": project_id,
    }


@api_router.get("/uploads/{file_id}/download")
async def download_file(
    file_id: str,
    request: Request,
    authorization: str = Header(None),
    auth: str = Query(None),
):
    token = None

    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]

    elif auth:
        token = auth

    else:
        token = request.cookies.get(
            "access_token"
        )

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
        )

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )

        if payload.get("type") != "access":
            raise HTTPException(
                status_code=401,
                detail="Invalid token type",
            )

    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid token",
        )

    record = await db.files.find_one(
        {
            "id": file_id,
            "is_deleted": False,
        }
    )

    if (
        not record
        or record.get("user_id")
        != payload.get("sub")
    ):
        raise HTTPException(
            status_code=404,
            detail="File not found",
        )

    content, ctype = get_object(
        record["storage_path"]
    )

    return Response(
        content=content,
        media_type=record.get(
            "content_type",
            ctype,
        ),
    )


# ---------------------------------------------------------------------------
# Electricity bill OCR
# ---------------------------------------------------------------------------

def serialize_bill(doc: dict) -> dict:
    doc = dict(doc)
    doc.pop("_id", None)
    return doc


async def get_owned_bill_file(
    file_id: str,
    user: dict,
) -> dict:
    record = await db.files.find_one(
        {
            "id": file_id,
            "is_deleted": False,
        }
    )

    if (
        not record
        or record["user_id"]
        != user["_id"]
    ):
        raise HTTPException(
            status_code=404,
            detail="File not found",
        )

    if record.get("kind") != "bill":
        raise HTTPException(
            status_code=400,
            detail="This file is not an electricity bill.",
        )

    if record.get("project_id"):
        await get_owned_project(
            record["project_id"],
            user,
        )

    return record


@api_router.post("/bills/{file_id}/extract")
async def extract_bill(
    file_id: str,
    user: dict = Depends(get_current_user),
):
    record = await get_owned_bill_file(
        file_id,
        user,
    )

    if not tesseract_available():
        raise HTTPException(
            status_code=503,
            detail="OCR engine is currently unavailable. Please try again shortly.",
        )

    content, ctype = get_object(
        record["storage_path"]
    )

    try:
        ocr = run_ocr(
            content,
            record.get(
                "content_type"
            ) or ctype,
        )

    except OcrEngineUnavailable:
        raise HTTPException(
            status_code=503,
            detail="OCR engine is currently unavailable. Please try again shortly.",
        )

    except OcrFailed:
        raise HTTPException(
            status_code=422,
            detail="We couldn't read this file. Try uploading a clearer image or PDF.",
        )

    raw_text = (
        ocr.get("raw_text", "")
        or ""
    )

    fields, confidence = parse_bill_fields(
        raw_text,
        ocr.get("ocr_confidence"),
    )

    status = classify_status(
        raw_text,
        fields,
        confidence,
    )

    now = datetime.now(
        timezone.utc
    ).isoformat()

    existing = await db.electricity_bills.find_one(
        {
            "source_file_id": file_id,
            "user_id": user["_id"],
        }
    )

    payload = {
        "user_id": user["_id"],
        "project_id": record.get(
            "project_id"
        ),
        "source_file_id": file_id,
        "source_content_type": record.get(
            "content_type"
        ),
        "source_filename": record.get(
            "original_filename"
        ),
        "status": status,
        "ocr_method": ocr.get(
            "method"
        ),
        "ocr_confidence": ocr.get(
            "ocr_confidence"
        ),
        "raw_text": raw_text,
        "fields": fields,
        "confidence": confidence,
        "verified_fields": (
            existing.get(
                "verified_fields",
                [],
            )
            if existing
            else []
        ),
        "updated_at": now,
    }

    if existing:
        await db.electricity_bills.update_one(
            {
                "_id": existing["_id"],
            },
            {
                "$set": payload,
            },
        )

        doc = await db.electricity_bills.find_one(
            {
                "_id": existing["_id"],
            }
        )

    else:
        payload["id"] = str(uuid.uuid4())
        payload["created_at"] = now
        payload["is_deleted"] = False

        await db.electricity_bills.insert_one(
            payload
        )

        doc = await db.electricity_bills.find_one(
            {
                "id": payload["id"],
            }
        )

    return serialize_bill(doc)


@api_router.get("/projects/{project_id}/bill")
async def get_project_bill(
    project_id: str,
    user: dict = Depends(get_current_user),
):
    await get_owned_project(
        project_id,
        user,
    )

    doc = await db.electricity_bills.find_one(
        {
            "project_id": project_id,
            "user_id": user["_id"],
            "is_deleted": {
                "$ne": True
            },
        },
        sort=[
            (
                "created_at",
                -1,
            )
        ],
    )

    return (
        serialize_bill(doc)
        if doc
        else None
    )


@api_router.patch("/bills/{bill_id}")
async def update_bill(
    bill_id: str,
    data: BillUpdateInput,
    user: dict = Depends(get_current_user),
):
    doc = await db.electricity_bills.find_one(
        {
            "id": bill_id,
            "is_deleted": {
                "$ne": True
            },
        }
    )

    if (
        not doc
        or doc["user_id"]
        != user["_id"]
    ):
        raise HTTPException(
            status_code=404,
            detail="Bill not found",
        )

    fields = dict(
        doc.get("fields")
        or {}
    )

    confidence = dict(
        doc.get("confidence")
        or {}
    )

    verified = set(
        doc.get(
            "verified_fields"
        )
        or []
    )

    for key, value in (
        data.fields or {}
    ).items():

        if key not in FIELD_KEYS:
            continue

        cleaned = (
            value
            if value not in ("", None)
            else None
        )

        fields[key] = cleaned

        confidence[key] = (
            1.0
            if cleaned is not None
            else 0.0
        )

        if cleaned is not None:
            verified.add(key)
        else:
            verified.discard(key)

    await db.electricity_bills.update_one(
        {
            "_id": doc["_id"],
        },
        {
            "$set": {
                "fields": fields,
                "confidence": confidence,
                "verified_fields": sorted(
                    verified
                ),
                "status": "completed",
                "updated_at": datetime.now(
                    timezone.utc
                ).isoformat(),
            }
        },
    )

    return serialize_bill(
        await db.electricity_bills.find_one(
            {
                "_id": doc["_id"],
            }
        )
    )


# ===========================================================================
# Rooftop AI
# ===========================================================================

# YOLO-World is being used WITHOUT set_classes().
#
# This avoids loading CLIP and keeps memory usage much lower.
#
# The pretrained YOLO-World model contains its own general object vocabulary.
# We map the classes that are useful for rooftop analysis where possible.

ROOFTOP_CLASS_ALIASES = {
    # Permanent/physical objects that can be relevant to solar planning.
    # The general pretrained model cannot reliably identify custom classes
    # such as "water tank" or "chimney" without loading the CLIP vocabulary.
    "bench": "Roof structure",
    "chair": "Roof structure",
    "umbrella": "Temporary structure",
    "potted plant": "Vegetation",
    "tree": "Vegetation",
}


# People, birds and vehicles are deliberately excluded from rooftop
# obstacle calculations. They are temporary objects and should not make
# a roof appear less usable simply because someone was present in the
# uploaded photograph.
ROOFTOP_IGNORED_CLASSES = {
    "person",
    "bird",
    "car",
    "truck",
    "bus",
    "motorcycle",
    "bicycle",
}


# Objects that can reduce the usable solar area estimate.
OBSTACLE_LABELS = {
    "Roof structure",
    "Temporary structure",
    "Vegetation",
}


def _load_yolo_model():
    """
    Load the lightweight YOLO-World model.

    IMPORTANT:
    Do NOT call model.set_classes() here.

    set_classes() causes Ultralytics to load CLIP and on a 5.86 GB
    RAM machine this can fail with:
        MemoryError: bad allocation
    """

    global YOLO_MODEL
    global YOLO_MODEL_ERROR

    if YOLO_MODEL is not None:
        return YOLO_MODEL

    if not YOLO_AVAILABLE:
        YOLO_MODEL_ERROR = (
            "ultralytics is not installed. "
            "Install it with: py -3.11 -m pip install ultralytics"
        )
        return None

    try:
        logger.info(
            "Loading lightweight YOLO-World rooftop model..."
        )

        YOLO_MODEL = YOLOWorld(
            "yolov8s-world.pt"
        )

        # DO NOT CALL set_classes().
        #
        # This is intentional and prevents CLIP from being loaded.

        logger.info(
            "YOLO-World rooftop model loaded without CLIP."
        )

        return YOLO_MODEL

    except Exception as exc:
        YOLO_MODEL_ERROR = str(exc)

        logger.exception(
            "Unable to load YOLO-World model."
        )

        return None


def _display_label(label: str) -> str:
    label = str(label).strip().lower()

    return ROOFTOP_CLASS_ALIASES.get(
        label,
        label.title(),
    )


def _is_relevant_detection(raw_label: str) -> bool:
    """
    Keep only detections that are useful for solar-rooftop planning.

    The current lightweight setup intentionally does not load CLIP, so
    YOLO-World is using its pretrained general-purpose vocabulary.
    People and vehicles are filtered because they are temporary and
    should never be treated as permanent rooftop obstacles.
    """

    normalized = str(raw_label).strip().lower()

    return normalized not in ROOFTOP_IGNORED_CLASSES


def _calculate_roof_metrics(
    image_width: int,
    image_height: int,
    objects: list,
):
    """
    Calculate a conservative visual usability estimate.

    This is NOT a physical roof-area measurement.

    Since the image alone cannot provide exact square footage, the
    backend reports a percentage estimate based on detected objects.

    No fabricated square-foot value is returned.
    """

    if not image_width or not image_height:
        return {
            "usable_area_percentage": 0.0,
            "suitability": "Unknown",
        }

    obstacle_count = sum(
        1
        for obj in objects
        if obj.get("label") in OBSTACLE_LABELS
    )

    # Conservative visual baseline.
    #
    # The value is an estimate for planning UI only, not an architectural
    # measurement.
    penalty = min(
        obstacle_count * 4.0,
        28.0,
    )

    usable_percentage = max(
        0.0,
        min(
            92.0 - penalty,
            100.0,
        ),
    )

    if usable_percentage >= 75:
        suitability = "Excellent"
    elif usable_percentage >= 60:
        suitability = "Good"
    elif usable_percentage >= 40:
        suitability = "Moderate"
    else:
        suitability = "Low"

    return {
        "usable_area_percentage": round(
            usable_percentage,
            1,
        ),
        "suitability": suitability,
    }


def _infer_roof_type_from_image(
    objects: list,
) -> dict:
    """
    Do not use CLIP.

    Without a dedicated roof-classification model, the safest honest
    result is an AI-detected rooftop surface rather than inventing
    'concrete flat roof', 'sloped roof', etc.
    """

    return {
        "roof_type": "Rooftop surface",
        "confidence": None,
        "model": "YOLO-World object detection",
    }


def _run_rooftop_ai(image_bytes: bytes):
    if not PIL_AVAILABLE:
        raise RuntimeError(
            "Pillow is required for rooftop image analysis."
        )

    image = Image.open(
        io.BytesIO(image_bytes)
    ).convert("RGB")

    width, height = image.size

    if width <= 0 or height <= 0:
        raise RuntimeError(
            "Invalid rooftop image dimensions."
        )

    # -------------------------------------------------------
    # YOLO-World object detection
    # -------------------------------------------------------

    model = _load_yolo_model()

    if model is None:
        raise RuntimeError(
            YOLO_MODEL_ERROR
            or "YOLO-World model could not be loaded."
        )

    logger.info(
        "Running YOLO rooftop detection on %sx%s image...",
        width,
        height,
    )

    results = model.predict(
        source=image,
        conf=0.20,
        iou=0.45,
        imgsz=512,
        device="cpu",
        verbose=False,
    )

    objects = []

    if results:
        result = results[0]

        names = result.names or {}

        if result.boxes is not None:
            boxes = result.boxes

            xyxy = boxes.xyxy.cpu().tolist()
            confidences = boxes.conf.cpu().tolist()
            class_ids = boxes.cls.cpu().tolist()

            for box, confidence, class_id in zip(
                xyxy,
                confidences,
                class_ids,
            ):
                x1, y1, x2, y2 = box

                class_id = int(class_id)

                raw_label = names.get(
                    class_id,
                    str(class_id),
                )

                if not _is_relevant_detection(
                    raw_label
                ):
                    continue

                display_label = _display_label(
                    raw_label
                )

                x1 = max(
                    0.0,
                    min(float(x1), float(width)),
                )
                y1 = max(
                    0.0,
                    min(float(y1), float(height)),
                )
                x2 = max(
                    0.0,
                    min(float(x2), float(width)),
                )
                y2 = max(
                    0.0,
                    min(float(y2), float(height)),
                )

                box_width = max(
                    0.0,
                    x2 - x1,
                )

                box_height = max(
                    0.0,
                    y2 - y1,
                )

                objects.append(
                    {
                        "label": display_label,
                        "cls": display_label,
                        "source_class": str(
                            raw_label
                        ),
                        "confidence": round(
                            float(confidence),
                            4,
                        ),
                        "box": {
                            "x": round(
                                x1 / width * 100,
                                2,
                            ),
                            "y": round(
                                y1 / height * 100,
                                2,
                            ),
                            "w": round(
                                box_width / width * 100,
                                2,
                            ),
                            "h": round(
                                box_height / height * 100,
                                2,
                            ),
                        },
                    }
                )

    # -------------------------------------------------------
    # Limit noisy low-confidence detections.
    # -------------------------------------------------------

    objects = sorted(
        objects,
        key=lambda x: x["confidence"],
        reverse=True,
    )[:30]

    # -------------------------------------------------------
    # Detection confidence
    # -------------------------------------------------------

    if objects:
        average_detection_confidence = (
            sum(
                obj["confidence"]
                for obj in objects
            )
            / len(objects)
        )
    else:
        average_detection_confidence = 0.0

    # -------------------------------------------------------
    # Roof metrics
    # -------------------------------------------------------

    metrics = _calculate_roof_metrics(
        width,
        height,
        objects,
    )

    roof = _infer_roof_type_from_image(
        objects
    )

    return {
        "roof_type": roof["roof_type"],
        "classification_confidence": roof[
            "confidence"
        ],
        "classification_model": roof[
            "model"
        ],

        "objects": objects,

        "detected_object_count": len(
            objects
        ),

        "average_detection_confidence": round(
            average_detection_confidence,
            4,
        ),

        "usable_area_percentage": metrics[
            "usable_area_percentage"
        ],

        "suitability": metrics[
            "suitability"
        ],

        "image_width": width,
        "image_height": height,

        "detection_model": (
            "YOLO-World yolov8s-world"
        ),

        "analysis_method": (
            "YOLO-World object detection"
        ),

        "clip_used": False,

        "note": (
            "Rooftop suitability is an AI-assisted visual estimate "
            "based on relevant physical objects detected in the image. "
            "People, birds and vehicles are excluded because they are "
            "temporary objects. The current lightweight model cannot "
            "reliably identify custom rooftop classes such as water tanks "
            "or chimneys without its additional CLIP vocabulary. Exact "
            "roof dimensions, shading, orientation and structural "
            "condition require additional site or image data."
        ),
    }


# ---------------------------------------------------------------------------
# Rooftop API
# ---------------------------------------------------------------------------

async def get_owned_rooftop_file(
    file_id: str,
    user: dict,
) -> dict:
    record = await db.files.find_one(
        {
            "id": file_id,
            "is_deleted": False,
        }
    )

    if (
        not record
        or record.get("user_id")
        != user["_id"]
    ):
        raise HTTPException(
            status_code=404,
            detail="Rooftop image not found.",
        )

    if record.get("kind") != "rooftop":
        raise HTTPException(
            status_code=400,
            detail="This file is not a rooftop image.",
        )

    if record.get("project_id"):
        await get_owned_project(
            record["project_id"],
            user,
        )

    if record.get(
        "content_type"
    ) not in ROOFTOP_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported rooftop image format.",
        )

    return record


def serialize_rooftop(doc: dict) -> dict:
    doc = dict(doc)

    doc.pop(
        "_id",
        None,
    )

    return doc


@api_router.post(
    "/rooftop/{file_id}/analyze"
)
async def analyze_rooftop(
    file_id: str,
    user: dict = Depends(get_current_user),
):
    """
    Analyze an uploaded rooftop image.

    Uses:
      - YOLO-World for actual object detection.
      - No CLIP model.
      - CPU inference to stay compatible with the available hardware.

    Results are persisted in rooftop_analyses.
    """

    record = await get_owned_rooftop_file(
        file_id,
        user,
    )

    if not YOLO_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail=(
                "Rooftop AI is not installed yet. "
                "Run: py -3.11 -m pip install ultralytics"
            ),
        )

    content, _ = get_object(
        record["storage_path"]
    )

    loop = asyncio.get_running_loop()

    try:
        result = await loop.run_in_executor(
            AI_EXECUTOR,
            _run_rooftop_ai,
            content,
        )

    except Exception as exc:
        logger.exception(
            "Rooftop AI analysis failed."
        )

        raise HTTPException(
            status_code=422,
            detail=(
                "Rooftop image analysis failed: "
                f"{str(exc)}"
            ),
        )

    now = datetime.now(
        timezone.utc
    ).isoformat()

    payload = {
        "id": str(uuid.uuid4()),

        "user_id": user["_id"],

        "project_id": record.get(
            "project_id"
        ),

        "source_file_id": file_id,

        "source_filename": record.get(
            "original_filename"
        ),

        "source_content_type": record.get(
            "content_type"
        ),

        "status": "completed",

        "roof_type": result.get(
            "roof_type"
        ),

        "classification_confidence": result.get(
            "classification_confidence"
        ),

        "classification_model": result.get(
            "classification_model"
        ),

        "objects": result.get(
            "objects",
            [],
        ),

        "detected_object_count": result.get(
            "detected_object_count",
            0,
        ),

        "average_detection_confidence": result.get(
            "average_detection_confidence",
            0,
        ),

        "usable_area_percentage": result.get(
            "usable_area_percentage"
        ),

        "suitability": result.get(
            "suitability"
        ),

        "image_width": result.get(
            "image_width"
        ),

        "image_height": result.get(
            "image_height"
        ),

        "detection_model": result.get(
            "detection_model"
        ),

        "analysis_method": result.get(
            "analysis_method"
        ),

        "clip_used": result.get(
            "clip_used",
            False,
        ),

        "note": result.get(
            "note"
        ),

        "updated_at": now,

        "created_at": now,
    }

    existing = await db.rooftop_analyses.find_one(
        {
            "source_file_id": file_id,
            "user_id": user["_id"],
        }
    )

    if existing:
        payload["id"] = existing.get(
            "id",
            payload["id"],
        )

        payload["created_at"] = existing.get(
            "created_at",
            now,
        )

        await db.rooftop_analyses.update_one(
            {
                "_id": existing["_id"],
            },
            {
                "$set": payload,
            },
        )

        doc = await db.rooftop_analyses.find_one(
            {
                "_id": existing["_id"],
            }
        )

    else:
        await db.rooftop_analyses.insert_one(
            payload
        )

        doc = await db.rooftop_analyses.find_one(
            {
                "id": payload["id"],
            }
        )

    return serialize_rooftop(doc)


@api_router.get(
    "/projects/{project_id}/rooftop"
)
async def get_project_rooftop(
    project_id: str,
    user: dict = Depends(get_current_user),
):
    await get_owned_project(
        project_id,
        user,
    )

    doc = await db.rooftop_analyses.find_one(
        {
            "project_id": project_id,
            "user_id": user["_id"],
            "status": "completed",
        },
        sort=[
            (
                "created_at",
                -1,
            )
        ],
    )

    return (
        serialize_rooftop(doc)
        if doc
        else None
    )



# ===========================================================================
# PDF REPORT GENERATION
# ===========================================================================

REPORT_TEMPLATES_DIR = ROOT_DIR / "report_templates"

REPORT_TEMPLATE_FILES = {
    1: REPORT_TEMPLATES_DIR / "COVER PAGE.pdf",
    2: REPORT_TEMPLATES_DIR / "PAGE 2.pdf",
    3: REPORT_TEMPLATES_DIR / "PAGE 3.pdf",
    4: REPORT_TEMPLATES_DIR / "PAGE 4.pdf",
}

# SolarIQ+ planning assumptions kept aligned with the frontend Financials page.
REPORT_ANNUAL_GENERATION_PER_KW = 1400.0
REPORT_PLANNING_TARIFF_PER_KWH = 8.0
REPORT_ANNUAL_TARIFF_ESCALATION = 0.04
REPORT_ANNUAL_DEGRADATION = 0.005
REPORT_ANNUAL_MAINTENANCE_RATE = 0.01
REPORT_PROJECTION_YEARS = 25

REPORT_MARKET_COST_BANDS = [
    {"max_kw": 3, "min": 190000, "max": 220000},
    {"max_kw": 5, "min": 205000, "max": 300000},
    {"max_kw": 7, "min": 270000, "max": 390000},
    {"max_kw": 10, "min": 370000, "max": 560000},
]


def _report_register_fonts():
    """Register a Windows font so ₹ remains a real selectable glyph."""
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont

        candidates = [
            ROOT_DIR / "fonts" / "segoeui.ttf",
            Path(r"C:\Windows\Fonts\segoeui.ttf"),
            Path(r"C:\Windows\Fonts\arial.ttf"),
        ]

        for regular in candidates:
            if regular.exists():
                bold = regular.with_name("segoeuib.ttf")
                if not bold.exists():
                    bold = regular.with_name("arialbd.ttf")

                pdfmetrics.registerFont(
                    TTFont("SolarFont", str(regular))
                )

                if bold.exists():
                    pdfmetrics.registerFont(
                        TTFont("SolarFont-Bold", str(bold))
                    )
                else:
                    pdfmetrics.registerFont(
                        TTFont("SolarFont-Bold", str(regular))
                    )

                return "SolarFont", "SolarFont-Bold"
    except Exception:
        logger.exception("Could not register Unicode report font.")

    return "Helvetica", "Helvetica-Bold"


REPORT_FONT, REPORT_FONT_BOLD = _report_register_fonts()


def _report_money(value):
    if value is None:
        return "—"
    try:
        return "₹{:,.0f}".format(float(value))
    except Exception:
        return "—"


def _report_number(value, decimals=0):
    if value is None:
        return "—"
    try:
        if decimals == 0:
            return "{:,.0f}".format(float(value))
        return "{:,.{}f}".format(float(value), decimals)
    except Exception:
        return "—"


def _report_first(*values, default=None):
    for value in values:
        if value not in (None, "", []):
            return value
    return default


def _report_float(value):
    try:
        return float(value)
    except Exception:
        return None


def _report_capacity_from_consumption(monthly_kwh):
    """
    SolarIQ+ practical planning rule:
    - theoretical kW = monthly kWh / (1400 / 12)
    - residential practical choices are 3–10 kW
    - the first practical choice is 3 kW
    """
    monthly = _report_float(monthly_kwh)
    if monthly is None or monthly <= 0:
        return None, None

    theoretical = monthly / (REPORT_ANNUAL_GENERATION_PER_KW / 12.0)

    practical_choices = [3, 4, 5, 6, 7, 8, 9, 10]
    practical = next(
        (kw for kw in practical_choices if kw >= theoretical),
        10,
    )

    return theoretical, practical


def _report_cost_band(capacity_kw):
    for band in REPORT_MARKET_COST_BANDS:
        if capacity_kw <= band["max_kw"]:
            return band
    return REPORT_MARKET_COST_BANDS[-1]


def _report_subsidy(capacity_kw):
    capacity_kw = float(capacity_kw or 0)
    if capacity_kw <= 0:
        return 0.0
    if capacity_kw <= 1:
        return capacity_kw * 30000
    if capacity_kw <= 2:
        return 60000
    return 78000


def _report_financial_model(capacity_kw):
    band = _report_cost_band(capacity_kw)
    midpoint_cost = (band["min"] + band["max"]) / 2.0
    subsidy = _report_subsidy(capacity_kw)
    contribution = max(0.0, midpoint_cost - subsidy)

    annual_generation = capacity_kw * REPORT_ANNUAL_GENERATION_PER_KW
    annual_savings = annual_generation * REPORT_PLANNING_TARIFF_PER_KWH
    monthly_savings = annual_savings / 12.0

    maintenance = midpoint_cost * REPORT_ANNUAL_MAINTENANCE_RATE

    cumulative = -contribution
    rows = []
    payback_years = None

    for year in range(1, REPORT_PROJECTION_YEARS + 1):
        generation = annual_generation * (
            (1 - REPORT_ANNUAL_DEGRADATION) ** (year - 1)
        )
        tariff = REPORT_PLANNING_TARIFF_PER_KWH * (
            (1 + REPORT_ANNUAL_TARIFF_ESCALATION) ** (year - 1)
        )
        gross_savings = generation * tariff
        net_savings = gross_savings - maintenance
        previous = cumulative
        cumulative += net_savings

        if payback_years is None and cumulative >= 0:
            if net_savings > 0:
                payback_years = (year - 1) + (
                    -previous / net_savings
                )
            else:
                payback_years = float(year)

        rows.append(
            {
                "year": year,
                "generation": generation,
                "gross_savings": gross_savings,
                "maintenance": maintenance,
                "net_savings": net_savings,
                "cumulative": cumulative,
            }
        )

    if payback_years is None:
        payback_text = "Beyond 25 years"
    else:
        payback_text = "{:.1f} years".format(payback_years)

    # A precise IRR needs a cash-flow convention that the planning UI does
    # not currently expose. Do not invent one for the report.
    return {
        "band": band,
        "midpoint_cost": midpoint_cost,
        "cost_min": band["min"],
        "cost_max": band["max"],
        "subsidy": subsidy,
        "contribution": contribution,
        "annual_generation": annual_generation,
        "monthly_generation": annual_generation / 12.0,
        "annual_savings": annual_savings,
        "monthly_savings": monthly_savings,
        "payback_years": payback_years,
        "payback_text": payback_text,
        "cost_per_kw": midpoint_cost / capacity_kw if capacity_kw else None,
        "lifetime_cumulative": rows[-1]["cumulative"] if rows else None,
        "rows": rows,
    }


def _report_bill_fields(bill):
    return dict((bill or {}).get("fields") or {})


def _report_rooftop_file_for_project(project_id, user_id):
    # Kept as a small async helper below; this placeholder documents the
    # database relationship used by the report generator.
    return None


async def _get_latest_project_file(project_id, user_id, kind):
    return await db.files.find_one(
        {
            "project_id": project_id,
            "user_id": user_id,
            "kind": kind,
            "is_deleted": False,
        },
        sort=[("created_at", -1)],
    )


def _report_safe_path(path):
    try:
        p = Path(path)
        if p.exists() and p.is_file():
            return p
    except Exception:
        pass
    return None


def _report_make_annotated_rooftop(image_bytes, rooftop):
    """
    Create a raster image only for the photo placeholder on page 2.
    The Adobe Express PDF itself remains a vector/selectable PDF.
    """
    if not PIL_AVAILABLE:
        return None

    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        draw = None
        try:
            from PIL import ImageDraw
            draw = ImageDraw.Draw(image)
        except Exception:
            draw = None

        if draw is None:
            return image

        width, height = image.size

        for obj in (rooftop or {}).get("objects", [])[:30]:
            box = obj.get("box") or {}
            x = float(box.get("x", 0)) / 100.0 * width
            y = float(box.get("y", 0)) / 100.0 * height
            w = float(box.get("w", 0)) / 100.0 * width
            h = float(box.get("h", 0)) / 100.0 * height

            draw.rectangle(
                [x, y, x + w, y + h],
                outline=(255, 180, 0),
                width=max(2, int(min(width, height) / 300)),
            )

            label = str(obj.get("label") or "Object")
            try:
                draw.text((x + 3, max(0, y - 14)), label, fill=(255, 180, 0))
            except Exception:
                pass

        return image
    except Exception:
        return None


def _report_draw_text(c, text, x, y, size=9, bold=False, max_width=None):
    if text is None:
        return
    text = str(text)
    font = REPORT_FONT_BOLD if bold else REPORT_FONT

    if max_width and len(text) > 1:
        # Basic character-based wrapping; the template is intentionally kept
        # clean rather than overflowing its designed boxes.
        approx_chars = max(8, int(max_width / (size * 0.52)))
        words = text.split()
        lines = []
        line = ""
        for word in words:
            candidate = word if not line else line + " " + word
            if len(candidate) <= approx_chars:
                line = candidate
            else:
                if line:
                    lines.append(line)
                line = word
        if line:
            lines.append(line)
    else:
        lines = [text]

    c.setFont(font, size)
    for index, line in enumerate(lines[:4]):
        c.drawString(x, y - index * (size + 2), line)


def _report_draw_center(c, text, x, y, size=9, bold=False):
    if text is None:
        return
    c.setFont(REPORT_FONT_BOLD if bold else REPORT_FONT, size)
    c.drawCentredString(x, y, str(text))


def _report_overlay_page(page_number, data, page_width, page_height):
    """
    Build a vector overlay for the original Adobe Express master page.

    IMPORTANT:
    The master PDF remains the background. Only dynamic project values,
    images and the financial line are drawn on top. All text remains
    selectable because the overlay is also vector text.
    """
    stream = io.BytesIO()
    c = reportlab_canvas.Canvas(
        stream,
        pagesize=(page_width, page_height),
    )

    project = data["project"]
    bill = data["bill_fields"]
    rooftop = data["rooftop"]
    rec = data["recommendation"]
    fin = data["financials"]

    # The master PDF coordinates are easiest to measure from the top.
    # ReportLab measures from the bottom, so convert here.
    def top_baseline(top_y, font_size):
        return page_height - top_y - (font_size * 0.82)

    def top_text(
        text,
        x,
        top_y,
        size=8.0,
        bold=False,
        max_width=None,
    ):
        if text in (None, ""):
            return
        _report_draw_text(
            c,
            text,
            x,
            top_baseline(top_y, size),
            size,
            bold,
            max_width,
        )

    def top_text_block(
        text,
        x,
        top_y,
        size=7.0,
        bold=False,
        max_width=260,
        leading=None,
    ):
        """Draw wrapped text with real font-width measurement.

        Returns the number of vertical points consumed so callers can
        place the next paragraph without collisions.
        """
        if text in (None, ""):
            return 0

        text = str(text)
        font = REPORT_FONT_BOLD if bold else REPORT_FONT
        leading = leading or (size + 3)

        words = text.split()
        lines = []
        line = ""

        for word in words:
            candidate = word if not line else line + " " + word
            width = c.stringWidth(candidate, font, size)

            if line and width > max_width:
                lines.append(line)
                line = word
            else:
                line = candidate

        if line:
            lines.append(line)

        c.setFont(font, size)
        baseline = top_baseline(top_y, size)

        for index, line in enumerate(lines):
            c.drawString(
                x,
                baseline - index * leading,
                line,
            )

        return len(lines) * leading

    # ------------------------------------------------------------------
    # PAGE 1 — COVER
    # ------------------------------------------------------------------
    if page_number == 1:
        # The four colons are part of the master PDF. Values are drawn on
        # the SAME baseline and immediately to the right of each colon.
        top_text(
            _report_first(bill.get("customer_name"), project.get("name"), default=""),
            188.5, 485.9, 8.2, True, 205
        )
        top_text(
            _report_first(bill.get("consumer_number"), default=""),
            188.5, 521.8, 8.2
        )
        top_text(
            data["report_id"],
            188.5, 557.6, 8.2
        )
        top_text(
            data["generated_date"],
            188.5, 593.4, 8.2
        )

    # ------------------------------------------------------------------
    # PAGE 2 — CUSTOMER & ROOFTOP ASSESSMENT
    # ------------------------------------------------------------------
    elif page_number == 2:
        # Customer summary.
        #
        # Master template colons:
        # left column  x≈124
        # right column x≈393
        #
        # Values therefore start just AFTER the colon.
        top_text(
            _report_first(
                bill.get("customer_name"),
                project.get("name"),
                default="",
            ),
            132,
            278,
            7.6,
            True,
            130,
        )

        top_text(
            _report_first(
                bill.get("consumer_number"),
                default="",
            ),
            132,
            301,
            7.6,
        )

        top_text(
            _report_first(
                project.get("consumer_type"),
                bill.get("consumer_type"),
                default="",
            ),
            132,
            324,
            7.6,
        )

        top_text(
            (
                _report_number(
                    bill.get("monthly_consumption_kwh"),
                    0,
                )
                if bill.get(
                    "monthly_consumption_kwh"
                )
                is not None
                else ""
            ),
            401,
            278,
            7.6,
        )

        amount = bill.get("bill_amount")

        top_text(
            (
                _report_money(amount)
                if amount is not None
                else ""
            ),
            401,
            301,
            7.6,
        )

        # Original rooftop image.
        original = data.get("rooftop_image")

        # AI processed image.
        annotated = data.get(
            "annotated_rooftop_image"
        )

        # The template has an icon strip on the left of each image frame.
        # Start the actual photograph after that strip.
        # Exact inner photo rectangles of the master template.
        # The header/label strip ends at y=399. The photo must fill only
        # the white image area below that line and stay inside the green frame.
        image_top = 399.0
        image_bottom = 533.0
        image_h = image_bottom - image_top
        image_w = 240.0

        def draw_photo_fit(photo, x, top_y, width, height):
            if photo is None:
                return
            try:
                from PIL import ImageOps
                fitted = ImageOps.fit(
                    photo.convert("RGB"),
                    (max(1, int(width * 2)), max(1, int(height * 2))),
                    method=Image.Resampling.LANCZOS,
                    centering=(0.5, 0.5),
                )
                c.drawImage(
                    ImageReader(fitted),
                    x,
                    page_height - top_y - height,
                    width=width,
                    height=height,
                    preserveAspectRatio=False,
                    mask="auto",
                )
            except Exception:
                c.drawImage(
                    ImageReader(photo),
                    x,
                    page_height - top_y - height,
                    width=width,
                    height=height,
                    preserveAspectRatio=False,
                    mask="auto",
                )

        draw_photo_fit(original, 32.0, image_top, image_w, image_h)
        draw_photo_fit(annotated, 324.0, image_top, image_w, image_h)

        # Roof analysis.
        top_text(
            _report_first(
                rooftop.get("roof_type"),
                default="",
            ),
            146,
            612,
            7.6,
            False,
            125,
        )

        # Exact physical area is not available from the photograph alone.
        top_text(
            "Not available",
            146,
            638,
            7.2,
            False,
            125,
        )

        usable = rooftop.get(
            "usable_area_percentage"
        )

        top_text(
            (
                "{}%".format(
                    _report_number(
                        usable,
                        1,
                    )
                )
                if usable is not None
                else ""
            ),
            146,
            662,
            7.6,
        )

        top_text(
            _report_first(
                rooftop.get("suitability"),
                default="",
            ),
            425,
            612,
            7.6,
        )

        obstacle_labels = []

        for obj in rooftop.get(
            "objects",
            [],
        )[:20]:
            label = obj.get("label")

            if (
                label
                and label not in obstacle_labels
            ):
                obstacle_labels.append(
                    label
                )

        obstacle_text = (
            ", ".join(obstacle_labels)
            if obstacle_labels
            else "None detected"
        )

        top_text(
            obstacle_text,
            425,
            638,
            7.2,
            False,
            110,
        )

        # Fill the AI assessment box with an honest, useful summary.
        object_count = int(
            rooftop.get(
                "detected_object_count",
                0,
            )
            or 0
        )

        ai_lines = [
            (
                "AI visual assessment: "
                f"{_report_number(usable, 1)}% usable area and "
                f"{rooftop.get('suitability', 'Not evaluated')} suitability."
            )
            if usable is not None
            else "AI visual assessment completed from the uploaded rooftop image.",
            (
                f"{object_count} relevant object"
                f"{'s' if object_count != 1 else ''} identified by the current "
                "lightweight detection model. Exact roof dimensions, orientation, "
                "shading and structural condition cannot be measured reliably "
                "from this image alone."
            ),
            "Final installation feasibility should be confirmed through a site survey before installation.",
        ]

        # Start below the master heading and keep the complete assessment
        # comfortably inside the green assessment box.
        ai_y = 740.0

        for line in ai_lines:
            consumed = top_text_block(
                line,
                82,
                ai_y,
                6.4,
                False,
                300,
                8.4,
            )
            ai_y += consumed + 4.0

    # ------------------------------------------------------------------
    # PAGE 3 — SOLAR SYSTEM RECOMMENDATION
    # ------------------------------------------------------------------
    elif page_number == 3:
        # Master template colons are around x=189.
        # Start values at x≈198 so there is visible whitespace after ':'.
        top_text(
            "{} kW".format(
                _report_number(
                    rec["capacity_kw"],
                    1,
                )
            ),
            198,
            252,
            7.8,
            True,
        )

        top_text(
            "Monocrystalline",
            198,
            269,
            7.2,
        )

        top_text(
            "550 W module",
            198,
            286,
            7.2,
        )

        top_text(
            "{} × {} W".format(
                rec["panel_count"],
                rec["panel_watt"],
            ),
            198,
            303,
            7.8,
        )

        top_text(
            "On-grid",
            198,
            320,
            7.8,
        )

        top_text(
            "{} kWh".format(
                _report_number(
                    rec["annual_generation"],
                    0,
                )
            ),
            198,
            339,
            7.8,
        )

        panel_recommendations = data.get("panel_recommendations") or []
        best_panel = panel_recommendations[0] if panel_recommendations else None

        # Main recommendation details. These are drawn from the actual
        # recommendation engine response, not static placeholder text.
        top_text(
            best_panel.get("name", "Not evaluated") if best_panel else "Not evaluated",
            198, 357, 7.0, False, 110,
        )

        top_text(
            best_panel.get("name", "Not evaluated") if best_panel else "Not evaluated",
            487, 255, 7.0, False, 60,
        )
        top_text(
            best_panel.get("technology", data.get("panel_technology", "TOPCon")) if best_panel else data.get("panel_technology", "TOPCon"),
            487, 272, 7.0, False, 60,
        )
        top_text("{} W modules".format(rec["panel_watt"]), 487, 289, 7.0, False, 60)
        top_text(
            best_panel.get("efficiency", "Not available") if best_panel else "Not available",
            487, 306, 7.0, False, 60,
        )
        top_text(
            best_panel.get("warranty", "Not available") if best_panel else "Not available",
            487, 323, 7.0, False, 60,
        )
        top_text("AI score: {}/100".format(best_panel.get("ai_score", "—")) if best_panel else "No match available", 487, 340, 6.5, False, 62)

        # Comparison table: up to three ranked results. Values come from
        # panel_recommendation.py; table labels match the existing template.
        table_top = 468
        if panel_recommendations:
            for index, item in enumerate(panel_recommendations[:3]):
                row_y = table_top + index * 36
                top_text(str(item.get("rank", index + 1)), 72, row_y, 6.7)
                top_text(item.get("name", "—"), 103, row_y, 6.2, False, 53)
                top_text(item.get("technology", "—"), 164, row_y, 6.2, False, 78)
                top_text(item.get("efficiency", "—"), 250, row_y, 6.2, False, 62)
                top_text(item.get("warranty", "—"), 320, row_y, 6.2, False, 62)
                top_text("{:.1f}/5".format(float(item.get("rating", 0))), 399, row_y, 6.2, False, 62)
                top_text("{:.1f}/100".format(float(item.get("ai_score", 0))), 474, row_y, 6.2, False, 50)
        else:
            top_text("—", 72, table_top, 6.7)
            top_text("No match", 103, table_top, 6.2, False, 53)
            top_text(data.get("panel_technology", "TOPCon"), 164, table_top, 6.2, False, 78)
            top_text("—", 250, table_top, 6.7)
            top_text("—", 320, table_top, 6.7)
            top_text("—", 399, table_top, 6.7)
            top_text("Unavailable", 474, table_top, 6.2, False, 50)

        # Explain how the results were produced and note catalogue limitations.
        if best_panel:
            notes = [
                "Panel shortlist uses the SolarIQ+ recommendation engine with {} technology and balanced priority.".format(data.get("panel_technology", "TOPCon")),
                "Top match: {}; AI score {:.1f}/100; efficiency {}; warranty {}.".format(best_panel.get("name", "—"), float(best_panel.get("ai_score", 0)), best_panel.get("efficiency", "—"), best_panel.get("warranty", "—")),
                "Scores are catalogue-based suitability scores, not guarantees of real-world generation or product quality. Verify current manufacturer datasheets, quotations and installer compatibility before purchase."
            ]
        else:
            notes = [
                "No brands matched the selected panel technology in the current SolarIQ+ catalogue.",
                "The system sizing and financial estimates above are still calculated independently of this brand shortlist.",
                "Confirm current manufacturer datasheets and obtain installer quotations before purchase."
            ]

        notes_y = 615.0
        for note in notes:
            consumed = top_text_block(note, 82, notes_y, 6.4, False, 345, 9.0)
            notes_y += consumed + 8

    # ------------------------------------------------------------------
    # PAGE 4 — FINANCIAL FEASIBILITY & ROI
    # ------------------------------------------------------------------
    elif page_number == 4:
        # -------------------------
        # Key assumptions
        # -------------------------
        top_text(
            "1,400 kWh/kW/year",
            198,
            622,
            7.2,
        )

        top_text(
            "₹8/kWh",
            198,
            651,
            7.2,
        )

        top_text(
            "1% of installed cost/year",
            198,
            682,
            7.2,
            False,
            130,
        )

        top_text(
            "25 years",
            198,
            711,
            7.2,
        )

        # -------------------------
        # Investment summary
        # -------------------------
        # The labels are in this exact master-template order:
        # Installed Cost
        # Government Subsidy
        # Customer Contribution
        # Cost Range (After Subsidy)
        # Cost per kW
        #
        # All values begin AFTER the colon at x≈189.
        top_text(
            _report_money(
                fin["midpoint_cost"]
            ),
            198,
            250,
            7.8,
            True,
        )

        top_text(
            _report_money(
                fin["subsidy"]
            ),
            198,
            276,
            7.8,
        )

        top_text(
            _report_money(
                fin["contribution"]
            ),
            198,
            302,
            7.8,
        )

        top_text(
            "{}–{}".format(
                _report_money(
                    fin["cost_min"]
                    - fin["subsidy"]
                ),
                _report_money(
                    fin["cost_max"]
                    - fin["subsidy"]
                ),
            ),
            198,
            327,
            6.8,
            False,
            75,
        )

        top_text(
            _report_money(
                fin["cost_per_kw"]
            ),
            198,
            352,
            7.8,
        )

        # -------------------------
        # Savings & payback
        # -------------------------
        top_text(
            _report_money(
                fin["annual_savings"]
            ),
            447,
            255,
            7.8,
        )

        top_text(
            _report_money(
                fin["monthly_savings"]
            ),
            447,
            277,
            7.8,
        )

        top_text(
            fin["payback_text"],
            447,
            300,
            7.8,
        )

        top_text(
            "Not evaluated",
            447,
            323,
            7.0,
        )

        top_text(
            _report_money(
                fin["lifetime_cumulative"]
            ),
            447,
            346,
            7.8,
        )

        # -------------------------
        # Cumulative savings graph
        # -------------------------
        # The graph is a SAVINGS series, not a cash-flow series. Therefore
        # it begins at ₹0. The customer's initial contribution is shown
        # separately above and is used only for the payback calculation.
        chart_left = 84.3
        chart_right = 381.3
        chart_top = 441.0       # 12.0L grid line
        chart_zero = 502.0      # 0 grid line
        chart_bottom = 522.0     # -4.0L grid line

        chart_value_top = 1200000.0

        def chart_point(year, savings):
            x = chart_left + (
                max(0.0, min(25.0, year)) / 25.0
            ) * (chart_right - chart_left)

            # Savings begin at ₹0 on the template's zero line and rise
            # into the positive region. The negative template grid remains
            # visible as part of the original design but is not used by the
            # savings series.
            fraction = max(0.0, min(1.0, savings / chart_value_top))
            top_y = chart_zero - fraction * (chart_zero - chart_top)

            return x, page_height - top_y

        rows = fin["rows"]

        # Draw the savings curve from zero.
        c.setStrokeColor(colors.HexColor("#31566B"))
        c.setLineWidth(1.15)

        # Explicit year-zero origin: cumulative savings starts at ₹0.
        previous = chart_point(0, 0.0)

        for row in rows:
            savings_from_zero = row["cumulative"] + fin["contribution"]
            point = chart_point(
                row["year"],
                savings_from_zero,
            )

            c.line(
                previous[0],
                previous[1],
                point[0],
                point[1],
            )

            previous = point

        # The zero line is the template's zero grid line.
        c.setStrokeColor(colors.HexColor("#6B7280"))
        c.setLineWidth(0.6)
        c.setDash(2, 2)
        c.line(
            chart_left,
            page_height - chart_bottom,
            chart_right,
            page_height - chart_bottom,
        )
        c.setDash()

        # 10 / 20 / 25-year cumulative savings, starting from ₹0.
        for year, top_y in ((10, 444.3), (20, 475.6), (25, 506.9)):
            savings_value = rows[year - 1]["cumulative"] + fin["contribution"]
            top_text(
                _report_money(savings_value),
                479.0,
                top_y,
                7.8,
                True,
            )

    c.save()
    stream.seek(0)
    return stream


async def _generate_project_report(project_id, user):
    if not PDF_REPORT_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail=(
                "PDF reporting dependencies are not installed. "
                "Run: py -3.11 -m pip install pypdf reportlab"
            ),
        )

    missing = [
        str(path)
        for path in REPORT_TEMPLATE_FILES.values()
        if not path.exists()
    ]
    if missing:
        raise HTTPException(
            status_code=500,
            detail=(
                "Report templates are missing. Put the four original PDFs "
                "inside backend/report_templates with the exact required names."
            ),
        )

    project = await get_owned_project(project_id, user)

    bill = await db.electricity_bills.find_one(
        {
            "project_id": project_id,
            "user_id": user["_id"],
            "is_deleted": {"$ne": True},
        },
        sort=[("created_at", -1)],
    )
    bill_fields = _report_bill_fields(bill)

    rooftop = await db.rooftop_analyses.find_one(
        {
            "project_id": project_id,
            "user_id": user["_id"],
            "status": "completed",
        },
        sort=[("created_at", -1)],
    )
    rooftop = dict(rooftop or {})

    monthly = bill_fields.get("monthly_consumption_kwh")
    theoretical, practical = _report_capacity_from_consumption(monthly)

    # If the project explicitly has a capacity, retain it as project data,
    # but the recommendation remains consumption-driven, matching the app.
    capacity_kw = practical
    if capacity_kw is None:
        project_capacity = _report_float(project.get("capacity_kw"))
        if project_capacity:
            capacity_kw = project_capacity

    if capacity_kw is None:
        capacity_kw = 3.0

    panel_watt = 550
    panel_count = max(1, int(__import__("math").ceil(capacity_kw * 1000 / panel_watt)))
    annual_generation = capacity_kw * REPORT_ANNUAL_GENERATION_PER_KW

    financials = _report_financial_model(capacity_kw)

    # Use the same panel recommendation engine as the frontend. The current
    # report flow does not persist the user's UI technology/priority choices,
    # so PDF recommendations use TOPCon + balanced priority consistently.
    panel_technology = "TOPCon"
    project_type = str(project.get("consumer_type") or "Residential").strip().lower()
    property_type = "commercial" if "commercial" in project_type else "residential"
    roof_area_sqft = _report_float(project.get("roof_area_m2"))
    if roof_area_sqft is not None:
        roof_area_sqft *= 10.7639

    try:
        panel_recommendations = recommend_panels(
            budget=financials.get("midpoint_cost", 250000),
            panel_technology=panel_technology,
            property_type=property_type,
            roof_area_sqft=roof_area_sqft,
            required_kw=capacity_kw,
            priority="balanced",
            top_n=3,
        )
    except Exception:
        logger.exception("Panel recommendations could not be added to PDF report.")
        panel_recommendations = []

    rooftop_image = None
    annotated_image = None

    rooftop_file_id = rooftop.get("source_file_id")
    if rooftop_file_id:
        rooftop_file = await db.files.find_one(
            {
                "id": rooftop_file_id,
                "user_id": user["_id"],
                "is_deleted": False,
            }
        )
        if rooftop_file:
            try:
                raw, _ = get_object(rooftop_file["storage_path"])
                if PIL_AVAILABLE:
                    rooftop_image = Image.open(io.BytesIO(raw)).convert("RGB")
                    annotated_image = _report_make_annotated_rooftop(raw, rooftop)
            except Exception:
                logger.exception("Unable to load rooftop image for PDF report.")

    generated = datetime.now().astimezone()
    generated_date = generated.strftime("%d %B %Y")
    report_id = "SIQ-{}-{}".format(
        generated.strftime("%Y%m%d"),
        str(project_id)[-6:].upper(),
    )

    data = {
        "project": project,
        "bill_fields": bill_fields,
        "rooftop": rooftop,
        "recommendation": {
            "capacity_kw": capacity_kw,
            "theoretical_kw": theoretical,
            "panel_count": panel_count,
            "panel_watt": panel_watt,
            "annual_generation": annual_generation,
        },
        "financials": financials,
        "panel_recommendations": panel_recommendations,
        "panel_technology": panel_technology,
        "panel_priority": "balanced",
        "generated_date": generated_date,
        "report_id": report_id,
        "rooftop_image": rooftop_image,
        "annotated_rooftop_image": annotated_image,
    }

    writer = PdfWriter()

    for page_number in range(1, 5):
        template_path = REPORT_TEMPLATE_FILES[page_number]
        reader = PdfReader(str(template_path))
        if not reader.pages:
            raise HTTPException(
                status_code=500,
                detail="Report template page {} is empty.".format(page_number),
            )

        base_page = reader.pages[0]
        page_width = float(base_page.mediabox.width)
        page_height = float(base_page.mediabox.height)

        overlay = _report_overlay_page(
            page_number,
            data,
            page_width,
            page_height,
        )
        overlay_reader = PdfReader(overlay)
        base_page.merge_page(overlay_reader.pages[0])
        writer.add_page(base_page)

    output = io.BytesIO()
    writer.write(output)
    output.seek(0)

    return output, report_id


@api_router.get("/projects/{project_id}/report.pdf")
async def download_project_report(
    project_id: str,
    user: dict = Depends(get_current_user),
):
    output, report_id = await _generate_project_report(
        project_id,
        user,
    )

    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="SolarIQ+_{}.pdf"'.format(report_id),
            "X-SolarIQ-Report-ID": report_id,
        },
    )



# ---------------------------------------------------------------------------
# SolarIQ+ Service Requests + Separate Developer Portal
# ---------------------------------------------------------------------------

SERVICE_CATALOG = {
    "panel-cleaning": "Solar Panel Cleaning",
    "system-inspection": "Solar System Inspection",
    "inverter-servicing": "Inverter Servicing and Repair",
    "electrical-maintenance": "Electrical and Wiring Maintenance",
    "performance-check": "Solar Performance Health Check",
    "panel-repair": "Solar Panel Repair and Replacement",
    "installation-expansion": "Solar Installation and Expansion",
    "battery-services": "Solar Battery Services",
    "consultation": "Solar Consultation",
    "annual-maintenance": "Annual Maintenance Contract (AMC)",
}

class ServiceRequestInput(BaseModel):
    service_key: str
    phone: str = Field(min_length=7, max_length=25)
    location: str = Field(min_length=5, max_length=500)
    description: str = Field(min_length=5, max_length=2000)
    preferred_date: Optional[str] = Field(default=None, max_length=30)

class AdminLoginInput(BaseModel):
    user_id: str = Field(min_length=1, max_length=150)
    password: str = Field(min_length=1, max_length=200)

class AdminTicketUpdateInput(BaseModel):
    status: str = Field(min_length=1, max_length=40)
    quotation_amount: Optional[float] = Field(default=None, ge=0, le=100000000)
    quotation_notes: Optional[str] = Field(default=None, max_length=4000)
    appointment_date: Optional[str] = Field(default=None, max_length=100)

ADMIN_ALLOWED_STATUSES = {
    "New", "Under Review", "Quotation Sent", "Accepted",
    "Booking Confirmed", "In Progress", "Completed", "Declined / Cancelled"
}


def _send_service_email(subject: str, body: str, to_address: str) -> bool:
    """Send email only when SMTP environment settings are configured."""
    host = os.environ.get("SMTP_HOST", "").strip()
    username = os.environ.get("SMTP_USERNAME", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "")
    sender = os.environ.get("SMTP_FROM", username).strip()
    if not (host and username and password and sender and to_address):
        logger.warning("Service email not sent: SMTP settings or recipient are not configured.")
        return False
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to_address
    msg.set_content(body)
    port = int(os.environ.get("SMTP_PORT", "587"))
    with smtplib.SMTP(host, port, timeout=15) as smtp:
        smtp.starttls()
        smtp.login(username, password)
        smtp.send_message(msg)
    return True


def _admin_token(user_id: str) -> str:
    return jwt.encode({
        "sub": user_id,
        "type": "solariq_admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=8),
    }, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_admin(request: Request) -> dict:
    token = request.cookies.get("solariq_admin_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Admin authentication required")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired admin session")
    if payload.get("type") != "solariq_admin" or payload.get("sub") != os.environ.get("ADMIN_USER_ID", "").strip():
        raise HTTPException(status_code=403, detail="Developer portal access denied")
    return {"user_id": payload["sub"]}


@api_router.post("/admin/login")
async def admin_login(data: AdminLoginInput, response: Response):
    configured_id = os.environ.get("ADMIN_USER_ID", "").strip()
    configured_hash = os.environ.get("ADMIN_PASSWORD_HASH", "").strip()
    if not configured_id or not configured_hash:
        raise HTTPException(status_code=503, detail="Developer portal credentials are not configured on the server")
    valid = secrets.compare_digest(data.user_id.strip(), configured_id)
    try:
        valid = valid and bcrypt.checkpw(data.password.encode("utf-8"), configured_hash.encode("utf-8"))
    except Exception:
        valid = False
    if not valid:
        raise HTTPException(status_code=401, detail="Invalid admin User ID or password")
    token = _admin_token(configured_id)
    response.set_cookie("solariq_admin_token", token, httponly=True, secure=False, samesite="lax", max_age=28800, path="/")
    return {"ok": True, "message": "Admin login successful", "access_token": token}


@api_router.post("/admin/logout")
async def admin_logout(response: Response):
    response.delete_cookie("solariq_admin_token", path="/")
    return {"ok": True}


@api_router.post("/service-requests")
async def create_service_request(data: ServiceRequestInput, user: dict = Depends(get_current_user)):
    if data.service_key not in SERVICE_CATALOG:
        raise HTTPException(status_code=400, detail="Please select a valid service")
    now = datetime.now(timezone.utc).isoformat()
    ticket_id = "SRV-" + datetime.now(timezone.utc).strftime("%Y%m%d") + "-" + uuid.uuid4().hex[:6].upper()
    doc = {
        "ticket_id": ticket_id,
        "user_id": user["_id"],
        "customer_name": user.get("name", ""),
        "customer_email": user.get("email", ""),
        "service_key": data.service_key,
        "service_name": SERVICE_CATALOG[data.service_key],
        "phone": data.phone.strip(),
        "location": data.location.strip(),
        "description": data.description.strip(),
        "preferred_date": data.preferred_date,
        "status": "New",
        "quotation_amount": None,
        "quotation_notes": "",
        "appointment_date": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.service_requests.insert_one(doc)
    admin_email = os.environ.get("SERVICE_ADMIN_EMAIL", "").strip()
    email_sent = False
    if admin_email:
        body = (f"New SolarIQ+ service request\nTicket: {ticket_id}\nCustomer: {doc['customer_name']}\n"
                f"Email: {doc['customer_email']}\nPhone: {doc['phone']}\nService: {doc['service_name']}\n"
                f"Location: {doc['location']}\nPreferred date: {doc['preferred_date'] or 'Not specified'}\n"
                f"Description: {doc['description']}\n\nOpen the SolarIQ+ Developer Portal to review this ticket.")
        try:
            email_sent = await asyncio.to_thread(_send_service_email, f"SolarIQ+ Service Request {ticket_id}", body, admin_email)
        except Exception:
            logger.exception("Could not send service-request notification email")
    return {"ticket_id": ticket_id, "status": "New", "email_notification_sent": email_sent,
            "message": "Service request submitted successfully."}


@api_router.get("/service-requests/mine")
async def my_service_requests(user: dict = Depends(get_current_user)):
    docs = await db.service_requests.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(100)
    for doc in docs:
        doc.pop("_id", None)
        doc.pop("user_id", None)
    return docs


@api_router.post("/admin/service-requests")
async def admin_list_service_requests(admin: dict = Depends(get_current_admin)):
    docs = await db.service_requests.find({}).sort("created_at", -1).to_list(500)
    for doc in docs:
        doc["id"] = str(doc.pop("_id"))
        doc.pop("user_id", None)
    return docs


@api_router.patch("/admin/service-requests/{ticket_id}")
async def admin_update_service_request(ticket_id: str, data: AdminTicketUpdateInput, admin: dict = Depends(get_current_admin)):
    if data.status not in ADMIN_ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid ticket status")
    doc = await db.service_requests.find_one({"ticket_id": ticket_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Service ticket not found")
    update = {"status": data.status, "quotation_amount": data.quotation_amount,
              "quotation_notes": (data.quotation_notes or "").strip(),
              "appointment_date": (data.appointment_date or "").strip() or None,
              "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.service_requests.update_one({"ticket_id": ticket_id}, {"$set": update})
    updated = {**doc, **update}
    # Send customer quotation/status email only when quotation is ready or booking is confirmed.
    if data.status in {"Quotation Sent", "Booking Confirmed"} and updated.get("customer_email"):
        body = (f"Hello {updated.get('customer_name') or 'Customer'},\n\nYour SolarIQ+ service request has been updated.\n"
                f"Ticket: {ticket_id}\nService: {updated.get('service_name')}\nStatus: {data.status}\n"
                f"Quotation: {('₹' + format(data.quotation_amount, ',.2f')) if data.quotation_amount is not None else 'To be confirmed'}\n"
                f"Details: {update['quotation_notes'] or 'Please contact SolarIQ+ for further details.'}\n"
                f"Appointment: {update['appointment_date'] or 'To be scheduled'}\n\nSolarIQ+ Services")
        try:
            await asyncio.to_thread(_send_service_email, f"SolarIQ+ {data.status} - {ticket_id}", body, updated["customer_email"])
        except Exception:
            logger.exception("Could not send customer service update email")
    return {"ok": True, "ticket_id": ticket_id, "status": data.status}


# ---------------------------------------------------------------------------
# API root
# ---------------------------------------------------------------------------

@api_router.get("/")
async def root():
    return {
        "service": "SolarIQ+ API",
        "status": "ok",
    }


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup():
    await db.service_requests.create_index("ticket_id", unique=True)
    await db.service_requests.create_index([("user_id", 1), ("created_at", -1)])
    await db.users.create_index(
        "email",
        unique=True,
    )

    await db.files.create_index(
        [
            (
                "user_id",
                1,
            )
        ]
    )

    await db.electricity_bills.create_index(
        [
            (
                "source_file_id",
                1,
            ),
            (
                "user_id",
                1,
            ),
        ]
    )

    await db.electricity_bills.create_index(
        [
            (
                "project_id",
                1,
            ),
            (
                "user_id",
                1,
            ),
            (
                "created_at",
                -1,
            ),
        ]
    )

    await db.rooftop_analyses.create_index(
        [
            (
                "source_file_id",
                1,
            ),
            (
                "user_id",
                1,
            ),
        ]
    )

    await db.rooftop_analyses.create_index(
        [
            (
                "project_id",
                1,
            ),
            (
                "user_id",
                1,
            ),
            (
                "created_at",
                -1,
            ),
        ]
    )



@app.on_event("shutdown")
async def shutdown():
    AI_EXECUTOR.shutdown(
        wait=False,
        cancel_futures=True,
    )

    client.close()



# ---------------------------------------------------------------------------
# Application wiring
# ---------------------------------------------------------------------------

app.include_router(
    api_router
)

app.include_router(
    ml_router
)

app.include_router(
    shadow_router
)

app.include_router(ai_chat_router)


from shadow_server import router as shadow_router

app.include_router(shadow_router)