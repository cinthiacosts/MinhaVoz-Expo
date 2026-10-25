from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Query, Request
from fastapi.responses import Response
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
from pathlib import Path
from datetime import datetime, timezone, timedelta
from bson import Binary
import os
import re
import uuid
import random
import hashlib
import logging
import bcrypt
import jwt
import requests

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from email_service import send_email, reset_code_html  # noqa: E402
from seed import DEFAULT_CATEGORIES, DEFAULT_PICTOGRAMS, DEFAULT_FAVORITES, DEFAULT_PHRASES, DEFAULT_SETTINGS  # noqa: E402
from local_storage import MAX_IMAGE_BYTES, save_image, read_image  # noqa: E402
from support_features import register_support_routes, InvitationIn  # noqa: E402

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
JWT_SECRET = os.environ['JWT_SECRET']
EMERGENT_KEY = os.environ.get('EMERGENT_LLM_KEY')
JWT_DAYS = 30

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("minhavoz")

app = FastAPI(title="Minha Voz API")


@app.middleware("http")
async def private_api_cache(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api = APIRouter(prefix="/api")

Role = Literal["responsavel", "cuidador", "professor", "terapeuta"]
BOARD_EDIT = {"responsavel"}
PROFILE_CREATE = {"responsavel", "cuidador"}
SCHOOL_EDIT = {"responsavel", "professor"}
ROUTINE_EDIT = {"responsavel", "professor"}
LINK_MANAGE = {"responsavel"}


def now():
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def clean(doc):
    if doc is None:
        return None
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


# ---------------------------------------------------------------- auth helpers
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except (ValueError, TypeError):
        return False


def make_token(user: dict) -> str:
    t = now()
    return jwt.encode({"sub": user["id"], "tv": user.get("token_version", 0), "iat": t, "exp": t + timedelta(days=JWT_DAYS)},
                      JWT_SECRET, algorithm="HS256")


async def rate_limit(key: str, limit: int, window_sec: int, message: str):
    """Fixed-window counter stored in Mongo; raises 429 when exceeded."""
    window = int(now().timestamp()) // window_sec
    doc = await db.rate_limits.find_one_and_update(
        {"key": key, "window": window},
        {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": now() + timedelta(seconds=window_sec * 2)}},
        upsert=True, return_document=True,
    )
    if doc["count"] > limit:
        raise HTTPException(429, message)


async def user_from_token(token: Optional[str]):
    if not token:
        raise HTTPException(401, "Não autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Sessão expirada. Entre novamente.")
    user = await db.users.find_one({"id": payload.get("sub")})
    if not user or payload.get("tv", 0) != user.get("token_version", 0):
        raise HTTPException(401, "Sessão expirada. Entre novamente.")
    return user


async def current_user(request: Request):
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else request.query_params.get("token")
    return await user_from_token(token)


async def get_link(user: dict, comm_user_id: str, roles: Optional[set] = None):
    link = await db.links.find_one({"comm_user_id": comm_user_id, "member_id": user["id"]})
    if not link:
        raise HTTPException(403, "Você não está vinculado a este usuário")
    if roles and link["role"] not in roles:
        raise HTTPException(403, "Seu perfil não tem permissão para esta ação")
    return link


async def owned(collection: str, item_id: str, user: dict, roles: Optional[set] = None):
    doc = await db[collection].find_one({"id": item_id})
    if not doc:
        raise HTTPException(404, "Item não encontrado")
    link = await get_link(user, doc["comm_user_id"], roles)
    if link["role"] == "cuidador":
        if collection == "routines" and doc.get("context") != "casa":
            raise HTTPException(403, "Cuidador utiliza somente rotinas cotidianas de casa")
        if collection == "activities" and (not doc.get("active") or doc.get("audience") not in (None, "comunicador")):
            raise HTTPException(403, "Conteúdo escolar administrativo não está disponível ao Cuidador")
        if collection == "sessions" and (doc.get("context") != "cotidiano" or doc.get("opened_by") != user["id"]):
            raise HTTPException(403, "Cuidador acessa somente suas sessões de cuidado")
    if link["role"] == "professor":
        if collection == "routines" and doc.get("context") != "escola":
            raise HTTPException(403, "Professor acessa somente rotinas escolares")
        if collection == "quick_phrases" and (doc.get("context") != "escola" or doc.get("created_by") != user["id"]):
            raise HTTPException(403, "Professor administra somente suas frases escolares")
        if collection == "sessions" and (doc.get("context") != "escola" or doc.get("opened_by") != user["id"]):
            raise HTTPException(403, "Professor acessa somente suas sessões escolares")
    return doc


def public_user(u: dict) -> dict:
    return {k: u.get(k) for k in ("id", "full_name", "username", "email", "role", "created_at")}


# ---------------------------------------------------------------- models
class RegisterIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    username: str = Field(min_length=3, max_length=40)
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)
    accept_terms: bool


class LoginIn(BaseModel):
    email: str
    password: str


class RoleIn(BaseModel):
    role: Role


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    email: EmailStr
    code: str
    new_password: str = Field(min_length=6, max_length=72)


class CommUserIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    birth_date: Optional[str] = None
    photo_path: Optional[str] = None
    preferences: Optional[str] = ""
    notes: Optional[str] = ""


class CreateCommUserIn(CommUserIn):
    responsibility_confirmed: bool = False


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    emoji: str = "⭐"
    color: str = "categoryActivities"


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    emoji: Optional[str] = None
    color: Optional[str] = None
    order: Optional[int] = None


class PictogramIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    category_key: str
    speech_text: Optional[str] = ""
    emoji: Optional[str] = ""
    image_path: Optional[str] = None
    favorite: bool = False


class PictogramUpdate(BaseModel):
    name: Optional[str] = None
    category_key: Optional[str] = None
    speech_text: Optional[str] = None
    emoji: Optional[str] = None
    image_path: Optional[str] = None
    favorite: Optional[bool] = None


class MoveIn(BaseModel):
    direction: Literal["up", "down"]


class PhraseIn(BaseModel):
    text: str = Field(min_length=1, max_length=300)
    emoji: Optional[str] = "💬"
    favorite: bool = False


class PhraseUpdate(BaseModel):
    text: Optional[str] = None
    emoji: Optional[str] = None
    favorite: Optional[bool] = None


class ActivityIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    instruction: str = Field(min_length=1, max_length=300)
    display_text: Optional[str] = ""
    emoji: Optional[str] = "📖"
    image_path: Optional[str] = None
    active: bool = True
    kind: Literal["atividade", "aviso"] = "atividade"
    audience: Literal["comunicador", "rede"] = "comunicador"


class ActivityUpdate(BaseModel):
    title: Optional[str] = None
    instruction: Optional[str] = None
    display_text: Optional[str] = None
    emoji: Optional[str] = None
    image_path: Optional[str] = None
    active: Optional[bool] = None
    kind: Optional[Literal["atividade", "aviso"]] = None
    audience: Optional[Literal["comunicador", "rede"]] = None


class ActivityStatusIn(BaseModel):
    status: Literal["pendente", "realizada"]


class StepIn(BaseModel):
    id: Optional[str] = None
    label: str
    emoji: Optional[str] = "⭐"
    done: bool = False


class RoutineIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    context: Literal["casa", "escola", "terapia", "outro"] = "casa"
    steps: List[StepIn] = []


class LinkIn(BaseModel):
    identifier: str  # e-mail ou nome de usuário
    role: Role


class SettingsIn(BaseModel):
    pictogram_size: Optional[Literal["medio", "grande", "extra"]] = None
    text_size: Optional[Literal["normal", "grande", "extra"]] = None
    speech_rate: Optional[float] = Field(None, ge=0.5, le=2.0)
    voice: Optional[str] = None
    volume: Optional[float] = Field(None, ge=0.0, le=1.0)
    hidden_categories: Optional[List[str]] = None
    history_enabled: Optional[bool] = None
    speak_on_tap: Optional[bool] = None
    grid_columns: Optional[int] = Field(None, ge=2, le=4)


class EventIn(BaseModel):
    text: str
    source: Literal["prancha", "texto", "frase_rapida", "escola", "atividade"]
    pictogram_ids: List[str] = []
    category_keys: List[str] = []
    session_id: Optional[str] = None
    created_at: Optional[str] = None


class EventsIn(BaseModel):
    events: List[EventIn]


class SessionEndIn(BaseModel):
    ended_at: Optional[str] = None


# ---------------------------------------------------------------- auth routes
@api.post("/auth/register")
async def register(body: RegisterIn):
    if not body.accept_terms:
        raise HTTPException(400, "É necessário aceitar os termos de uso")
    email = body.email.strip().lower()
    username = body.username.strip().lower()
    if not re.fullmatch(r"[a-z0-9._-]+", username):
        raise HTTPException(400, "Nome de usuário: use apenas letras, números, ponto, hífen ou sublinhado")
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Este e-mail já está cadastrado")
    if await db.users.find_one({"username": username}):
        raise HTTPException(409, "Este nome de usuário já está em uso")
    user = {
        "id": new_id(), "full_name": body.full_name.strip(), "username": username, "email": email,
        "password_hash": hash_password(body.password), "role": None, "created_at": iso(now()),
    }
    await db.users.insert_one(user)
    return {"token": make_token(user), "user": public_user(user)}


@api.post("/auth/login")
async def login(body: LoginIn):
    email = body.email.strip().lower()
    attempt = await db.login_attempts.find_one({"email": email})
    if attempt and attempt.get("locked_until") and datetime.fromisoformat(attempt["locked_until"]) > now():
        raise HTTPException(429, "Muitas tentativas. Aguarde 15 minutos e tente novamente.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        count = (attempt or {}).get("count", 0) + 1
        upd = {"email": email, "count": count}
        if count >= 5:
            upd = {"email": email, "count": 0, "locked_until": iso(now() + timedelta(minutes=15))}
        await db.login_attempts.update_one({"email": email}, {"$set": upd}, upsert=True)
        raise HTTPException(401, "E-mail ou senha incorretos")
    await db.login_attempts.delete_one({"email": email})
    return {"token": make_token(user), "user": public_user(user)}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return public_user(user)


@api.put("/auth/role")
async def set_role(body: RoleIn, user=Depends(current_user)):
    # Existing links keep the role granted when they were created; changing the
    # account type never elevates permissions over already-linked users.
    await db.users.update_one({"id": user["id"]}, {"$set": {"role": body.role}})
    user["role"] = body.role
    return public_user(user)


@api.post("/auth/forgot")
async def forgot(body: ForgotIn, request: Request):
    email = body.email.strip().lower()
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip()
    await rate_limit(f"forgot-ip:{ip}", 10, 3600, "Muitos pedidos. Aguarde alguns minutos e tente novamente.")
    await rate_limit(f"forgot:{email}", 3, 900, "Muitos pedidos. Aguarde alguns minutos e tente novamente.")
    user = await db.users.find_one({"email": email})
    msg = "Se o e-mail estiver cadastrado, enviamos um código de recuperação."
    if not user:
        return {"message": msg}
    code = f"{random.SystemRandom().randint(0, 999999):06d}"
    await db.password_resets.update_one(
        {"email": email},
        {"$set": {"email": email, "code_hash": hash_password(code), "attempts": 0,
                  "expires_at": iso(now() + timedelta(minutes=15))}},
        upsert=True,
    )
    try:
        await send_email(to=email, subject="Seu código de recuperação – Minha Voz", html=reset_code_html(user["full_name"], code))
    except HTTPException as e:
        # Same answer for every e-mail so the response never reveals which accounts exist.
        logger.warning("Reset e-mail not sent: %s", e.detail)
    return {"message": msg}


@api.post("/auth/reset")
async def reset(body: ResetIn):
    email = body.email.strip().lower()
    # Atomically reserve one attempt before checking the code (max 5 per code).
    rec = await db.password_resets.find_one_and_update(
        {"email": email, "attempts": {"$lt": 5}}, {"$inc": {"attempts": 1}}, return_document=True)
    if not rec:
        await db.password_resets.delete_one({"email": email, "attempts": {"$gte": 5}})
        raise HTTPException(400, "Código inválido ou expirado")
    if datetime.fromisoformat(rec["expires_at"]) < now() or not verify_password(body.code, rec["code_hash"]):
        raise HTTPException(400, "Código inválido ou expirado")
    await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(body.new_password)},
                                                 "$inc": {"token_version": 1}})
    await db.password_resets.delete_one({"email": email})
    await db.login_attempts.delete_one({"email": email})
    return {"message": "Senha alterada com sucesso"}


