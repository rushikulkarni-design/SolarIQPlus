import os
import secrets
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse
from motor.motor_asyncio import AsyncIOMotorClient

from enphase_connector import EnphaseConnector

load_dotenv()

app = FastAPI(
    title="SolarIQ+ Enphase OAuth Service",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MONGO_URI = (
    os.getenv("MONGO_URI")
    or os.getenv("MONGODB_URI")
    or os.getenv("MONGO_URL")
    or "mongodb://127.0.0.1:27017"
)

MONGO_DB = (
    os.getenv("MONGO_DB")
    or os.getenv("MONGODB_DB")
    or os.getenv("DATABASE_NAME")
    or "solariq"
)

ENPHASE_CLIENT_ID = os.getenv(
    "ENPHASE_CLIENT_ID",
    "",
).strip()

ENPHASE_REDIRECT_URI = os.getenv(
    "ENPHASE_REDIRECT_URI",
    "http://127.0.0.1:8002/api/monitoring/enphase/oauth/callback",
).strip()

FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "http://localhost:3000",
).rstrip("/")

mongo_client = AsyncIOMotorClient(MONGO_URI)
db = mongo_client[MONGO_DB]

enphase = EnphaseConnector()


@app.get("/")
async def root():
    return {
        "service": "SolarIQ+ Enphase OAuth",
        "status": "available",
        "provider": "Enphase",
    }


@app.get("/api/enphase/oauth/status")
async def oauth_status():
    return {
        "provider": "Enphase",
        "application_configured": enphase.configured,
        "system_authorized": enphase.authorized,
        "redirect_uri": ENPHASE_REDIRECT_URI,
    }


@app.get("/api/enphase/oauth/connect")
async def start_enphase_oauth():
    """
    Start the Enphase OAuth authorization flow.

    The state value is stored server-side and checked again when
    Enphase redirects back to SolarIQ+.
    """

    if not enphase.configured:
        raise HTTPException(
            status_code=503,
            detail=(
                "Enphase application credentials are not configured."
            ),
        )

    if not ENPHASE_CLIENT_ID:
        raise HTTPException(
            status_code=503,
            detail="ENPHASE_CLIENT_ID is missing.",
        )

    state = secrets.token_urlsafe(32)

    await db["enphase_oauth_states"].insert_one(
        {
            "state": state,
            "created_at": datetime.now(timezone.utc),
            "used": False,
        }
    )

    authorization_url = (
        "https://api.enphaseenergy.com/oauth/authorize"
        "?response_type=code"
        f"&client_id={ENPHASE_CLIENT_ID}"
        f"&redirect_uri={ENPHASE_REDIRECT_URI}"
        f"&state={state}"
    )

    return {
        "provider": "Enphase",
        "status": "authorization_required",
        "authorization_url": authorization_url,
        "redirect_uri": ENPHASE_REDIRECT_URI,
    }


