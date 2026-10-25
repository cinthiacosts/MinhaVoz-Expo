# Removes data created by test runs (TEST_ prefixed / test_ accounts)
import asyncio
import os
import re
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    rx = re.compile(r"^TEST[_ ]")
    users = await db.users.find({"username": re.compile(r"^test_")}).to_list(1000)
    uids = [u["id"] for u in users]
    cus = await db.comm_users.find({"$or": [{"name": rx}, {"created_by": {"$in": uids}}]}).to_list(1000)
    cids = [c["id"] for c in cus]
    for col in ["categories", "pictograms", "quick_phrases", "activities", "routines", "links", "sessions", "history"]:
        await db[col].delete_many({"comm_user_id": {"$in": cids}})
    await db.comm_users.delete_many({"id": {"$in": cids}})
    await db.links.delete_many({"member_id": {"$in": uids}})
    await db.users.delete_many({"id": {"$in": uids}})
    await db.login_attempts.delete_many({"email": re.compile(r"^test_")})
    await db.password_resets.delete_many({"email": re.compile(r"^test_")})
    await db.pictograms.delete_many({"name": rx})
    await db.categories.delete_many({"name": rx})
    await db.quick_phrases.delete_many({"text": rx})
    await db.activities.delete_many({"title": rx})
    await db.routines.delete_many({"title": rx})
    await db.history.delete_many({"text": rx})
    print(f"removed users={len(uids)} comm_users={len(cids)}")


asyncio.run(main())