# ---------------------------------------------------------------- comm users
async def seed_board(cid: str):
    cats, picts = [], []
    for i, (key, name, emoji, color) in enumerate(DEFAULT_CATEGORIES):
        cats.append({"id": new_id(), "comm_user_id": cid, "key": key, "name": name, "emoji": emoji,
                     "color": color, "order": i, "builtin": True})
        for j, (pname, pemoji, speech) in enumerate(DEFAULT_PICTOGRAMS[key]):
            picts.append({"id": new_id(), "comm_user_id": cid, "category_key": key, "name": pname,
                          "emoji": pemoji, "speech_text": speech or "", "image_path": None,
                          "favorite": pname in DEFAULT_FAVORITES and key != "escola", "order": j,
                          "created_at": iso(now())})
    phrases = [{"id": new_id(), "comm_user_id": cid, "text": t, "emoji": e, "favorite": False, "order": i,
                "created_at": iso(now())} for i, (t, e) in enumerate(DEFAULT_PHRASES)]
    await db.categories.insert_many(cats)
    await db.pictograms.insert_many(picts)
    await db.quick_phrases.insert_many(phrases)


async def comm_user_out(cu: dict, link: dict):
    cu = clean(cu)
    if link["role"] in {"professor", "cuidador"}:
        cu = {k: cu[k] for k in ("id", "name", "photo_path", "settings") if k in cu}
    cu["my_role"] = link["role"]
    return cu


