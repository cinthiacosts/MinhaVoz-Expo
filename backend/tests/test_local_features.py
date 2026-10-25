"""Integration regressions using an ephemeral database, never minhavoz_dev."""
import base64
import os
import secrets
import sys
import tempfile
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient

TEST_DB = "minhavoz_verification_" + uuid.uuid4().hex
TMP = tempfile.TemporaryDirectory(prefix="minhavoz-images-")
os.environ.update(MONGO_URL="mongodb://127.0.0.1:27018", DB_NAME=TEST_DB,
                  JWT_SECRET=secrets.token_urlsafe(48), EMERGENT_EMAIL_KEY="test-placeholder",
                  EMAIL_FROM_NAME="Teste local", LOCAL_UPLOAD_DIR=TMP.name)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=")


@pytest.fixture(scope="module")
def client():
    try:
        with TestClient(server.app) as c:
            yield c
    finally:
        assert TEST_DB.startswith("minhavoz_verification_")
        dbclient = MongoClient("mongodb://127.0.0.1:27018")
        dbclient.drop_database(TEST_DB)
        dbclient.close()
        TMP.cleanup()


def account(client, role):
    suffix = uuid.uuid4().hex[:12]
    response = client.post("/api/auth/register", json={"full_name": "Teste " + role,
        "username": "test_" + suffix, "email": suffix + "@example.com",
        "password": secrets.token_urlsafe(16), "accept_terms": True})
    assert response.status_code == 200
    auth = {"Authorization": "Bearer " + response.json()["token"]}
    assert client.put("/api/auth/role", headers=auth, json={"role": role}).status_code == 200
    return auth, response.json()["user"]


def profile(client, auth, **extra):
    res = client.post("/api/comm-users", headers=auth, json={"name": "Perfil de teste", **extra})
    assert res.status_code == 200, res.text
    return res.json()["id"]


def test_explicit_cors(client):
    for origin in ("http://localhost:3000", "http://127.0.0.1:3000"):
        r = client.options("/api/auth/login", headers={"Origin": origin,
            "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"})
        assert r.status_code == 200
        assert r.headers["access-control-allow-origin"] == origin
    r = client.options("/api/auth/login", headers={"Origin": "https://untrusted.example",
        "Access-Control-Request-Method": "POST"})
    assert r.status_code == 400
    assert "access-control-allow-origin" not in r.headers


def test_private_local_upload_and_optional_photo(client):
    owner, _ = account(client, "responsavel")
    stranger, _ = account(client, "responsavel")
    profile(client, owner)  # photo remains optional
    upload = client.post("/api/upload", headers=owner, files={"file": ("photo.png", PNG, "image/png")})
    assert upload.status_code == 200, upload.text
    path = upload.json()["path"]
    assert path.startswith("local/")
    cid = profile(client, owner, photo_path=path)
    assert client.get("/api/files/" + path).status_code == 401
    assert client.get("/api/files/" + path, headers=stranger).status_code == 403
    image = client.get("/api/files/" + path, headers=owner)
    assert image.status_code == 200 and image.content == PNG
    assert image.headers["x-content-type-options"] == "nosniff"
    assert client.get(f"/api/comm-users/{cid}", headers=stranger).status_code == 403
    assert client.post("/api/upload", headers=owner,
        files={"file": ("spoof.png", b"<script>bad</script>", "image/png")}).status_code == 400
    assert client.post("/api/upload", headers=owner,
        files={"file": ("large.png", PNG + b"x" * (8 * 1024 * 1024), "image/png")}).status_code == 400


def test_local_path_traversal_rejected():
    from local_storage import resolve_image
    from fastapi import HTTPException
    for path in ("local/../../.env", "local/../server.py", "local/x.svg"):
        with pytest.raises(HTTPException):
            resolve_image(path)


def linked_account(client, owner, cid, role):
    auth, user = account(client, role)
    invite = client.post(f"/api/comm-users/{cid}/invitations", headers=owner,
                         json={"identifier": user["email"], "role": role})
    assert invite.status_code == 200, invite.text
    iid = invite.json()["id"]
    assert client.get(f"/api/comm-users/{cid}/board", headers=auth).status_code == 403
    assert client.post(f"/api/invitations/{iid}/accept", headers=auth).status_code == 200
    return auth, user, iid


