"""Private local image storage. Paths returned to clients are opaque IDs, never OS paths."""
import os
import re
import uuid
from pathlib import Path

from fastapi import HTTPException

ROOT = Path(os.environ.get("LOCAL_UPLOAD_DIR") or Path(__file__).parent / "local_uploads").resolve()
MAX_IMAGE_BYTES = 8 * 1024 * 1024


def image_type(data: bytes) -> tuple[str, str]:
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        return "image/png", "png"
    if data.startswith(b"\xff\xd8\xff") and data.endswith(b"\xff\xd9"):
        return "image/jpeg", "jpg"
    if data[:6] in (b"GIF87a", b"GIF89a") and len(data) >= 13:
        return "image/gif", "gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    if len(data) >= 16 and data[4:8] == b"ftyp" and data[8:12] in (b"heic", b"heix", b"mif1", b"hevc"):
        return "image/heic", "heic"
    raise HTTPException(400, "O arquivo precisa conter uma imagem JPG, PNG, GIF, WEBP ou HEIC")


def resolve_image(path: str) -> Path:
    if not re.fullmatch(r"local/[0-9a-f]{32}\.(png|jpg|gif|webp|heic)", path):
        raise HTTPException(404, "Arquivo não encontrado")
    target = (ROOT / path.removeprefix("local/")).resolve()
    if target.parent != ROOT:
        raise HTTPException(404, "Arquivo não encontrado")
    return target


def save_image(data: bytes) -> tuple[str, str]:
    media, ext = image_type(data)
    path = f"local/{uuid.uuid4().hex}.{ext}"
    ROOT.mkdir(parents=True, exist_ok=True)
    with resolve_image(path).open("xb") as out:
        out.write(data)
    return path, media


def read_image(path: str) -> bytes:
    try:
        return resolve_image(path).read_bytes()
    except FileNotFoundError:
        raise HTTPException(404, "Imagem local não encontrada")