@api.get("/comm-users")
async def list_comm_users(user=Depends(current_user)):
    links = await db.links.find({"member_id": user["id"]}).to_list(500)
    by_id = {link["comm_user_id"]: link for link in links}
    cus = await db.comm_users.find({"id": {"$in": list(by_id)}}).sort("name", 1).to_list(500)
    return [await comm_user_out(c, by_id[c["id"]]) for c in cus]


@api.post("/comm-users")
async def create_comm_user(body: CreateCommUserIn, user=Depends(current_user)):
    if user.get("role") not in PROFILE_CREATE:
        raise HTTPException(403, "Apenas Responsável ou Cuidador podem cadastrar usuários")
    if user.get("role") == "cuidador" and not body.responsibility_confirmed:
        raise HTTPException(400, "Confirme sua responsabilidade pelo novo perfil")
    await validate_image_access(body.photo_path, user)
    cu = {"id": new_id(), **body.model_dump(exclude={"responsibility_confirmed"}), "settings": dict(DEFAULT_SETTINGS),
          "created_by": user["id"], "created_at": iso(now())}
    await db.comm_users.insert_one(cu)
    link = {"id": new_id(), "comm_user_id": cu["id"], "member_id": user["id"], "role": "responsavel",
            "created_at": iso(now())}
    await db.links.insert_one(link)
    await attach_draft_image(body.photo_path, cu["id"], user)
    await seed_board(cu["id"])
    return await comm_user_out(cu, link)


@api.get("/comm-users/{cid}")
async def get_comm_user(cid: str, user=Depends(current_user)):
    link = await get_link(user, cid)
    return await comm_user_out(await db.comm_users.find_one({"id": cid}), link)


@api.put("/comm-users/{cid}")
async def update_comm_user(cid: str, body: CommUserIn, user=Depends(current_user)):
    link = await get_link(user, cid, BOARD_EDIT)
    await validate_image_access(body.photo_path, user, cid)
    await attach_draft_image(body.photo_path, cid, user)
    await db.comm_users.update_one({"id": cid}, {"$set": body.model_dump()})
    return await comm_user_out(await db.comm_users.find_one({"id": cid}), link)


@api.put("/comm-users/{cid}/settings")
async def update_settings(cid: str, body: SettingsIn, user=Depends(current_user)):
    await get_link(user, cid, BOARD_EDIT)
    upd = {f"settings.{k}": v for k, v in body.model_dump(exclude_none=True).items()}
    if upd:
        await db.comm_users.update_one({"id": cid}, {"$set": upd})
    cu = await db.comm_users.find_one({"id": cid})
    return cu["settings"]