def test_invitation_requires_both_parties_and_revocation(client):
    owner, _ = account(client, "responsavel")
    cid = profile(client, owner)
    target, target_user = account(client, "professor")
    stranger, _ = account(client, "responsavel")
    r = client.post(f"/api/comm-users/{cid}/invitations", headers=owner,
                    json={"identifier": target_user["email"], "role": "professor"})
    assert r.status_code == 200
    iid = r.json()["id"]
    assert client.get(f"/api/comm-users/{cid}/board", headers=target).status_code == 403
    assert client.post(f"/api/invitations/{iid}/accept", headers=stranger).status_code == 404
    # Changing the account type cannot change the explicitly granted link role.
    client.put("/api/auth/role", headers=target, json={"role": "responsavel"})
    assert client.post(f"/api/invitations/{iid}/accept", headers=target).status_code == 200
    assert client.get(f"/api/comm-users/{cid}", headers=target).json()["my_role"] == "professor"
    assert client.post(f"/api/comm-users/{cid}/pictograms", headers=target,
                       json={"name": "Não autorizado", "category_key": "pessoas"}).status_code == 403
    assert client.post(f"/api/invitations/{iid}/accept", headers=target).status_code == 404
    links = client.get(f"/api/comm-users/{cid}/links", headers=owner).json()
    lid = next(row["id"] for row in links if row["member_id"] == target_user["id"])
    assert client.delete(f"/api/links/{lid}", headers=owner).status_code == 200
    assert client.get(f"/api/comm-users/{cid}/board", headers=target).status_code == 403
    assert client.post(f"/api/invitations/{iid}/accept", headers=target).status_code == 404


def test_therapy_private_default_explicit_excerpt_and_revoke(client):
    owner, _ = account(client, "responsavel")
    cid = profile(client, owner)
    therapist, _, _ = linked_account(client, owner, cid, "terapeuta")
    peer, _, _ = linked_account(client, owner, cid, "terapeuta")
    caregiver, _, _ = linked_account(client, owner, cid, "cuidador")
    teacher, _, _ = linked_account(client, owner, cid, "professor")
    private_text = "Observação privada que não deve sair para a rede"
    created = client.post(f"/api/comm-users/{cid}/therapy-notes", headers=therapist,
                          json={"title": "Privado", "text": private_text})
    assert created.status_code == 200
    nid = created.json()["id"]
    for auth in (owner, peer, caregiver, teacher):
        assert client.get(f"/api/therapy-notes/{nid}", headers=auth).status_code == 404
        assert client.get(f"/api/comm-users/{cid}/therapy-notes", headers=auth).json() == []
        assert client.put(f"/api/therapy-notes/{nid}/sharing", headers=auth,
                          json={"roles": ["responsavel"], "title": "Invasão", "text": "x"}).status_code == 404
    board = client.get(f"/api/comm-users/{cid}/board", headers=owner)
    assert private_text not in board.text and "therapy_notes" not in board.json()
    assert client.put(f"/api/therapy-notes/{nid}/sharing", headers=therapist,
        json={"roles": ["responsavel"], "title": "Sugestão", "text": "Praticar os favoritos juntos"}).status_code == 200
    shared = client.get(f"/api/therapy-notes/{nid}", headers=owner)
    assert shared.status_code == 200 and shared.json()["text"] == "Praticar os favoritos juntos"
    assert private_text not in shared.text and "author_id" not in shared.json()
    assert client.get(f"/api/therapy-notes/{nid}", headers=caregiver).status_code == 404
    assert client.get(f"/api/therapy-notes/{nid}", headers=peer).status_code == 404
    assert client.put(f"/api/therapy-notes/{nid}/sharing", headers=therapist, json={"roles": []}).status_code == 200
    assert client.get(f"/api/therapy-notes/{nid}", headers=owner).status_code == 404


