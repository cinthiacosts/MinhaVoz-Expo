# Minha Voz security-fix regression tests (SEC-001 forgot/reset, SEC-002 role change, SEC-003 tts/upload, SEC-004 links privacy, nosniff)
import os
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
PWD = "senha123"
ENV = dotenv_values("/app/backend/.env")
DB = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]
PNG_1x1 = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")


def login(email, pwd=PWD):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def register_user(role=None):
    u = f"test_{uuid.uuid4().hex[:8]}"
    email = f"{u}@example.com"
    r = requests.post(f"{API}/auth/register", json={"full_name": "TEST Sec", "username": u, "email": email,
                                                     "password": "abc123", "accept_terms": True})
    assert r.status_code == 200, r.text
    tok = {"Authorization": f"Bearer {r.json()['token']}"}
    if role:
        requests.put(f"{API}/auth/role", json={"role": role}, headers=tok)
    return email, u, tok


def put_reset(email, code="123456", attempts=0):
    DB.password_resets.update_one({"email": email}, {"$set": {
        "email": email, "code_hash": bcrypt.hashpw(code.encode(), bcrypt.gensalt(4)).decode(), "attempts": attempts,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}}, upsert=True)


@pytest.fixture(scope="module")
def H():
    return {k: login(f"{k}@minhavoz.com") for k in ["maria", "carlos", "ana", "jose"]}


@pytest.fixture(scope="module")
def cid(H):
    r = requests.get(f"{API}/comm-users", headers=H["maria"])
    return [c for c in r.json() if c["name"].startswith("João")][0]["id"]


# ---- SEC-001: forgot password
class TestForgot:
    def test_forgot_unknown_email_generic(self):
        r = requests.post(f"{API}/auth/forgot", json={"email": f"nobody_{uuid.uuid4().hex[:6]}@example.com"})
        assert r.status_code == 200
        body = r.json()
        assert "demo_code" not in body and "code" not in body
        assert "Se o e-mail estiver cadastrado" in body["message"]

    def test_forgot_existing_no_code_leak(self):
        email, _, _ = register_user()
        r = requests.post(f"{API}/auth/forgot", json={"email": email})
        print("forgot existing:", r.status_code, r.text)
        assert r.status_code in (200, 503)
        assert "demo_code" not in r.json() and not any(k for k in r.json() if "code" in k)
        rec = DB.password_resets.find_one({"email": email})
        assert rec and rec["code_hash"].startswith("$2") and "code" not in rec

    def test_forgot_rate_limit(self):
        email = f"nobody_{uuid.uuid4().hex[:6]}@example.com"
        codes = [requests.post(f"{API}/auth/forgot", json={"email": email}).status_code for _ in range(4)]
        assert codes[:3] == [200] * 3 and codes[3] == 429, codes


# ---- SEC-001b: reset attempts + token_version
class TestReset:
    def test_wrong_code_increments_and_invalidates_after_5(self):
        email, _, _ = register_user()
        put_reset(email)
        for i in range(5):
            r = requests.post(f"{API}/auth/reset", json={"email": email, "code": "000000", "new_password": "nova123"})
            assert r.status_code == 400
        assert DB.password_resets.find_one({"email": email})["attempts"] == 5
        # correct code now rejected and record removed
        r = requests.post(f"{API}/auth/reset", json={"email": email, "code": "123456", "new_password": "nova123"})
        assert r.status_code == 400
        assert DB.password_resets.find_one({"email": email}) is None

    def test_success_reset_invalidates_old_jwt(self):
        email, _, tok = register_user()
        assert requests.get(f"{API}/auth/me", headers=tok).status_code == 200
        put_reset(email)
        r = requests.post(f"{API}/auth/reset", json={"email": email, "code": "123456", "new_password": "nova123"})
        assert r.status_code == 200
        assert requests.get(f"{API}/auth/me", headers=tok).status_code == 401
        new = login(email, "nova123")
        assert requests.get(f"{API}/auth/me", headers=new).status_code == 200
        assert requests.post(f"{API}/auth/login", json={"email": email, "password": "abc123"}).status_code == 401
        assert DB.password_resets.find_one({"email": email}) is None