@api.get("/comm-users/{cid}/board")
async def board(cid: str, user=Depends(current_user)):
    link = await get_link(user, cid)
    cu = await db.comm_users.find_one({"id": cid})
    cats = await db.categories.find({"comm_user_id": cid}, {"_id": 0}).sort("order", 1).to_list(200)
    picts = await db.pictograms.find({"comm_user_id": cid}, {"_id": 0}).sort("order", 1).to_list(2000)
    phrases = await db.quick_phrases.find({"comm_user_id": cid}, {"_id": 0}).sort("order", 1).to_list(500)
    if link["role"] == "professor":
        for phrase in phrases:
            phrase["can_edit"] = phrase.get("context") == "escola" and phrase.get("created_by") == user["id"]
            phrase.pop("created_by", None)
    elif link["role"] == "cuidador":
        for phrase in phrases:
            phrase["can_edit"] = False
            phrase.pop("created_by", None)
    acts = await db.activities.find({"comm_user_id": cid, "active": True, "audience": {"$ne": "rede"}}, {"_id": 0}).sort("created_at", -1).to_list(200)
    if link["role"] == "cuidador":
        acts = [a for a in acts if a.get("audience") in (None, "comunicador")]
        acts = [care_activity_out(a) for a in acts]
    routine_query = {"comm_user_id": cid}
    if link["role"] == "professor":
        routine_query["context"] = "escola"
    elif link["role"] == "cuidador":
        routine_query["context"] = "casa"
    routines = await db.routines.find(routine_query, {"_id": 0}).sort("created_at", -1).to_list(100)
    if link["role"] == "cuidador":
        routines = [care_routine_out(r) for r in routines]
    return {"comm_user": await comm_user_out(cu, link), "settings": {**DEFAULT_SETTINGS, **cu.get("settings", {})},
            "categories": cats, "pictograms": picts, "quick_phrases": phrases, "activities": acts,
            "routines": routines, "synced_at": iso(now())}


# ---------------------------------------------------------------- categories
@api.post("/comm-users/{cid}/categories")
async def create_category(cid: str, body: CategoryIn, user=Depends(current_user)):
    await get_link(user, cid, BOARD_EDIT)
    count = await db.categories.count_documents({"comm_user_id": cid})
    cat = {"id": new_id(), "comm_user_id": cid, "key": f"c-{uuid.uuid4().hex[:8]}", **body.model_dump(),
           "order": count, "builtin": False}
    await db.categories.insert_one(cat)
    return clean(cat)


@api.put("/categories/{cat_id}")
async def update_category(cat_id: str, body: CategoryUpdate, user=Depends(current_user)):
    await owned("categories", cat_id, user, BOARD_EDIT)
    await db.categories.update_one({"id": cat_id}, {"$set": body.model_dump(exclude_none=True)})
    return clean(await db.categories.find_one({"id": cat_id}))


@api.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, user=Depends(current_user)):
    cat = await owned("categories", cat_id, user, BOARD_EDIT)
    if await db.pictograms.count_documents({"comm_user_id": cat["comm_user_id"], "category_key": cat["key"]}):
        raise HTTPException(400, "Mova ou exclua os pictogramas desta categoria antes de excluí-la")
    await db.categories.delete_one({"id": cat_id})
    return {"ok": True}


# ---------------------------------------------------------------- pictograms
@api.post("/comm-users/{cid}/pictograms")
async def create_pictogram(cid: str, body: PictogramIn, user=Depends(current_user)):
    await get_link(user, cid, BOARD_EDIT)
    await validate_image_access(body.image_path, user, cid)
    await attach_draft_image(body.image_path, cid, user)
    if not await db.categories.find_one({"comm_user_id": cid, "key": body.category_key}):
        raise HTTPException(400, "Categoria inválida")
    count = await db.pictograms.count_documents({"comm_user_id": cid, "category_key": body.category_key})
    p = {"id": new_id(), "comm_user_id": cid, **body.model_dump(), "order": count, "created_at": iso(now())}
    await db.pictograms.insert_one(p)
    return clean(p)


@api.put("/pictograms/{pid}")
async def update_pictogram(pid: str, body: PictogramUpdate, user=Depends(current_user)):
    p = await owned("pictograms", pid, user, BOARD_EDIT)
    await validate_image_access(body.image_path, user, p["comm_user_id"])
    await attach_draft_image(body.image_path, p["comm_user_id"], user)
    data = body.model_dump(exclude_unset=True)
    await db.pictograms.update_one({"id": pid}, {"$set": data})
    return clean(await db.pictograms.find_one({"id": pid}))


@api.delete("/pictograms/{pid}")
async def delete_pictogram(pid: str, user=Depends(current_user)):
    await owned("pictograms", pid, user, BOARD_EDIT)
    await db.pictograms.delete_one({"id": pid})
    return {"ok": True}


@api.post("/pictograms/{pid}/move")
async def move_pictogram(pid: str, body: MoveIn, user=Depends(current_user)):
    p = await owned("pictograms", pid, user, BOARD_EDIT)
    items = await db.pictograms.find({"comm_user_id": p["comm_user_id"], "category_key": p["category_key"]}).sort("order", 1).to_list(1000)
    ids = [i["id"] for i in items]
    idx = ids.index(pid)
    swap = idx - 1 if body.direction == "up" else idx + 1
    if 0 <= swap < len(ids):
        ids[idx], ids[swap] = ids[swap], ids[idx]
        for order, item_id in enumerate(ids):
            await db.pictograms.update_one({"id": item_id}, {"$set": {"order": order}})
    return {"ok": True}