def test_school_audience_completion_and_permissions(client):
    owner, _ = account(client, "responsavel")
    cid = profile(client, owner)
    teacher, _, _ = linked_account(client, owner, cid, "professor")
    therapist, _, _ = linked_account(client, owner, cid, "terapeuta")
    stranger, _ = account(client, "professor")
    body = {"title": "Leitura", "instruction": "Abra o livro"}
    assert client.post(f"/api/comm-users/{cid}/activities", headers=stranger, json=body).status_code == 403
    assert client.post(f"/api/comm-users/{cid}/activities", headers=therapist, json=body).status_code == 403
    a = client.post(f"/api/comm-users/{cid}/activities", headers=teacher, json=body).json()
    assert a["status"] == "pendente"
    notice = client.post(f"/api/comm-users/{cid}/activities", headers=teacher,
        json={**body, "kind": "aviso", "audience": "rede"}).json()
    board = client.get(f"/api/comm-users/{cid}/board", headers=owner).json()
    assert a["id"] in [x["id"] for x in board["activities"]]
    assert notice["id"] not in [x["id"] for x in board["activities"]]
    assert len(client.get(f"/api/comm-users/{cid}/activities", headers=owner).json()) == 2
    assert client.put(f"/api/activities/{a['id']}/status", headers=owner,
                      json={"status": "realizada"}).status_code == 200
    assert client.put(f"/api/activities/{a['id']}/status", headers=stranger,
                      json={"status": "realizada"}).status_code == 403


def test_tts_no_emergent_import_or_external_generation(client):
    auth, _ = account(client, "responsavel")
    assert client.get("/api/tts", params={"text": "Olá"}, headers=auth).status_code == 410


def test_image_shared_by_profile_then_revoked(client):
    owner, _ = account(client, "responsavel")
    uploaded = client.post("/api/upload", headers=owner, files={"file": ("photo.png", PNG, "image/png")}).json()
    cid = profile(client, owner, photo_path=uploaded["path"])
    member, user, _ = linked_account(client, owner, cid, "cuidador")
    assert client.get("/api/files/" + uploaded["path"], headers=member).status_code == 200
    links = client.get(f"/api/comm-users/{cid}/links", headers=owner).json()
    lid = next(row["id"] for row in links if row["member_id"] == user["id"])
    client.delete(f"/api/links/{lid}", headers=owner)
    assert client.get("/api/files/" + uploaded["path"], headers=member).status_code == 403
    other_cid = profile(client, owner)
    assert client.put(f"/api/comm-users/{other_cid}", headers=owner,
                      json={"name": "Outro", "photo_path": uploaded["path"]}).status_code == 403


def test_cancel_decline_and_central_profile_no_child_account(client):
    owner, _ = account(client, "responsavel")
    connection = MongoClient("mongodb://127.0.0.1:27018")
    before = connection[TEST_DB].users.count_documents({})
    cid = profile(client, owner)
    assert connection[TEST_DB].users.count_documents({}) == before
    connection.close()
    board = client.get(f"/api/comm-users/{cid}/board", headers=owner).json()
    assert any(p["name"] == "Eu" for p in board["pictograms"])
    assert all(p["name"] != "UE" for p in board["pictograms"])
    target, user = account(client, "terapeuta")
    data = {"identifier": user["email"], "role": "terapeuta"}
    iid = client.post(f"/api/comm-users/{cid}/invitations", headers=owner, json=data).json()["id"]
    assert client.delete(f"/api/invitations/{iid}", headers=owner).status_code == 200
    assert client.post(f"/api/invitations/{iid}/accept", headers=target).status_code == 404
    iid = client.post(f"/api/comm-users/{cid}/invitations", headers=owner, json=data).json()["id"]
    assert client.post(f"/api/invitations/{iid}/decline", headers=target).status_code == 200
    assert client.post(f"/api/invitations/{iid}/accept", headers=target).status_code == 404
    assert client.get(f"/api/comm-users/{cid}", headers=target).status_code == 403


