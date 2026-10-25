# Minha Voz backend regression tests (auth, permissions, board, CRUD, history, stats, tts)
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
PWD = "senha123"


def login(email, pwd=PWD):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def H():
    return {k: login(f"{k}@minhavoz.com") for k in ["maria", "carlos", "ana", "jose"]}


@pytest.fixture(scope="session")
def cid(H):
    r = requests.get(f"{API}/comm-users", headers=H["maria"])
    assert r.status_code == 200
    joao = [c for c in r.json() if c["name"].startswith("João")]
    assert joao, r.json()
    return joao[0]["id"]


# ---- Auth
class TestAuth:
    def test_register_role_me_forgot_reset(self):
        u = f"test_{uuid.uuid4().hex[:6]}"
        email = f"{u}@example.com"
        r = requests.post(f"{API}/auth/register", json={"full_name": "TEST User", "username": u, "email": email,
                                                         "password": "abc123", "accept_terms": True})
        assert r.status_code == 200, r.text
        tok = {"Authorization": f"Bearer {r.json()['token']}"}
        assert r.json()["user"]["role"] is None
        # duplicate
        r2 = requests.post(f"{API}/auth/register", json={"full_name": "TEST User", "username": u + "x", "email": email,
                                                          "password": "abc123", "accept_terms": True})
        assert r2.status_code == 409
        r = requests.put(f"{API}/auth/role", json={"role": "cuidador"}, headers=tok)
        assert r.status_code == 200 and r.json()["role"] == "cuidador"
        me = requests.get(f"{API}/auth/me", headers=tok).json()
        assert me["email"] == email and me["role"] == "cuidador" and "password_hash" not in me
        # forgot no longer returns the code (SEC-001); 200 if email sent, 503 if email provider out of credits
        f = requests.post(f"{API}/auth/forgot", json={"email": email})
        assert f.status_code in (200, 503), f.text
        assert "demo_code" not in f.json() and "code" not in f.json()
        # insert a known reset code directly in Mongo to test /reset
        from pymongo import MongoClient
        import bcrypt
        from datetime import datetime, timedelta, timezone
        from dotenv import dotenv_values
        env = dotenv_values("/app/backend/.env")
        db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
        db.password_resets.update_one({"email": email}, {"$set": {
            "email": email, "code_hash": bcrypt.hashpw(b"123456", bcrypt.gensalt(4)).decode(), "attempts": 0,
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}}, upsert=True)
        bad = requests.post(f"{API}/auth/reset", json={"email": email, "code": "000000", "new_password": "nova123"})
        assert bad.status_code == 400
        ok = requests.post(f"{API}/auth/reset", json={"email": email, "code": "123456", "new_password": "nova123"})
        assert ok.status_code == 200
        login(email, "nova123")

    def test_register_requires_terms(self):
        r = requests.post(f"{API}/auth/register", json={"full_name": "TEST", "username": "test_noterms",
                                                         "email": "test_noterms@example.com", "password": "abc123",
                                                         "accept_terms": False})
        assert r.status_code in (400, 422)

    def test_lockout_after_5_failures(self):
        email = f"test_lock_{uuid.uuid4().hex[:6]}@example.com"
        u = email.split("@")[0]
        requests.post(f"{API}/auth/register", json={"full_name": "TEST Lock", "username": u, "email": email,
                                                     "password": "abc123", "accept_terms": True})
        codes = [requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong!"}).status_code for _ in range(5)]
        assert codes == [401] * 5
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "abc123"})
        assert r.status_code == 429

    def test_me_unauthorized(self):
        assert requests.get(f"{API}/auth/me").status_code == 401