# ---------------------------------------------------------------- quick phrases
@api.post("/comm-users/{cid}/phrases")
async def create_phrase(cid: str, body: PhraseIn, user=Depends(current_user)):
    link = await get_link(user, cid, BOARD_EDIT | {"professor"})
    count = await db.quick_phrases.count_documents({"comm_user_id": cid})
    ph = {"id": new_id(), "comm_user_id": cid, **body.model_dump(), "order": count, "created_at": iso(now())}
    if link["role"] == "professor":
        ph.update(context="escola", created_by=user["id"])
    await db.quick_phrases.insert_one(ph)
    return clean(ph)


@api.put("/phrases/{phid}")
async def update_phrase(phid: str, body: PhraseUpdate, user=Depends(current_user)):
    await owned("quick_phrases", phid, user, BOARD_EDIT | {"professor"})
    await db.quick_phrases.update_one({"id": phid}, {"$set": body.model_dump(exclude_none=True)})
    return clean(await db.quick_phrases.find_one({"id": phid}))


@api.delete("/phrases/{phid}")
async def delete_phrase(phid: str, user=Depends(current_user)):
    await owned("quick_phrases", phid, user, BOARD_EDIT | {"professor"})
    await db.quick_phrases.delete_one({"id": phid})
    return {"ok": True}


# ---------------------------------------------------------------- school activities
def care_activity_out(activity):
    return {k: activity[k] for k in ("id", "comm_user_id", "title", "instruction", "display_text", "emoji",
        "image_path", "active", "kind", "status") if k in activity}


@api.get("/comm-users/{cid}/activities")
async def list_activities(cid: str, user=Depends(current_user)):
    link = await get_link(user, cid)
    query = {"comm_user_id": cid}
    if link["role"] == "cuidador":
        # Missing audience is legacy communicator content. Unknown/new audiences
        # must never implicitly grant a caregiver access.
        query.update(active=True, audience={"$in": ["comunicador", None]})
    rows = await db.activities.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [care_activity_out(a) for a in rows] if link["role"] == "cuidador" else rows


@api.post("/comm-users/{cid}/activities")
async def create_activity(cid: str, body: ActivityIn, user=Depends(current_user)):
    await get_link(user, cid, SCHOOL_EDIT)
    await validate_image_access(body.image_path, user, cid)
    await attach_draft_image(body.image_path, cid, user)
    a = {"id": new_id(), "comm_user_id": cid, **body.model_dump(), "created_by": user["id"],
         "created_by_name": user["full_name"], "created_at": iso(now()), "status": "pendente"}
    if not a["display_text"]:
        a["display_text"] = a["instruction"]
    await db.activities.insert_one(a)
    return clean(a)


@api.put("/activities/{aid}")
async def update_activity(aid: str, body: ActivityUpdate, user=Depends(current_user)):
    a = await owned("activities", aid, user, SCHOOL_EDIT)
    await validate_image_access(body.image_path, user, a["comm_user_id"])
    await attach_draft_image(body.image_path, a["comm_user_id"], user)
    await db.activities.update_one({"id": aid}, {"$set": body.model_dump(exclude_none=True)})
    return clean(await db.activities.find_one({"id": aid}))


@api.delete("/activities/{aid}")
async def delete_activity(aid: str, user=Depends(current_user)):
    await owned("activities", aid, user, SCHOOL_EDIT)
    await db.activities.delete_one({"id": aid})
    return {"ok": True}


@api.put("/activities/{aid}/status")
async def activity_status(aid: str, body: ActivityStatusIn, user=Depends(current_user)):
    activity = await owned("activities", aid, user)
    link = await get_link(user, activity["comm_user_id"])
    # All linked adults may assist completion in Communication Mode. Staff-only
    # notices are managed exclusively by school editors.
    if activity.get("audience") == "rede":
        await get_link(user, activity["comm_user_id"], SCHOOL_EDIT)
    await db.activities.update_one({"id": aid}, {"$set": {"status": body.status,
        "status_updated_by": user["id"], "status_updated_at": iso(now())}})
    result = clean(await db.activities.find_one({"id": aid}))
    return care_activity_out(result) if link["role"] == "cuidador" else result


# ---------------------------------------------------------------- routines
def care_routine_out(routine):
    return {k: routine[k] for k in ("id", "comm_user_id", "title", "context", "steps") if k in routine}


def norm_steps(steps: List[StepIn]):
    return [{"id": s.id or new_id(), "label": s.label, "emoji": s.emoji or "⭐", "done": s.done} for s in steps]


@api.get("/comm-users/{cid}/routines")
async def list_routines(cid: str, user=Depends(current_user)):
    link = await get_link(user, cid)
    query = {"comm_user_id": cid}
    if link["role"] == "professor":
        query["context"] = "escola"
    elif link["role"] == "cuidador":
        query["context"] = "casa"
    rows = await db.routines.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [care_routine_out(r) for r in rows] if link["role"] == "cuidador" else rows


@api.post("/comm-users/{cid}/routines")
async def create_routine(cid: str, body: RoutineIn, user=Depends(current_user)):
    link = await get_link(user, cid, ROUTINE_EDIT)
    if link["role"] == "professor" and body.context != "escola":
        raise HTTPException(403, "Professor pode criar somente rotinas escolares")
    r = {"id": new_id(), "comm_user_id": cid, "title": body.title, "context": body.context,
         "steps": norm_steps(body.steps), "created_by": user["id"], "created_at": iso(now())}
    await db.routines.insert_one(r)
    return clean(r)


@api.put("/routines/{rid}")
async def update_routine(rid: str, body: RoutineIn, user=Depends(current_user)):
    r = await owned("routines", rid, user, ROUTINE_EDIT)
    link = await get_link(user, r["comm_user_id"])
    if link["role"] == "professor" and body.context != "escola":
        raise HTTPException(403, "Professor não pode alterar o contexto para casa ou terapia")
    await db.routines.update_one({"id": rid}, {"$set": {"title": body.title, "context": body.context,
                                                        "steps": norm_steps(body.steps)}})
    return clean(await db.routines.find_one({"id": rid}))