def test_teacher_global_history_denied_and_school_provenance_enforced(client):
    owner, _ = account(client, "responsavel")
    cid = profile(client, owner, notes="Informação clínica privada", preferences="Preferência familiar", birth_date="01/01/2010")
    teacher, _, _ = linked_account(client, owner, cid, "professor")
    colleague, _, _ = linked_account(client, owner, cid, "professor")
    stranger, _ = account(client, "professor")
    home_session = client.post(f"/api/comm-users/{cid}/sessions/start", headers=owner).json()["id"]
    school_session = client.post(f"/api/comm-users/{cid}/sessions/start", headers=teacher).json()["id"]
    def event(auth, text, source, **extra):
        return client.post(f"/api/comm-users/{cid}/events", headers=auth,
                           json={"events": [{"text": text, "source": source, **extra}]})
    assert event(owner, "CASA_PRIVADO", "escola", context="escola").status_code == 200
    assert event(colleague, "OUTRO_PROFESSOR", "texto").status_code == 200
    assert event(teacher, "ESCOLA_PROPRIA", "texto", session_id=school_session).status_code == 200
    assert event(teacher, "SESSAO_FORJADA", "escola", session_id=home_session).status_code == 403
    assert client.post(f"/api/sessions/{home_session}/end", headers=teacher, json={}).status_code == 403
    assert client.post(f"/api/sessions/{school_session}/end", headers=teacher, json={}).status_code == 200
    # Legacy origin/source alone is insufficient evidence for disclosure.
    connection = MongoClient("mongodb://127.0.0.1:27018")
    connection[TEST_DB].history.insert_one({"id": uuid.uuid4().hex, "comm_user_id": cid,
        "source": "escola", "text": "LEGADO_SEM_CONTEXTO", "created_at": server.iso(server.now())})
    connection.close()
    for suffix in ("history", "history?context=escola", "stats", "stats?scope=school"):
        assert client.get(f"/api/comm-users/{cid}/{suffix}", headers=teacher).status_code == 403
    result = client.get(f"/api/comm-users/{cid}/school/history", headers=teacher)
    assert result.status_code == 200
    assert [e["text"] for e in result.json()] == ["ESCOLA_PROPRIA"]
    stats = client.get(f"/api/comm-users/{cid}/school/stats", headers=teacher)
    assert stats.status_code == 200 and stats.json()["my_school_phrases"] == 1
    assert set(stats.json()) == {"scope", "days", "my_school_phrases", "pending_activities", "completed_activities"}
    assert client.get(f"/api/comm-users/{cid}/school/history", headers=stranger).status_code == 403
    assert client.get(f"/api/comm-users/{cid}/school/stats", headers=stranger).status_code == 403
    assert client.get(f"/api/comm-users/{cid}/history", headers=owner).status_code == 200
    assert client.get(f"/api/comm-users/{cid}/stats", headers=owner).status_code == 200
    for path in (f"/api/comm-users/{cid}", f"/api/comm-users/{cid}/board"):
        response = client.get(path, headers=teacher)
        assert response.status_code == 200 and "Informação clínica privada" not in response.text
        obj = response.json().get("comm_user", response.json())
        assert not set(obj) & {"notes", "preferences", "birth_date", "created_by"}


