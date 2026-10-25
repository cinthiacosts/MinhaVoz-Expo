# Minha Voz iteration-4 follow-up tests: forgot no-enumeration (always 200), per-IP forgot limit, atomic reset attempts
import os
import time
import uuid
import concurrent.futures as cf
from datetime import datetime, timedelta, timezone

import bcrypt
import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ENV = dotenv_values("/app/backend/.env")
DB = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]
GENERIC = "Se o e-mail estiver cadastrado, enviamos um código de recuperação."


def fake_ip():
    return f"10.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}"


def register_user():
    u = f"test_{uuid.uuid4().hex[:8]}"
    email = f"{u}@example.com"
    r = requests.post(f"{API}/auth/register", json={"full_name": "TEST User", "username": u, "email": email,
                                                     "password": "abc123", "accept_terms": True})
    assert r.status_code == 200, r.text
    return email, {"Authorization": f"Bearer {r.json()['token']}"}


def put_reset(email, code="123456", attempts=0):
    DB.password_resets.update_one({"email": email}, {"$set": {
        "email": email, "code_hash": bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode(),
        "attempts": attempts, "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}}, upsert=True)


# Tests use unique fake IPs / emails, so no global rate-limit clearing here (it would race with xdist workers).
# Run tests/clear_forgot_limits.py before the suite.


# ---- forgot: no account enumeration
class TestForgotNoEnumeration:
    def test_existing_email_returns_200_generic(self):
        email, _ = register_user()
        r = requests.post(f"{API}/auth/forgot", json={"email": email}, headers={"X-Forwarded-For": fake_ip()})
        assert r.status_code == 200, r.text
        assert r.json() == {"message": GENERIC}
        assert DB.password_resets.find_one({"email": email}) is not None

    def test_seeded_and_unknown_identical(self):
        a = requests.post(f"{API}/auth/forgot", json={"email": "maria@minhavoz.com"}, headers={"X-Forwarded-For": fake_ip()})
        b = requests.post(f"{API}/auth/forgot", json={"email": f"nobody_{uuid.uuid4().hex[:6]}@example.com"},
                          headers={"X-Forwarded-For": fake_ip()})
        assert a.status_code == b.status_code == 200
        assert a.json() == b.json() == {"message": GENERIC}
        DB.password_resets.delete_one({"email": "maria@minhavoz.com"})

    def test_timing_difference_informational(self):
        # Informational: existing-email path does bcrypt + email provider call
        email, _ = register_user()
        t_known, t_unknown = [], []
        for _ in range(3):
            s = time.time(); requests.post(f"{API}/auth/forgot", json={"email": email}, headers={"X-Forwarded-For": fake_ip()}); t_known.append(time.time() - s)
            s = time.time(); requests.post(f"{API}/auth/forgot", json={"email": f"nobody_{uuid.uuid4().hex[:6]}@example.com"}, headers={"X-Forwarded-For": fake_ip()}); t_unknown.append(time.time() - s)
        print(f"TIMING known={sorted(t_known)} unknown={sorted(t_unknown)}")


# ---- forgot: rate limits
class TestForgotRateLimit:
    def test_per_ip_limit_10_per_hour(self):
        ip = fake_ip()
        codes = [requests.post(f"{API}/auth/forgot", json={"email": f"nobody_{uuid.uuid4().hex[:6]}@example.com"},
                               headers={"X-Forwarded-For": ip}).status_code for _ in range(11)]
        print("per-ip codes:", codes)
        assert codes[:10] == [200] * 10
        assert codes[10] == 429

    def test_per_email_limit_still_3(self):
        email = f"nobody_{uuid.uuid4().hex[:6]}@example.com"
        codes = [requests.post(f"{API}/auth/forgot", json={"email": email}, headers={"X-Forwarded-For": fake_ip()}).status_code
                 for _ in range(4)]
        assert codes == [200, 200, 200, 429]

    def test_xff_spoof_bypasses_ip_limit(self):
        # SECURITY CHECK: rotating a client-supplied X-Forwarded-For should NOT bypass the per-IP limit
        codes = [requests.post(f"{API}/auth/forgot", json={"email": f"nobody_{uuid.uuid4().hex[:6]}@example.com"},
                               headers={"X-Forwarded-For": fake_ip()}).status_code for _ in range(12)]
        print("spoofed-xff codes:", codes)
        assert 429 in codes, "per-IP limit bypassed by rotating X-Forwarded-For header"


# ---- reset: atomic attempts
class TestResetAtomic:
    def test_concurrent_wrong_attempts_capped(self):
        email, _ = register_user()
        put_reset(email)

        def wrong(_):
            return requests.post(f"{API}/auth/reset", json={"email": email, "code": "000000", "new_password": "nova123"}).status_code

        with cf.ThreadPoolExecutor(max_workers=15) as ex:
            codes = list(ex.map(wrong, range(15)))
        assert all(c == 400 for c in codes)
        rec = DB.password_resets.find_one({"email": email})
        assert rec is None or rec["attempts"] <= 5, rec
        r = requests.post(f"{API}/auth/reset", json={"email": email, "code": "123456", "new_password": "nova123"})
        assert r.status_code == 400
        assert DB.password_resets.find_one({"email": email}) is None

    def test_concurrent_correct_code_single_use(self):
        email, tok = register_user()
        put_reset(email)

        def right(i):
            return requests.post(f"{API}/auth/reset", json={"email": email, "code": "123456", "new_password": f"nova12{i}"}).status_code

        with cf.ThreadPoolExecutor(max_workers=5) as ex:
            codes = list(ex.map(right, range(5)))
        print("concurrent correct codes:", codes)
        assert codes.count(200) >= 1
        assert requests.get(f"{API}/auth/me", headers=tok).status_code == 401
        if codes.count(200) > 1:
            pytest.fail(f"reset code accepted {codes.count(200)} times concurrently (not single-use): {codes}")

    def test_expired_code_rejected(self):
        email, _ = register_user()
        DB.password_resets.update_one({"email": email}, {"$set": {
            "email": email, "code_hash": bcrypt.hashpw(b"123456", bcrypt.gensalt()).decode(), "attempts": 0,
            "expires_at": (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()}}, upsert=True)
        r = requests.post(f"{API}/auth/reset", json={"email": email, "code": "123456", "new_password": "nova123"})
        assert r.status_code == 400 and r.json()["detail"] == "Código inválido ou expirado"

    def test_unknown_email_reset_400(self):
        r = requests.post(f"{API}/auth/reset", json={"email": f"nobody_{uuid.uuid4().hex[:6]}@example.com",
                                                     "code": "123456", "new_password": "nova123"})
        assert r.status_code == 400