# ---- SEC-002: role change does not elevate existing link
class TestRoleEscalation:
    def test_professor_switch_to_responsavel_no_elevation(self, H, cid):
        carlos = H["carlos"]
        try:
            r = requests.put(f"{API}/auth/role", json={"role": "responsavel"}, headers=carlos)
            assert r.status_code == 200 and r.json()["role"] == "responsavel"
            links = requests.get(f"{API}/comm-users/{cid}/links", headers=carlos).json()
            mine = [lk for lk in links if lk["is_me"]][0]
            assert mine["role"] == "professor"
            other = [lk for lk in links if not lk["is_me"]][0]
            assert requests.post(f"{API}/comm-users/{cid}/links", headers=carlos,
                                 json={"identifier": "delivered@resend.dev"}).status_code == 403
            assert requests.delete(f"{API}/links/{other['id']}", headers=carlos).status_code == 403
            assert requests.delete(f"{API}/comm-users/{cid}/history", headers=carlos).status_code == 403
            assert requests.post(f"{API}/comm-users/{cid}/pictograms", headers=carlos,
                                 json={"name": "TEST_x", "category_key": "comida"}).status_code == 403
            # links still hide other emails for carlos
            assert all(lk["member_email"] is None for lk in links if not lk["is_me"])
        finally:
            rr = requests.put(f"{API}/auth/role", json={"role": "professor"}, headers=carlos)
            assert rr.json()["role"] == "professor"


# ---- SEC-003: tts cached + upload type restrictions
class TestTtsUpload:
    def test_tts_cached(self, H):
        tok = H["maria"]["Authorization"].split()[1]
        r = requests.get(f"{API}/tts", params={"text": "Eu quero água.", "voice": "coral", "speed": 1.0, "token": tok}, timeout=60)
        assert r.status_code == 200 and r.headers["content-type"].startswith("audio/mpeg")

    def test_tts_unauth(self):
        assert requests.get(f"{API}/tts", params={"text": "Eu quero água."}).status_code == 401

    def test_upload_rejects_svg(self, H, cid):
        svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        r = requests.post(f"{API}/upload", headers=H["maria"], data={"comm_user_id": cid},
                          files={"file": ("x.svg", svg, "image/svg+xml")})
        assert r.status_code == 400, r.text

    def test_upload_rejects_html_and_text(self, H, cid):
        for name, ctype in [("x.html", "text/html"), ("x.txt", "text/plain"), ("x.pdf", "application/pdf")]:
            r = requests.post(f"{API}/upload", headers=H["maria"], data={"comm_user_id": cid},
                              files={"file": (name, b"<html>hi</html>", ctype)})
            assert r.status_code == 400, (ctype, r.status_code, r.text)

    def test_upload_png_and_files_nosniff(self, H, cid):
        r = requests.post(f"{API}/upload", headers=H["maria"], data={"comm_user_id": cid},
                          files={"file": ("p.png", PNG_1x1, "image/png")})
        if r.status_code in (402, 502, 503):
            pytest.skip(f"storage unavailable: {r.status_code} {r.text}")
        assert r.status_code == 200, r.text
        path = r.json()["path"]
        f = requests.get(f"{API}/files/{path}", headers=H["maria"])
        assert f.status_code == 200
        assert f.headers.get("x-content-type-options") == "nosniff"
        assert f.headers["content-type"].startswith("image/png")
        # linked member can read, unauthenticated cannot
        assert requests.get(f"{API}/files/{path}", headers=H["carlos"]).status_code == 200
        assert requests.get(f"{API}/files/{path}").status_code == 401


# ---- SEC-004: links privacy
class TestLinksPrivacy:
    @pytest.mark.parametrize("who", ["carlos", "ana", "jose"])
    def test_non_responsavel_hidden_emails(self, H, cid, who):
        links = requests.get(f"{API}/comm-users/{cid}/links", headers=H[who]).json()
        assert len(links) >= 4
        for lk in links:
            if lk["is_me"]:
                assert lk["member_email"] == f"{who}@minhavoz.com" and lk["member_username"] == who
            else:
                assert lk["member_email"] is None and lk["member_username"] is None
                assert lk["member_name"]

    def test_responsavel_sees_all(self, H, cid):
        links = requests.get(f"{API}/comm-users/{cid}/links", headers=H["maria"]).json()
        emails = {lk["member_email"] for lk in links}
        for n in ["maria", "carlos", "ana", "jose"]:
            assert f"{n}@minhavoz.com" in emails