def test_teacher_network_minimized_and_therapy_sharing_explicit(client):
    owner, _ = account(client, "responsavel")
    cid = profile(client, owner)
    teacher, _, _ = linked_account(client, owner, cid, "professor")
    therapist, _, _ = linked_account(client, owner, cid, "terapeuta")
    stranger, stranger_user = account(client, "cuidador")
    owner_links = client.get(f"/api/comm-users/{cid}/links", headers=owner).json()
    rows = client.get(f"/api/comm-users/{cid}/links", headers=teacher).json()
    assert len(rows) == 1 and rows[0]["is_me"] and rows[0]["role"] == "professor"
    assert set(rows[0]) == {"id", "role", "is_me"}
    assert client.get(f"/api/comm-users/{cid}/invitations", headers=teacher).status_code == 403
    body = {"identifier": stranger_user["email"], "role": "cuidador"}
    for route in ("links", "invitations"):
        assert client.post(f"/api/comm-users/{cid}/{route}", headers=teacher, json=body).status_code == 403
    for link in owner_links:
        assert client.delete(f"/api/links/{link['id']}", headers=teacher).status_code == 403
    note = client.post(f"/api/comm-users/{cid}/therapy-notes", headers=therapist,
                       json={"title": "Clínico privado", "text": "ORIGINAL_PRIVADO"}).json()
    nid = note["id"]
    assert client.get(f"/api/therapy-notes/{nid}", headers=teacher).status_code == 404
    assert client.get(f"/api/comm-users/{cid}/therapy-notes", headers=teacher).json() == []
    client.put(f"/api/therapy-notes/{nid}/sharing", headers=therapist,
        json={"roles": ["responsavel"], "title": "Família", "text": "TRECHO_SO_FAMILIA"})
    assert client.get(f"/api/therapy-notes/{nid}", headers=teacher).status_code == 404
    client.put(f"/api/therapy-notes/{nid}/sharing", headers=therapist,
        json={"roles": ["professor"], "title": "Escola", "text": "TRECHO_ESCOLAR_AUTORIZADO"})
    shared = client.get(f"/api/comm-users/{cid}/therapy-notes", headers=teacher)
    assert len(shared.json()) == 1 and shared.json()[0]["text"] == "TRECHO_ESCOLAR_AUTORIZADO"
    assert "ORIGINAL_PRIVADO" not in shared.text and "Clínico privado" not in shared.text
    assert client.put(f"/api/therapy-notes/{nid}/sharing", headers=teacher, json={"roles": ["professor"]}).status_code == 404
    client.put(f"/api/therapy-notes/{nid}/sharing", headers=therapist, json={"roles": []})
    assert client.get(f"/api/therapy-notes/{nid}", headers=teacher).status_code == 404


def test_teacher_context_editing_and_unlinked_school_access(client):
    owner, _ = account(client, "responsavel")
    cid = profile(client, owner)
    teacher, _, _ = linked_account(client, owner, cid, "professor")
    other_teacher, _, _ = linked_account(client, owner, cid, "professor")
    stranger, _ = account(client, "professor")
    def routine(context):
        return {"title": "Rotina " + context, "context": context, "steps": [{"label": "Etapa"}]}
    home = client.post(f"/api/comm-users/{cid}/routines", headers=owner, json=routine("casa")).json()
    therapy = client.post(f"/api/comm-users/{cid}/routines", headers=owner, json=routine("terapia")).json()
    for context in ("casa", "terapia", "outro"):
        assert client.post(f"/api/comm-users/{cid}/routines", headers=teacher, json=routine(context)).status_code == 403
    school = client.post(f"/api/comm-users/{cid}/routines", headers=teacher, json=routine("escola")).json()
    for r in (home, therapy):
        rid = r["id"]
        assert client.put(f"/api/routines/{rid}", headers=teacher, json=routine("escola")).status_code == 403
        assert client.delete(f"/api/routines/{rid}", headers=teacher).status_code == 403
        assert client.post(f"/api/routines/{rid}/reset", headers=teacher).status_code == 403
        assert client.post(f"/api/routines/{rid}/steps/{r['steps'][0]['id']}/toggle", headers=teacher).status_code == 403
    assert client.put(f"/api/routines/{school['id']}", headers=teacher, json=routine("casa")).status_code == 403
    assert [r["id"] for r in client.get(f"/api/comm-users/{cid}/routines", headers=teacher).json()] == [school["id"]]
    assert [r["id"] for r in client.get(f"/api/comm-users/{cid}/board", headers=teacher).json()["routines"]] == [school["id"]]
    global_phrase = client.post(f"/api/comm-users/{cid}/phrases", headers=owner, json={"text": "Frase familiar"}).json()
    own_phrase = client.post(f"/api/comm-users/{cid}/phrases", headers=teacher, json={"text": "Frase escolar"}).json()
    for auth, ph, allowed in ((teacher, global_phrase, False), (other_teacher, own_phrase, False), (teacher, own_phrase, True)):
        res = client.put(f"/api/phrases/{ph['id']}", headers=auth, json={"text": "Editada"})
        assert res.status_code == (200 if allowed else 403)
    assert client.delete(f"/api/phrases/{global_phrase['id']}", headers=teacher).status_code == 403
    for endpoint in ("board", "routines", "activities", "school/history", "school/stats", "links", "therapy-notes"):
        assert client.get(f"/api/comm-users/{cid}/{endpoint}", headers=stranger).status_code == 403


