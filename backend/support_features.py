"""Small support-network features. Therapeutic source notes never enter a board."""
from datetime import timedelta
from typing import Literal, Optional
from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

Role = Literal["responsavel", "cuidador", "professor", "terapeuta"]


class InvitationIn(BaseModel):
    identifier: str = Field(min_length=3, max_length=254)
    role: Role


class NoteIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=1, max_length=10000)


class ShareIn(BaseModel):
    # Sharing is a separate, deliberately selected excerpt, never the private note.
    title: str = Field(default="", max_length=120)
    text: str = Field(default="", max_length=5000)
    roles: list[Role] = Field(default_factory=list)


def register_support_routes(api, db, current_user, get_link, new_id, now, iso, clean):
    async def create_invitation(cid, body, user):
        await get_link(user, cid, {"responsavel"})
        member = await db.users.find_one({"$or": [{"email": body.identifier.strip().lower()},
                                                 {"username": body.identifier.strip().lower()}]})
        if not member or member["id"] == user["id"]:
            raise HTTPException(400, "Informe outra conta existente da rede de apoio")
        if await db.links.find_one({"comm_user_id": cid, "member_id": member["id"]}):
            raise HTTPException(409, "Esta conta já está vinculada")
        # One document per recipient/profile makes accept/cancel single-use.
        try:
            invite = await db.invitations.find_one_and_update(
                {"comm_user_id": cid, "member_id": member["id"], "status": {"$ne": "accepting"}},
                {"$set": {"id": new_id(), "role": body.role, "status": "pending", "invited_by": user["id"],
                          "created_at": iso(now()), "expires_at": iso(now() + timedelta(days=7))}},
                upsert=True, return_document=True)
        except DuplicateKeyError:
            raise HTTPException(409, "Este convite está sendo aceito. Atualize a rede.")
        return clean(invite)

    @api.post("/comm-users/{cid}/invitations")
    async def invite(cid: str, body: InvitationIn, user=Depends(current_user)):
        return await create_invitation(cid, body, user)

    @api.get("/invitations")
    async def inbox(user=Depends(current_user)):
        rows = await db.invitations.find({"member_id": user["id"], "status": "pending",
            "expires_at": {"$gt": iso(now())}}, {"_id": 0}).to_list(200)
        result = []
        for row in rows:
            try:
                await get_link({"id": row["invited_by"]}, row["comm_user_id"], {"responsavel"})
            except HTTPException:
                continue
            cu = await db.comm_users.find_one({"id": row["comm_user_id"]})
            if cu:
                result.append({**row, "comm_user_name": cu["name"]})
        return result

    @api.get("/comm-users/{cid}/invitations")
    async def outbox(cid: str, user=Depends(current_user)):
        await get_link(user, cid, {"responsavel"})
        rows = await db.invitations.find({"comm_user_id": cid, "status": "pending",
            "expires_at": {"$gt": iso(now())}}, {"_id": 0}).to_list(200)
        for row in rows:
            member = await db.users.find_one({"id": row["member_id"]})
            row["member_name"] = member.get("full_name", "Conta") if member else "Conta"
        return rows

    @api.post("/invitations/{iid}/accept")
    async def accept(iid: str, user=Depends(current_user)):
        pending = await db.invitations.find_one({"id": iid, "member_id": user["id"], "status": "pending",
                                                "expires_at": {"$gt": iso(now())}})
        if not pending:
            raise HTTPException(404, "Convite indisponível ou expirado")
        await get_link({"id": pending["invited_by"]}, pending["comm_user_id"], {"responsavel"})
        claimed = await db.invitations.find_one_and_update({"id": iid, "member_id": user["id"],
            "status": "pending", "expires_at": {"$gt": iso(now())}}, {"$set": {"status": "accepting"}})
        if not claimed:
            raise HTTPException(409, "Convite já respondido")
        link = {"id": new_id(), "comm_user_id": claimed["comm_user_id"], "member_id": user["id"],
                "role": claimed["role"], "created_by": claimed["invited_by"], "created_at": iso(now())}
        try:
            await db.links.update_one({"comm_user_id": link["comm_user_id"], "member_id": user["id"]},
                                     {"$setOnInsert": link}, upsert=True)
        except DuplicateKeyError:
            pass
        await db.invitations.update_one({"id": iid}, {"$set": {"status": "accepted", "responded_at": iso(now())}})
        return {"ok": True, "comm_user_id": link["comm_user_id"]}

    @api.post("/invitations/{iid}/decline")
    async def decline(iid: str, user=Depends(current_user)):
        result = await db.invitations.update_one({"id": iid, "member_id": user["id"], "status": "pending"},
                                                 {"$set": {"status": "declined"}})
        if not result.matched_count:
            raise HTTPException(404, "Convite indisponível")
        return {"ok": True}

    @api.delete("/invitations/{iid}")
    async def cancel(iid: str, user=Depends(current_user)):
        row = await db.invitations.find_one({"id": iid})
        if not row:
            raise HTTPException(404, "Convite indisponível")
        await get_link(user, row["comm_user_id"], {"responsavel"})
        result = await db.invitations.update_one({"id": iid, "status": "pending"}, {"$set": {"status": "canceled"}})
        if not result.matched_count:
            raise HTTPException(409, "Convite já respondido. Revogue o vínculo na rede.")
        return {"ok": True}

    async def author_note(nid, user):
        note = await db.therapy_notes.find_one({"id": nid, "author_id": user["id"]})
        if not note:
            raise HTTPException(404, "Registro não encontrado")
        await get_link(user, note["comm_user_id"], {"terapeuta"})
        return note

    def note_out(note, user, role):
        if note["author_id"] == user["id"] and role == "terapeuta":
            return {**clean(note), "is_author": True}
        shared = note.get("shared", {})
        if role not in shared.get("roles", []):
            raise HTTPException(404, "Registro não encontrado")
        return {"id": note["id"], "comm_user_id": note["comm_user_id"], "is_author": False,
                "title": shared["title"], "text": shared["text"], "shared_at": shared["shared_at"]}

    @api.post("/comm-users/{cid}/therapy-notes")
    async def create_note(cid: str, body: NoteIn, user=Depends(current_user)):
        await get_link(user, cid, {"terapeuta"})
        note = {"id": new_id(), "comm_user_id": cid, "author_id": user["id"], **body.model_dump(),
                "shared": {"roles": []}, "created_at": iso(now()), "updated_at": iso(now())}
        await db.therapy_notes.insert_one(note)
        return note_out(note, user, "terapeuta")

    @api.get("/comm-users/{cid}/therapy-notes")
    async def list_notes(cid: str, user=Depends(current_user)):
        link = await get_link(user, cid)
        conditions = [{"shared.roles": link["role"]}]
        if link["role"] == "terapeuta":
            conditions.append({"author_id": user["id"]})
        rows = await db.therapy_notes.find({"comm_user_id": cid, "$or": conditions}).sort("created_at", -1).to_list(200)
        return [note_out(row, user, link["role"]) for row in rows]

    @api.get("/therapy-notes/{nid}")
    async def read_note(nid: str, user=Depends(current_user)):
        note = await db.therapy_notes.find_one({"id": nid})
        if not note:
            raise HTTPException(404, "Registro não encontrado")
        link = await get_link(user, note["comm_user_id"])
        return note_out(note, user, link["role"])

    @api.put("/therapy-notes/{nid}")
    async def edit_note(nid: str, body: NoteIn, user=Depends(current_user)):
        await author_note(nid, user)
        await db.therapy_notes.update_one({"id": nid, "author_id": user["id"]},
            {"$set": {**body.model_dump(), "updated_at": iso(now())}})
        return note_out(await db.therapy_notes.find_one({"id": nid}), user, "terapeuta")

    @api.put("/therapy-notes/{nid}/sharing")
    async def share_note(nid: str, body: ShareIn, user=Depends(current_user)):
        await author_note(nid, user)
        if body.roles and (not body.title.strip() or not body.text.strip()):
            raise HTTPException(400, "Escreva o título e o trecho que deseja compartilhar")
        shared = {"roles": sorted(set(body.roles)), "title": body.title.strip(), "text": body.text.strip(),
                  "shared_at": iso(now())} if body.roles else {"roles": []}
        await db.therapy_notes.update_one({"id": nid, "author_id": user["id"]}, {"$set": {"shared": shared}})
        return {"ok": True}

    return create_invitation