@api.delete("/routines/{rid}")
async def delete_routine(rid: str, user=Depends(current_user)):
    await owned("routines", rid, user, ROUTINE_EDIT)
    await db.routines.delete_one({"id": rid})
    return {"ok": True}


@api.post("/routines/{rid}/steps/{sid}/toggle")
async def toggle_step(rid: str, sid: str, user=Depends(current_user)):
    r = await owned("routines", rid, user)
    for s in r["steps"]:
        if s["id"] == sid:
            s["done"] = not s["done"]
    await db.routines.update_one({"id": rid}, {"$set": {"steps": r["steps"]}})
    link = await get_link(user, r["comm_user_id"])
    return care_routine_out(r) if link["role"] == "cuidador" else clean(r)


@api.post("/routines/{rid}/reset")
async def reset_routine(rid: str, user=Depends(current_user)):
    r = await owned("routines", rid, user)
    for s in r["steps"]:
        s["done"] = False
    await db.routines.update_one({"id": rid}, {"$set": {"steps": r["steps"]}})
    link = await get_link(user, r["comm_user_id"])
    return care_routine_out(r) if link["role"] == "cuidador" else clean(r)


# ---------------------------------------------------------------- links (rede de apoio)
@api.get("/comm-users/{cid}/links")
async def list_links(cid: str, user=Depends(current_user)):
    my_link = await get_link(user, cid)
    if my_link["role"] in {"professor", "cuidador"}:
        return [{"id": my_link["id"], "role": my_link["role"], "is_me": True}]
    is_owner = my_link["role"] in LINK_MANAGE
    links = await db.links.find({"comm_user_id": cid}, {"_id": 0}).to_list(200)
    members = await db.users.find({"id": {"$in": [lk["member_id"] for lk in links]}}).to_list(200)
    by_id = {m["id"]: m for m in members}
    out = []
    for lk in links:
        m = by_id.get(lk["member_id"], {})
        me = lk["member_id"] == user["id"]
        show = is_owner or me
        out.append({**lk, "member_name": m.get("full_name"), "member_email": m.get("email") if show else None,
                    "member_username": m.get("username") if show else None, "is_me": me})
    return out


@api.post("/comm-users/{cid}/links")
async def add_link(cid: str, body: LinkIn, user=Depends(current_user)):
    # Legacy route now requires explicit permission and recipient acceptance too.
    return await create_invitation(cid, InvitationIn(**body.model_dump()), user)


@api.delete("/links/{lid}")
async def remove_link(lid: str, user=Depends(current_user)):
    link = await db.links.find_one({"id": lid})
    if not link:
        raise HTTPException(404, "Vínculo não encontrado")
    await get_link(user, link["comm_user_id"], LINK_MANAGE)
    if link["member_id"] == user["id"]:
        raise HTTPException(400, "Você não pode remover o seu próprio vínculo")
    await db.links.delete_one({"id": lid})
    await db.invitations.update_many({"comm_user_id": link["comm_user_id"], "member_id": link["member_id"],
        "status": "pending"}, {"$set": {"status": "canceled"}})
    return {"ok": True}


# ---------------------------------------------------------------- sessions & history
@api.post("/comm-users/{cid}/sessions/start")
async def start_session(cid: str, user=Depends(current_user)):
    link = await get_link(user, cid)
    s = {"id": new_id(), "comm_user_id": cid, "opened_by": user["id"], "started_at": iso(now()),
         "ended_at": None, "duration_sec": 0}
    s["context"] = {"professor": "escola", "cuidador": "cotidiano"}.get(link["role"], "nao_informado")
    await db.sessions.insert_one(s)
    return clean(s)


@api.post("/sessions/{sid}/end")
async def end_session(sid: str, body: SessionEndIn, user=Depends(current_user)):
    s = await owned("sessions", sid, user)
    ended = datetime.fromisoformat(body.ended_at) if body.ended_at else now()
    if ended.tzinfo is None:
        ended = ended.replace(tzinfo=timezone.utc)
    dur = min(max(0, int((ended - datetime.fromisoformat(s["started_at"])).total_seconds())), 12 * 3600)
    await db.sessions.update_one({"id": sid}, {"$set": {"ended_at": iso(ended), "duration_sec": dur}})
    return {"ok": True, "duration_sec": dur}


def norm_time(value: Optional[str]) -> str:
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00")) if value else now()
    except ValueError:
        dt = now()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return iso(dt.astimezone(timezone.utc))


@api.post("/comm-users/{cid}/events")
async def add_events(cid: str, body: EventsIn, user=Depends(current_user)):
    link = await get_link(user, cid)
    cu = await db.comm_users.find_one({"id": cid})
    if not cu.get("settings", {}).get("history_enabled", True):
        return {"stored": 0}
    docs = []
    for e in body.events:
        context = {"professor": "escola", "cuidador": "cotidiano"}.get(link["role"], "nao_informado")
        if e.session_id:
            session = await owned("sessions", e.session_id, user)
            if session["comm_user_id"] != cid:
                raise HTTPException(403, "A sessão pertence a outro perfil")
        docs.append({"id": new_id(), "comm_user_id": cid, **e.model_dump(),
                     "context": context, "recorded_by": user["id"], "created_at": norm_time(e.created_at)})
    if docs:
        await db.history.insert_many(docs)
    return {"stored": len(docs)}