def test_caregiver_administration_denied_and_per_link_creation(client):
    owner, _ = account(client, "responsavel")
    cid = profile(client, owner, notes="DADO_CLINICO", preferences="DADO_FAMILIAR", birth_date="01/01/2010")
    care, care_user, _ = linked_account(client, owner, cid, "cuidador")
    board = client.get(f"/api/comm-users/{cid}/board", headers=care)
    assert board.status_code == 200 and "DADO_CLINICO" not in board.text and "DADO_FAMILIAR" not in board.text
    assert not set(board.json()["comm_user"]) & {"notes", "birth_date", "preferences", "created_by"}
    for endpoint in ("history", "stats", "school/history", "school/stats"):
        assert client.get(f"/api/comm-users/{cid}/{endpoint}", headers=care).status_code == 403
    assert client.delete(f"/api/comm-users/{cid}/history", headers=care).status_code == 403
    assert client.put(f"/api/comm-users/{cid}", headers=care, json={"name": "Não autorizado"}).status_code == 403
    for body in ({"history_enabled": False}, {"hidden_categories": ["pessoas"]}, {"voice": "device"}):
        assert client.put(f"/api/comm-users/{cid}/settings", headers=care, json=body).status_code == 403
    cat = board.json()["categories"][0]
    picto = board.json()["pictograms"][0]
    phrase = board.json()["quick_phrases"][0]
    requests = [
        ("POST", f"/comm-users/{cid}/categories", {"name": "Privilegiada"}),
        ("PUT", f"/categories/{cat['id']}", {"name": "Alterada"}),
        ("DELETE", f"/categories/{cat['id']}", None),
        ("POST", f"/comm-users/{cid}/pictograms", {"name": "Teste", "category_key": "pessoas"}),
        ("PUT", f"/pictograms/{picto['id']}", {"name": "Alterado"}),
        ("DELETE", f"/pictograms/{picto['id']}", None),
        ("POST", f"/pictograms/{picto['id']}/move", {"direction": "down"}),
        ("POST", f"/comm-users/{cid}/phrases", {"text": "Não autorizado"}),
        ("PUT", f"/phrases/{phrase['id']}", {"favorite": True}),
        ("DELETE", f"/phrases/{phrase['id']}", None),
    ]
    for method, path, body in requests:
        assert client.request(method, "/api" + path, headers=care, json=body).status_code == 403
    assert client.post("/api/upload", headers=care, data={"comm_user_id": cid},
                       files={"file": ("photo.png", PNG, "image/png")}).status_code == 403
    own_links = client.get(f"/api/comm-users/{cid}/links", headers=care).json()
    assert len(own_links) == 1 and set(own_links[0]) == {"id", "role", "is_me"}
    for route in ("links", "invitations"):
        assert client.post(f"/api/comm-users/{cid}/{route}", headers=care,
                           json={"identifier": "somebody@example.com", "role": "responsavel"}).status_code == 403
    assert client.get(f"/api/comm-users/{cid}/invitations", headers=care).status_code == 403
    owner_links = client.get(f"/api/comm-users/{cid}/links", headers=owner).json()
    for link in owner_links:
        assert client.delete(f"/api/links/{link['id']}", headers=care).status_code == 403
    # Only the NEW profile receives an owner link. Existing links are untouched.
    assert client.post("/api/comm-users", headers=care, json={"name": "Novo perfil"}).status_code == 400
    new = client.post("/api/comm-users", headers=care,
        json={"name": "Novo perfil sob responsabilidade", "responsibility_confirmed": True})
    assert new.status_code == 200 and new.json()["my_role"] == "responsavel"
    new_id = new.json()["id"]
    assert client.put(f"/api/comm-users/{new_id}/settings", headers=care, json={"text_size": "grande"}).status_code == 200
    assert client.get(f"/api/comm-users/{cid}", headers=care).json()["my_role"] == "cuidador"
    assert client.put(f"/api/comm-users/{cid}/settings", headers=care, json={"text_size": "grande"}).status_code == 403
    assert client.get("/api/auth/me", headers=care).json()["role"] == "cuidador"
    assert {row["id"] for row in client.get("/api/comm-users", headers=care).json()} == {cid, new_id}
    assert client.get(f"/api/comm-users/{new_id}", headers=owner).status_code == 403
    for role in ("professor", "terapeuta"):
        auth, _ = account(client, role)
        assert client.post("/api/comm-users", headers=auth,
            json={"name": "Não autorizado", "responsibility_confirmed": True}).status_code == 403