# ---- Board / permissions
class TestBoard:
    def test_board_seed(self, H, cid):
        b = requests.get(f"{API}/comm-users/{cid}/board", headers=H["maria"]).json()
        assert len(b["categories"]) == 9
        assert len(b["pictograms"]) >= 102
        assert len(b["quick_phrases"]) >= 11
        assert any(a["title"].startswith("Leitura") for a in b["activities"])

    def test_unlinked_user_403(self, cid):
        u = f"test_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/auth/register", json={"full_name": "TEST X", "username": u, "email": f"{u}@example.com",
                                                         "password": "abc123", "accept_terms": True})
        tok = {"Authorization": f"Bearer {r.json()['token']}"}
        assert requests.get(f"{API}/comm-users/{cid}/board", headers=tok).status_code == 403

    def test_prof_terap_cannot_create_pictogram(self, H, cid):
        for who in ["carlos", "ana"]:
            r = requests.post(f"{API}/comm-users/{cid}/pictograms", headers=H[who],
                              json={"name": "TEST_x", "category_key": "pessoas", "emoji": "😀"})
            assert r.status_code == 403, who

    def test_pictogram_crud_move(self, H, cid):
        r = requests.post(f"{API}/comm-users/{cid}/pictograms", headers=H["maria"],
                          json={"name": "TEST_Bola", "category_key": "pessoas", "emoji": "⚽", "speech_text": "bola"})
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        assert requests.post(f"{API}/pictograms/{pid}/move", headers=H["maria"], json={"direction": "up"}).status_code == 200
        u = requests.put(f"{API}/pictograms/{pid}", headers=H["maria"], json={"name": "TEST_Bola2", "favorite": True})
        assert u.json()["name"] == "TEST_Bola2" and u.json()["favorite"] is True
        b = requests.get(f"{API}/comm-users/{cid}/board", headers=H["maria"]).json()
        p = [x for x in b["pictograms"] if x["id"] == pid][0]
        assert p["name"] == "TEST_Bola2"
        assert requests.delete(f"{API}/pictograms/{pid}", headers=H["maria"]).status_code == 200
        assert requests.put(f"{API}/pictograms/{pid}", headers=H["maria"], json={"name": "z"}).status_code == 404

    def test_category_crud_delete_blocked(self, H, cid):
        c = requests.post(f"{API}/comm-users/{cid}/categories", headers=H["maria"], json={"name": "TEST_Cat", "emoji": "⭐"}).json()
        p = requests.post(f"{API}/comm-users/{cid}/pictograms", headers=H["maria"],
                          json={"name": "TEST_P", "category_key": c["key"], "emoji": "⭐"}).json()
        assert requests.delete(f"{API}/categories/{c['id']}", headers=H["maria"]).status_code == 400
        requests.delete(f"{API}/pictograms/{p['id']}", headers=H["maria"])
        assert requests.put(f"{API}/categories/{c['id']}", headers=H["maria"], json={"name": "TEST_Cat2"}).json()["name"] == "TEST_Cat2"
        assert requests.delete(f"{API}/categories/{c['id']}", headers=H["maria"]).status_code == 200

    def test_phrases_crud(self, H, cid):
        ph = requests.post(f"{API}/comm-users/{cid}/phrases", headers=H["maria"], json={"text": "TEST_frase"}).json()
        assert requests.put(f"{API}/phrases/{ph['id']}", headers=H["maria"], json={"favorite": True}).json()["favorite"]
        assert requests.delete(f"{API}/phrases/{ph['id']}", headers=H["maria"]).status_code == 200


