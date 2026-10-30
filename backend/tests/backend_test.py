
"""Backend tests for SolarIQ+ MVP.

Covers auth, projects, uploads, ownership, and project-scoped uploads.
"""
import io
import os
import uuid

import pytest
import requests

BASE_URL = (
    os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
    if os.environ.get("REACT_APP_BACKEND_URL")
    else "http://127.0.0.1:8000"
)
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@solariq.app"
DEMO_PASSWORD = "solar123"


# --------------- Authentication helpers ---------------

def _add_bearer_token(session, response):
    """Add the access token to Authorization for local HTTP API requests."""
    data = response.json() if response.content else {}
    token = data.get("access_token") or session.cookies.get("access_token")

    if token:
        session.headers.update({"Authorization": f"Bearer {token}"})

    return token


# --------------- Fixtures ---------------

@pytest.fixture(scope="session")
def demo_session():
    session = requests.Session()
    response = session.post(
        f"{API}/auth/login",
        json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
        timeout=30,
    )
    assert response.status_code == 200, (
        f"Login failed: {response.status_code} {response.text}"
    )

    token = _add_bearer_token(session, response)
    assert token, "Login did not return an access token or access_token cookie"
    return session


@pytest.fixture(scope="session")
def demo_access_token(demo_session):
    token = demo_session.cookies.get("access_token")
    if not token:
        authorization = demo_session.headers.get("Authorization", "")
        token = authorization.removeprefix("Bearer ").strip()
    return token


@pytest.fixture(scope="session")
def second_user_session():
    """Register a separate user for ownership tests."""
    session = requests.Session()
    email = f"other_{uuid.uuid4().hex[:8]}@example.com"
    response = session.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "password": "pass1234",
            "name": "Other",
        },
        timeout=30,
    )
    assert response.status_code == 200, (
        f"Registration failed: {response.status_code} {response.text}"
    )

    token = _add_bearer_token(session, response)
    assert token, "Registration did not return an access token or access_token cookie"
    return session


# --------------- Auth ---------------

class TestAuth:
    def test_login_demo(self):
        session = requests.Session()
        response = session.post(
            f"{API}/auth/login",
            json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
            timeout=30,
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["email"] == DEMO_EMAIL
        assert "id" in data
        assert "access_token" in session.cookies
        assert "refresh_token" in session.cookies

        # A bearer token should work even if secure cookies aren't sent over HTTP.
        token = _add_bearer_token(session, response)
        assert token

    def test_me_via_cookie(self, demo_session):
        # This exercises the authenticated session. On local HTTP, the bearer
        # header is used when Secure cookies are not transmitted.
        response = demo_session.get(f"{API}/auth/me", timeout=30)
        assert response.status_code == 200, response.text
        assert response.json()["email"] == DEMO_EMAIL

    def test_me_unauthenticated(self):
        response = requests.get(f"{API}/auth/me", timeout=30)
        assert response.status_code == 401

    def test_login_bad_password(self):
        response = requests.post(
            f"{API}/auth/login",
            json={"email": DEMO_EMAIL, "password": "wrong"},
            timeout=30,
        )
        assert response.status_code == 401

    def test_register_and_duplicate(self):
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        session = requests.Session()
        payload = {
            "email": email,
            "password": "pass1234",
            "name": "Test User",
        }

        response = session.post(
            f"{API}/auth/register", json=payload, timeout=30
        )
        assert response.status_code == 200, response.text
        assert response.json()["email"] == email
        assert "access_token" in session.cookies

        token = _add_bearer_token(session, response)
        assert token

        me = session.get(f"{API}/auth/me", timeout=30)
        assert me.status_code == 200, me.text
        assert me.json()["email"] == email

        duplicate = requests.post(
            f"{API}/auth/register", json=payload, timeout=30
        )
        assert duplicate.status_code == 400

    def test_logout(self):
        session = requests.Session()
        response = session.post(
            f"{API}/auth/login",
            json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
            timeout=30,
        )
        assert response.status_code == 200, response.text
        _add_bearer_token(session, response)

        logout = session.post(f"{API}/auth/logout", timeout=30)
        assert logout.status_code == 200


# --------------- Projects ---------------

class TestProjects:
    def test_projects_unauth(self):
        response = requests.get(f"{API}/projects", timeout=30)
        assert response.status_code == 401

    def test_create_and_list_project(self, demo_session):
        payload = {
            "name": f"TEST_proj_{uuid.uuid4().hex[:6]}",
            "consumer_type": "Residential",
            "location": "Bangalore",
        }
        response = demo_session.post(
            f"{API}/projects", json=payload, timeout=30
        )
        assert response.status_code == 200, response.text
        created = response.json()
        assert created["name"] == payload["name"]
        assert "id" in created

        listing = demo_session.get(f"{API}/projects", timeout=30)
        assert listing.status_code == 200, listing.text
        names = [project["name"] for project in listing.json()]
        assert payload["name"] in names

    def test_create_project_unauth(self):
        response = requests.post(
            f"{API}/projects", json={"name": "x"}, timeout=30
        )
        assert response.status_code == 401


# --------------- Uploads ---------------

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0"
    b"\x00\x00\x00\x03\x00\x01\xa1\x8b\x9dW\x00\x00\x00\x00IEND\xaeB`\x82"
)


