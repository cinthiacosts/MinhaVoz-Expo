# Clears forgot rate-limit counters (keys starting with 'forgot') so repeated test runs don't hit the IP limit
import asyncio
import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    r = await db.rate_limits.delete_many({"key": {"$regex": "^forgot"}})
    print("deleted forgot rate_limits:", r.deleted_count)


asyncio.run(main())