def test_caregiver_daily_routines_and_student_content_only(client):
    owner, _ = account(client, "responsavel")
    cid = profile(client, owner)
    care, _, _ = linked_account(client, owner, cid, "cuidador")
    stranger, _ = account(client, "cuidador")
    def routine(context):
        return {"title": "Rotina " + context, "context": context, "steps": [{"label": "Etapa"}]}
    routines = {context: client.post(f"/api/comm-users/{cid}/routines", headers=owner,
        json=routine(context)).json() for context in ("casa", "escola", "terapia", "outro")}
    assert client.post(f"/api/comm-users/{cid}/routines", headers=care, json=routine("casa")).status_code == 403
    for context, row in routines.items():
        rid = row["id"]
        assert client.put(f"/api/routines/{rid}", headers=care, json=routine(context)).status_code == 403
        assert client.delete(f"/api/routines/{rid}", headers=care).status_code == 403
        expected = 200 if context == "casa" else 403
        assert client.post(f"/api/routines/{rid}/steps/{row['steps'][0]['id']}/toggle", headers=care).status_code == expected
        assert client.post(f"/api/routines/{rid}/reset", headers=care).status_code == expected
    listed = client.get(f"/api/comm-users/{cid}/routines", headers=care).json()
    assert [r["context"] for r in listed] == ["casa"]
    assert "created_by" not in listed[0]
    data = {"title": "Ler", "instruction": "Leia a orientação"}
    public = client.post(f"/api/comm-users/{cid}/activities", headers=owner, json=data).json()
    admin = client.post(f"/api/comm-users/{cid}/activities", headers=owner,
                        json={**data, "audience": "rede"}).json()
    hidden = client.post(f"/api/comm-users/{cid}/activities", headers=owner,
                         json={**data, "active": False}).json()
    assert client.post(f"/api/comm-users/{cid}/activities", headers=care, json=data).status_code == 403
    for row in (public, admin, hidden):
        assert client.put(f"/api/activities/{row['id']}", headers=care, json={"title": "Alterado"}).status_code == 403
        assert client.delete(f"/api/activities/{row['id']}", headers=care).status_code == 403
        res = client.put(f"/api/activities/{row['id']}/status", headers=care, json={"status": "realizada"})
        assert res.status_code == (200 if row["id"] == public["id"] else 403)
        if res.status_code == 200:
            assert not set(res.json()) & {"created_by", "created_by_name", "status_updated_by", "status_updated_at"}
    for rows in (client.get(f"/api/comm-users/{cid}/activities", headers=care).json(),
                 client.get(f"/api/comm-users/{cid}/board", headers=care).json()["activities"]):
        assert [r["id"] for r in rows] == [public["id"]]
        assert not set(rows[0]) & {"created_by", "created_by_name", "status_updated_by"}
    for endpoint in ("board", "routines", "activities", "links", "therapy-notes"):
        assert client.get(f"/api/comm-users/{cid}/{endpoint}", headers=stranger).status_code == 403
    home_session = client.post(f"/api/comm-users/{cid}/sessions/start", headers=owner).json()["id"]
    own_session = client.post(f"/api/comm-users/{cid}/sessions/start", headers=care).json()["id"]
    assert client.post(f"/api/sessions/{home_session}/end", headers=care, json={}).status_code == 403
    assert client.post(f"/api/sessions/{own_session}/end", headers=care, json={}).status_code == 200
    assert client.post(f"/api/comm-users/{cid}/events", headers=care,
        json={"events": [{"text": "Comunicação cotidiana", "source": "texto", "session_id": own_session}]}).status_code == 200