# ---- Activities / routines / links
class TestSchool:
    def test_activity_permissions(self, H, cid):
        r = requests.post(f"{API}/comm-users/{cid}/activities", headers=H["carlos"],
                          json={"title": "TEST_Ativ", "instruction": "Leia o texto"})
        assert r.status_code == 200, r.text
        aid = r.json()["id"]
        assert r.json()["display_text"] == "Leia o texto"
        assert requests.post(f"{API}/comm-users/{cid}/activities", headers=H["ana"],
                             json={"title": "TEST_no", "instruction": "x"}).status_code == 403
        assert requests.put(f"{API}/activities/{aid}", headers=H["carlos"], json={"active": False}).json()["active"] is False
        lst = requests.get(f"{API}/comm-users/{cid}/activities", headers=H["ana"]).json()
        assert any(a["id"] == aid for a in lst)
        assert requests.delete(f"{API}/activities/{aid}", headers=H["carlos"]).status_code == 200

    def test_routine_crud_toggle_reset(self, H, cid):
        r = requests.post(f"{API}/comm-users/{cid}/routines", headers=H["maria"],
                          json={"title": "TEST_Rot", "context": "escola", "steps": [{"label": "A"}, {"label": "B"}]}).json()
        sid = r["steps"][0]["id"]
        t = requests.post(f"{API}/routines/{r['id']}/steps/{sid}/toggle", headers=H["jose"]).json()
        assert t["steps"][0]["done"] is True
        rs = requests.post(f"{API}/routines/{r['id']}/reset", headers=H["maria"]).json()
        assert all(not s["done"] for s in rs["steps"])
        assert requests.post(f"{API}/comm-users/{cid}/routines", headers=H["ana"],
                             json={"title": "TEST_x", "steps": []}).status_code == 403
        assert requests.delete(f"{API}/routines/{r['id']}", headers=H["maria"]).status_code == 200

    def test_links(self, H, cid):
        links = requests.get(f"{API}/comm-users/{cid}/links", headers=H["maria"]).json()
        names = " ".join(lk["member_name"] or "" for lk in links)
        for n in ["Maria", "José", "Carlos", "Ana"]:
            assert n in names
        u = f"test_{uuid.uuid4().hex[:6]}"
        reg = requests.post(f"{API}/auth/register", json={"full_name": "TEST Link", "username": u, "email": f"{u}@example.com",
                                                           "password": "abc123", "accept_terms": True}).json()
        tok = {"Authorization": f"Bearer {reg['token']}"}
        assert requests.post(f"{API}/comm-users/{cid}/links", headers=H["maria"], json={"identifier": u}).status_code == 400
        requests.put(f"{API}/auth/role", json={"role": "cuidador"}, headers=tok)
        assert requests.post(f"{API}/comm-users/{cid}/links", headers=H["jose"], json={"identifier": u}).status_code == 403
        lk = requests.post(f"{API}/comm-users/{cid}/links", headers=H["maria"], json={"identifier": u})
        assert lk.status_code == 200
        assert requests.post(f"{API}/comm-users/{cid}/links", headers=H["maria"], json={"identifier": u}).status_code == 409
        assert requests.delete(f"{API}/links/{lk.json()['id']}", headers=H["carlos"]).status_code == 403
        assert requests.delete(f"{API}/links/{lk.json()['id']}", headers=H["maria"]).status_code == 200


# ---- Comm users / sessions / history / stats / tts
class TestUsage:
    def test_comm_user_create_seeds(self, H):
        r = requests.post(f"{API}/comm-users", headers=H["carlos"], json={"name": "TEST_x"})
        assert r.status_code == 403
        cu = requests.post(f"{API}/comm-users", headers=H["jose"], json={"name": "TEST_Pedro"}).json()
        b = requests.get(f"{API}/comm-users/{cu['id']}/board", headers=H["jose"]).json()
        assert len(b["categories"]) == 9 and len(b["pictograms"]) == 102 and len(b["quick_phrases"]) == 11
        up = requests.put(f"{API}/comm-users/{cu['id']}/settings", headers=H["jose"], json={"grid_columns": 4})
        assert up.json()["grid_columns"] == 4

    def test_session_events_history_stats(self, H, cid):
        s = requests.post(f"{API}/comm-users/{cid}/sessions/start", headers=H["maria"]).json()
        ev = requests.post(f"{API}/comm-users/{cid}/events", headers=H["maria"],
                           json={"events": [{"text": "TEST_Eu quero água.", "source": "prancha", "session_id": s["id"]}]})
        assert ev.json()["stored"] == 1
        assert requests.post(f"{API}/sessions/{s['id']}/end", headers=H["maria"], json={}).json()["ok"]
        h = requests.get(f"{API}/comm-users/{cid}/history", headers=H["ana"]).json()
        assert any(e["text"] == "TEST_Eu quero água." for e in h)
        st = requests.get(f"{API}/comm-users/{cid}/stats", headers=H["ana"])
        assert st.status_code == 200 and isinstance(st.json(), dict)

    def test_tts(self, H):
        tok = H["maria"]["Authorization"].split()[1]
        r = requests.get(f"{API}/tts", params={"text": "Eu quero água.", "voice": "coral", "speed": 1.0, "token": tok}, timeout=60)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("audio/mpeg") and len(r.content) > 1000