@app.get(
    "/api/monitoring/enphase/oauth/callback",
    response_class=HTMLResponse,
)
async def enphase_oauth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
):
    """
    Receive the OAuth authorization response from Enphase.
    """

    if error:
        description = error_description or error

        return HTMLResponse(
            content=f"""
            <!doctype html>
            <html>
            <head>
                <title>SolarIQ+ - Enphase Authorization</title>
                <style>
                    body {{
                        font-family: Arial, sans-serif;
                        background: #f8fafc;
                        padding: 50px;
                        color: #172033;
                    }}
                    .card {{
                        max-width: 700px;
                        margin: auto;
                        background: white;
                        border: 1px solid #e2e8f0;
                        border-radius: 16px;
                        padding: 32px;
                    }}
                    .error {{
                        color: #b91c1c;
                    }}
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>SolarIQ+ Enphase Connection</h1>
                    <h2 class="error">Authorization was not completed</h2>
                    <p>{description}</p>
                </div>
            </body>
            </html>
            """,
            status_code=400,
        )

    if not code:
        raise HTTPException(
            status_code=400,
            detail="Enphase authorization code is missing.",
        )

    if not state:
        raise HTTPException(
            status_code=400,
            detail="OAuth state is missing.",
        )

    state_record = await db["enphase_oauth_states"].find_one(
        {
            "state": state,
            "used": False,
        }
    )

    if state_record is None:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired OAuth state.",
        )

    await db["enphase_oauth_states"].update_one(
        {"_id": state_record["_id"]},
        {
            "$set": {
                "used": True,
                "used_at": datetime.now(timezone.utc),
            }
        },
    )

    try:
        token_data = await enphase.exchange_auth_code(
            code=code,
            redirect_uri=ENPHASE_REDIRECT_URI,
        )

    except Exception as exc:
        return HTMLResponse(
            content=f"""
            <!doctype html>
            <html>
            <head>
                <title>SolarIQ+ - Enphase Error</title>
                <style>
                    body {{
                        font-family: Arial, sans-serif;
                        background: #f8fafc;
                        padding: 50px;
                        color: #172033;
                    }}
                    .card {{
                        max-width: 700px;
                        margin: auto;
                        background: white;
                        border: 1px solid #e2e8f0;
                        border-radius: 16px;
                        padding: 32px;
                    }}
                    .error {{
                        color: #b91c1c;
                    }}
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>SolarIQ+ Enphase Connection</h1>
                    <h2 class="error">Token exchange failed</h2>
                    <p>{str(exc)}</p>
                </div>
            </body>
            </html>
            """,
            status_code=502,
        )

    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")

    if not access_token:
        raise HTTPException(
            status_code=502,
            detail="Enphase did not return an access token.",
        )

    now = datetime.now(timezone.utc)

    await db["enphase_authorization"].update_one(
        {
            "provider": "Enphase",
        },
        {
            "$set": {
                "provider": "Enphase",
                "access_token": access_token,
                "refresh_token": refresh_token,
                "token_response": token_data,
                "updated_at": now,
                "status": "authorized",
            },
        },
        upsert=True,
    )

    return HTMLResponse(
        content="""
        <!doctype html>
        <html>
        <head>
            <title>SolarIQ+ - Enphase Connected</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background: #f8fafc;
                    padding: 50px;
                    color: #172033;
                }

                .card {
                    max-width: 700px;
                    margin: auto;
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 16px;
                    padding: 32px;
                    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
                }

                .success {
                    color: #15803d;
                }

                .pill {
                    display: inline-block;
                    background: #dcfce7;
                    color: #166534;
                    padding: 7px 12px;
                    border-radius: 999px;
                    font-weight: 700;
                    font-size: 13px;
                }
            </style>
        </head>

        <body>
            <div class="card">
                <span class="pill">CONNECTED</span>

                <h1>Enphase Connected to SolarIQ+</h1>

                <p class="success">
                    Authorization completed successfully.
                </p>

                <p>
                    SolarIQ+ now has an authorized Enphase access token
                    and can proceed to retrieve authorized system data.
                </p>

                <p>
                    You can close this window.
                </p>
            </div>
        </body>
        </html>
        """,
        status_code=200,
    )


@app.get("/api/enphase/authorization")
async def get_authorization_status():
    """
    Return safe authorization metadata.
    Tokens are never returned by this endpoint.
    """

    record = await db["enphase_authorization"].find_one(
        {
            "provider": "Enphase",
        },
        {
            "_id": 0,
            "access_token": 0,
            "refresh_token": 0,
            "token_response": 0,
        },
    )

    if record is None:
        return {
            "provider": "Enphase",
            "authorized": False,
        }

    return {
        "provider": "Enphase",
        "authorized": record.get("status") == "authorized",
        "status": record.get("status"),
        "updated_at": (
            record.get("updated_at").isoformat()
            if isinstance(
                record.get("updated_at"),
                datetime,
            )
            else record.get("updated_at")
        ),
    }


@app.on_event("shutdown")
async def shutdown_db():
    mongo_client.close()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "enphase_oauth_server:app",
        host="127.0.0.1",
        port=8002,
        reload=True,
    )