class TestUploads:
    def test_upload_unauth(self):
        files = {"file": ("t.png", io.BytesIO(PNG_BYTES), "image/png")}
        response = requests.post(
            f"{API}/uploads?kind=bill", files=files, timeout=60
        )
        assert response.status_code == 401

    def test_upload_and_download_png(self, demo_session, demo_access_token):
        files = {"file": ("bill.png", io.BytesIO(PNG_BYTES), "image/png")}
        response = demo_session.post(
            f"{API}/uploads?kind=bill", files=files, timeout=120
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert "id" in data

        download = demo_session.get(
            f"{API}/uploads/{data['id']}/download", timeout=60
        )
        assert download.status_code == 200
        assert len(download.content) > 0

        download_with_token = requests.get(
            f"{API}/uploads/{data['id']}/download",
            params={"auth": demo_access_token},
            timeout=60,
        )
        assert download_with_token.status_code == 200

    def test_upload_unsupported_ext(self, demo_session):
        files = {
            "file": ("bad.exe", io.BytesIO(b"MZ\x00"), "application/octet-stream")
        }
        response = demo_session.post(
            f"{API}/uploads?kind=bill", files=files, timeout=60
        )
        assert response.status_code == 400

    def test_download_missing(self, demo_session):
        response = demo_session.get(
            f"{API}/uploads/{uuid.uuid4()}/download", timeout=30
        )
        assert response.status_code == 404


# --------------- Project ownership and scoped uploads ---------------

class TestProjectDetail:
    def test_get_project_owner(self, demo_session):
        payload = {
            "name": f"TEST_detail_{uuid.uuid4().hex[:6]}",
            "consumer_type": "Commercial",
            "location": "Pune",
        }
        response = demo_session.post(
            f"{API}/projects", json=payload, timeout=30
        )
        assert response.status_code == 200, response.text
        created = response.json()

        result = demo_session.get(
            f"{API}/projects/{created['id']}", timeout=30
        )
        assert result.status_code == 200, result.text
        data = result.json()
        assert data["id"] == created["id"]
        assert data["name"] == payload["name"]
        assert data["consumer_type"] == "Commercial"
        assert data["location"] == "Pune"
        assert "_id" not in data

    def test_get_project_unauth(self, demo_session):
        response = demo_session.post(
            f"{API}/projects",
            json={"name": f"TEST_u_{uuid.uuid4().hex[:6]}"},
            timeout=30,
        )
        assert response.status_code == 200, response.text
        created = response.json()

        result = requests.get(
            f"{API}/projects/{created['id']}", timeout=30
        )
        assert result.status_code == 401

    def test_get_project_nonexistent(self, demo_session):
        response = demo_session.get(
            f"{API}/projects/507f1f77bcf86cd799439011", timeout=30
        )
        assert response.status_code == 404

    def test_get_project_malformed_id(self, demo_session):
        response = demo_session.get(
            f"{API}/projects/not-an-objectid", timeout=30
        )
        assert response.status_code == 404

    def test_get_project_other_user_forbidden(
        self, demo_session, second_user_session
    ):
        created_response = demo_session.post(
            f"{API}/projects",
            json={"name": f"TEST_own_{uuid.uuid4().hex[:6]}"},
            timeout=30,
        )
        assert created_response.status_code == 200, created_response.text
        created = created_response.json()

        response = second_user_session.get(
            f"{API}/projects/{created['id']}", timeout=30
        )
        assert response.status_code == 404


class TestScopedUploads:
    def test_upload_scoped_to_owned_project(self, demo_session):
        project_response = demo_session.post(
            f"{API}/projects",
            json={"name": f"TEST_up_{uuid.uuid4().hex[:6]}"},
            timeout=30,
        )
        assert project_response.status_code == 200, project_response.text
        project = project_response.json()

        files = {"file": ("bill.png", io.BytesIO(PNG_BYTES), "image/png")}
        response = demo_session.post(
            f"{API}/uploads?kind=bill&project_id={project['id']}",
            files=files,
            timeout=120,
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["project_id"] == project["id"]
        assert data["kind"] == "bill"

        download = demo_session.get(
            f"{API}/uploads/{data['id']}/download", timeout=60
        )
        assert download.status_code == 200

    def test_upload_other_users_project_returns_404(
        self, demo_session, second_user_session
    ):
        project_response = demo_session.post(
            f"{API}/projects",
            json={"name": f"TEST_x_{uuid.uuid4().hex[:6]}"},
            timeout=30,
        )
        assert project_response.status_code == 200, project_response.text
        project = project_response.json()

        files = {"file": ("bill.png", io.BytesIO(PNG_BYTES), "image/png")}
        response = second_user_session.post(
            f"{API}/uploads?kind=bill&project_id={project['id']}",
            files=files,
            timeout=60,
        )
        assert response.status_code == 404

    def test_upload_nonexistent_project_returns_404(self, demo_session):
        files = {"file": ("bill.png", io.BytesIO(PNG_BYTES), "image/png")}
        response = demo_session.post(
            f"{API}/uploads?kind=bill&project_id=507f1f77bcf86cd799439011",
            files=files,
            timeout=60,
        )
        assert response.status_code == 404

    def test_upload_without_project_id_still_works(self, demo_session):
        files = {"file": ("bill.png", io.BytesIO(PNG_BYTES), "image/png")}
        response = demo_session.post(
            f"{API}/uploads?kind=bill", files=files, timeout=60
        )
        assert response.status_code == 200, response.text
        assert response.json().get("project_id") is None