@api.get("/comm-users/{cid}/history")
async def history(cid: str, limit: int = 100, user=Depends(current_user)):
    await get_link(user, cid, {"responsavel", "terapeuta"})
    return await db.history.find({"comm_user_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 500))


@api.get("/comm-users/{cid}/school/history")
async def school_history(cid: str, limit: int = Query(100, ge=1, le=500), user=Depends(current_user)):
    await get_link(user, cid, {"professor"})
    # Source is a UI feature, not evidence of a school context. Historical events
    # without trusted provenance are deliberately excluded, never reclassified.
    return await db.history.find({"comm_user_id": cid, "context": "escola", "recorded_by": user["id"]},
        {"_id": 0, "id": 1, "text": 1, "source": 1, "created_at": 1}).sort("created_at", -1).to_list(limit)


@api.get("/comm-users/{cid}/school/stats")
async def school_stats(cid: str, days: int = Query(14, ge=1, le=90), user=Depends(current_user)):
    await get_link(user, cid, {"professor"})
    phrases = await db.history.count_documents({"comm_user_id": cid, "context": "escola",
        "recorded_by": user["id"], "created_at": {"$gte": iso(now() - timedelta(days=days))}})
    activities = {"comm_user_id": cid, "active": True, "kind": {"$ne": "aviso"}}
    completed = await db.activities.count_documents({**activities, "status": "realizada"})
    pending = await db.activities.count_documents({**activities, "status": {"$ne": "realizada"}})
    return {"scope": "escolar_proprio", "days": days, "my_school_phrases": phrases,
            "pending_activities": pending, "completed_activities": completed}


@api.delete("/comm-users/{cid}/history")
async def clear_history(cid: str, user=Depends(current_user)):
    await get_link(user, cid, LINK_MANAGE)
    res = await db.history.delete_many({"comm_user_id": cid})
    return {"deleted": res.deleted_count}


@api.get("/comm-users/{cid}/stats")
async def stats(cid: str, days: int = 14, user=Depends(current_user)):
    await get_link(user, cid, {"responsavel", "terapeuta"})
    since = iso(now() - timedelta(days=days))
    events = await db.history.find({"comm_user_id": cid, "created_at": {"$gte": since}}, {"_id": 0}).to_list(20000)
    sessions = await db.sessions.find({"comm_user_id": cid, "started_at": {"$gte": since}}, {"_id": 0}).sort("started_at", -1).to_list(2000)
    cats = {c["key"]: c for c in await db.categories.find({"comm_user_id": cid}, {"_id": 0}).to_list(200)}
    picts = {p["id"]: p for p in await db.pictograms.find({"comm_user_id": cid}, {"_id": 0}).to_list(3000)}
    by_source, by_cat, by_pict, by_day = {}, {}, {}, {}
    for e in events:
        by_source[e["source"]] = by_source.get(e["source"], 0) + 1
        for k in e.get("category_keys", []):
            by_cat[k] = by_cat.get(k, 0) + 1
        for pid in e.get("pictogram_ids", []):
            by_pict[pid] = by_pict.get(pid, 0) + 1
        day = e["created_at"][:10]
        by_day[day] = by_day.get(day, 0) + 1
    daily = []
    for i in range(days - 1, -1, -1):
        d = (now() - timedelta(days=i)).date().isoformat()
        daily.append({"date": d, "count": by_day.get(d, 0)})
    top_picts = sorted(by_pict.items(), key=lambda x: -x[1])[:8]
    top_cats = sorted(by_cat.items(), key=lambda x: -x[1])[:8]
    return {
        "days": days,
        "total_phrases": len(events),
        "total_sessions": len(sessions),
        "total_minutes": round(sum(s.get("duration_sec", 0) for s in sessions) / 60),
        "by_source": by_source,
        "daily": daily,
        "top_pictograms": [{"id": pid, "name": picts.get(pid, {}).get("name", "Removido"),
                            "emoji": picts.get(pid, {}).get("emoji", "•"),
                            "image_path": picts.get(pid, {}).get("image_path"), "count": c} for pid, c in top_picts],
        "top_categories": [{"key": k, "name": cats.get(k, {}).get("name", k), "emoji": cats.get(k, {}).get("emoji", "•"),
                            "color": cats.get(k, {}).get("color", "categoryActivities"), "count": c} for k, c in top_cats],
        "recent_sessions": [{"id": s["id"], "started_at": s["started_at"], "duration_sec": s.get("duration_sec", 0)} for s in sessions[:10]],
    }


# ---------------------------------------------------------------- object storage
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "minha-voz"
storage_key = None


def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    global storage_key
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    if resp.status_code == 503:
        storage_key = None
        key = init_storage()
        resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type},
                            data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"}


@api.post("/upload")
async def upload(file: UploadFile = File(...), comm_user_id: Optional[str] = Form(None), user=Depends(current_user)):
    if comm_user_id:
        await get_link(user, comm_user_id, BOARD_EDIT | {"professor"})
    elif user.get("role") not in PROFILE_CREATE:
        raise HTTPException(403, "Sem permissão para enviar imagens")
    await rate_limit(f"upload:{user['id']}", 40, 3600, "Limite de envios por hora atingido. Tente mais tarde.")
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, "Envie uma imagem JPG, PNG, WEBP, GIF ou HEIC")
    data = await file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(400, "Imagem muito grande (máx. 8 MB)")
    path, media = await run_in_threadpool(save_image, data)
    rec = {"id": new_id(), "storage_path": path, "storage_backend": "local", "owner_id": user["id"], "comm_user_id": comm_user_id,
           "content_type": media, "size": len(data), "created_at": iso(now())}
    await db.files.insert_one(rec)
    return {"path": path}