def test_caregiver_explicit_therapy_excerpt_and_private_images(client):
    owner, _ = account(client, "responsavel")
    cid = profile(client, owner)
    care, _, _ = linked_account(client, owner, cid, "cuidador")
    therapist, _, _ = linked_account(client, owner, cid, "terapeuta")
    note = client.post(f"/api/comm-users/{cid}/therapy-notes", headers=therapist,
        json={"title": "Original privado", "text": "PRIVADO_NAO_COMPARTILHAR"}).json()
    nid = note["id"]
    assert client.get(f"/api/comm-users/{cid}/therapy-notes", headers=care).json() == []
    assert client.get(f"/api/therapy-notes/{nid}", headers=care).status_code == 404
    client.put(f"/api/therapy-notes/{nid}/sharing", headers=therapist,
        json={"roles": ["professor"], "title": "Escola", "text": "SO_PROFESSOR"})
    assert client.get(f"/api/therapy-notes/{nid}", headers=care).status_code == 404
    client.put(f"/api/therapy-notes/{nid}/sharing", headers=therapist,
        json={"roles": ["cuidador"], "title": "Cuidado", "text": "TRECHO_AUTORIZADO_CUIDADOR"})
    response = client.get(f"/api/therapy-notes/{nid}", headers=care)
    assert response.status_code == 200 and response.json()["text"] == "TRECHO_AUTORIZADO_CUIDADOR"
    assert "PRIVADO_NAO_COMPARTILHAR" not in response.text
    assert client.put(f"/api/therapy-notes/{nid}", headers=care,
        json={"title": "Não", "text": "Não"}).status_code == 404
    assert client.put(f"/api/therapy-notes/{nid}/sharing", headers=care, json={"roles": ["cuidador"]}).status_code == 404
    client.put(f"/api/therapy-notes/{nid}/sharing", headers=therapist, json={"roles": []})
    assert client.get(f"/api/therapy-notes/{nid}", headers=care).status_code == 404
    path = client.post("/api/upload", headers=owner, data={"comm_user_id": cid},
        files={"file": ("photo.png", PNG, "image/png")}).json()["path"]
    activity = client.post(f"/api/comm-users/{cid}/activities", headers=owner,
        json={"title": "Administrativo", "instruction": "Aviso", "audience": "rede", "image_path": path}).json()
    assert client.get("/api/files/" + path, headers=care).status_code == 403
    client.put(f"/api/activities/{activity['id']}", headers=owner, json={"audience": "comunicador"})
    assert client.get("/api/files/" + path, headers=care).status_code == 200


def test_caregiver_unknown_activity_audience_denied_without_changing_other_roles(client):
    owner, _ = account(client, "responsavel")
    cid = profile(client, owner)
    care, _, _ = linked_account(client, owner, cid, "cuidador")
    teacher, _, _ = linked_account(client, owner, cid, "professor")
    path = client.post("/api/upload", headers=owner, data={"comm_user_id": cid},
        files={"file": ("photo.png", PNG, "image/png")}).json()["path"]
    activity = client.post(f"/api/comm-users/{cid}/activities", headers=owner,
        json={"title": "Escopo futuro", "instruction": "Restrito", "image_path": path}).json()
    aid = activity["id"]
    # Simulate imported/future data, outside today's request schema. Only test DB.
    mongo = MongoClient("mongodb://127.0.0.1:27018")
    try:
        mongo[TEST_DB].activities.update_one({"id": aid}, {"$set": {"audience": "administracao"}})
        assert client.get(f"/api/comm-users/{cid}/activities", headers=care).json() == []
        assert client.get(f"/api/comm-users/{cid}/board", headers=care).json()["activities"] == []
        assert client.put(f"/api/activities/{aid}/status", headers=care,
            json={"status": "realizada"}).status_code == 403
        assert client.get("/api/files/" + path, headers=care).status_code == 403
        for auth in (owner, teacher):
            assert client.get(f"/api/comm-users/{cid}/activities", headers=auth).json()[0]["id"] == aid
        # Audience omitted in legacy data still means communicator content.
        mongo[TEST_DB].activities.update_one({"id": aid}, {"$unset": {"audience": ""}})
        assert client.get(f"/api/comm-users/{cid}/activities", headers=care).json()[0]["id"] == aid
        assert client.get("/api/files/" + path, headers=care).status_code == 200
    finally:
        mongo.close()