async def validate_image_access(path, user, cid=None):
    if not path:
        return
    rec = await db.files.find_one({"storage_path": path})
    if not rec:
        raise HTTPException(400, "Imagem não encontrada")
    if rec.get("comm_user_id"):
        await get_link(user, rec["comm_user_id"])
        if cid and rec["comm_user_id"] != cid:
            raise HTTPException(403, "A imagem pertence a outro perfil")
    elif rec["owner_id"] != user["id"]:
        raise HTTPException(403, "Sem acesso à imagem")


async def attach_draft_image(path, cid, user):
    if path:
        await db.files.update_one({"storage_path": path, "owner_id": user["id"], "comm_user_id": None},
                                  {"$set": {"comm_user_id": cid}})


@api.get("/files/{path:path}")
async def download(path: str, request: Request):
    user = await current_user(request)
    rec = await db.files.find_one({"storage_path": path})
    if not rec:
        raise HTTPException(404, "Arquivo não encontrado")
    if rec.get("comm_user_id"):
        link = await get_link(user, rec["comm_user_id"])
        if link["role"] == "cuidador":
            cid = rec["comm_user_id"]
            visible = await db.comm_users.find_one({"id": cid, "photo_path": path})
            visible = visible or await db.pictograms.find_one({"comm_user_id": cid, "image_path": path})
            visible = visible or await db.activities.find_one({"comm_user_id": cid, "image_path": path,
                                                               "active": True, "audience": {"$in": ["comunicador", None]}})
            if not visible:
                raise HTTPException(403, "Imagem não destinada ao apoio de comunicação")
    elif rec["owner_id"] != user["id"]:
        raise HTTPException(403, "Sem acesso")
    if path.startswith("local/"):
        data = await run_in_threadpool(read_image, path)
    elif os.environ.get("STORAGE_BACKEND") == "emergent":
        data, _ = await run_in_threadpool(get_object, path)
    else:
        raise HTTPException(503, "Esta imagem pertence ao armazenamento anterior e não está disponível localmente")
    media = rec.get("content_type") if rec.get("content_type") in ALLOWED_IMAGE_TYPES else "application/octet-stream"
    return Response(content=data, media_type=media,
                    headers={"Cache-Control": "private, max-age=604800", "X-Content-Type-Options": "nosniff",
                             "Content-Security-Policy": "default-src 'none'"})


# ---------------------------------------------------------------- text-to-speech
VOICES = {"coral", "nova", "shimmer", "sage", "alloy", "ash", "echo", "fable", "onyx"}
TTS_MODEL = "gpt-4o-mini-tts"
TTS_INSTRUCTIONS = ("Fale em português do Brasil, com pronúncia brasileira natural, de forma clara, calma e acolhedora. "
                    "Pronuncie cada palavra com nitidez, como alguém se comunicando em casa ou na escola.")
EMOJI_RE = re.compile("[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0000FE0F\U0000200D\U00002B00-\U00002BFF]+")


def clean_for_tts(text: str) -> str:
    text = EMOJI_RE.sub("", text)
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"[*_#>~|`]", "", text)
    return re.sub(r"\s+", " ", text).strip()


@api.get("/tts")
async def tts(request: Request, text: str = Query(..., max_length=1000), voice: str = "coral", speed: float = 1.0):
    user = await current_user(request)

    text = clean_for_tts(text)
    if not text:
        raise HTTPException(400, "Texto vazio")
    voice = voice if voice in VOICES else "coral"
    speed = min(max(speed, 0.5), 2.0)
    key = hashlib.sha256(f"{text}|{voice}|{speed}|{TTS_MODEL}|mp3|{TTS_INSTRUCTIONS}".encode()).hexdigest()
    cached = await db.tts_cache.find_one({"key": key})
    if cached:
        audio = bytes(cached["audio"])
    else:
        raise HTTPException(410, "A fala agora utiliza a voz local do dispositivo. Atualize o aplicativo.")
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=31536000"})


create_invitation = register_support_routes(api, db, current_user, get_link, new_id, now, iso, clean)
app.include_router(api)
CORS_ORIGINS = [origin.strip().rstrip("/") for origin in os.environ.get(
    "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if origin.strip()]
if "*" in CORS_ORIGINS:
    raise RuntimeError("CORS_ORIGINS deve listar origens explícitas")
app.add_middleware(CORSMiddleware, allow_credentials=False, allow_origins=CORS_ORIGINS,
                   allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                   allow_headers=["Authorization", "Content-Type"])


@app.on_event("startup")
async def startup():
    await db.users.create_index("id", unique=True)
    await db.users.create_index("email", unique=True)
    await db.users.create_index("username", unique=True)
    await db.links.create_index([("comm_user_id", 1), ("member_id", 1)], unique=True)
    await db.links.create_index("member_id")
    for col in ("comm_users", "categories", "pictograms", "quick_phrases", "activities", "routines", "sessions", "history"):
        await db[col].create_index("id")
    for col in ("categories", "pictograms", "quick_phrases", "activities", "routines", "sessions", "history"):
        await db[col].create_index("comm_user_id")
    await db.tts_cache.create_index("key", unique=True)
    await db.rate_limits.create_index([("key", 1), ("window", 1)], unique=True)
    await db.rate_limits.create_index("expires_at", expireAfterSeconds=0)
    await db.files.create_index("storage_path")
    await db.invitations.create_index([("comm_user_id", 1), ("member_id", 1)], unique=True)
    await db.invitations.create_index("id", unique=True)
    await db.therapy_notes.create_index("id", unique=True)
    await db.therapy_notes.create_index([("comm_user_id", 1), ("author_id", 1)])
    logger.info("Armazenamento local de imagens habilitado; nenhuma integração externa iniciada")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
