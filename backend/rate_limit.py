from hashlib import sha256

from fastapi import HTTPException
from redis import Redis
from redis.exceptions import RedisError


LIMIT_SCRIPT = """
local minute_count = tonumber(redis.call("GET", KEYS[1]) or "0")
local daily_count = tonumber(redis.call("GET", KEYS[2]) or "0")
local retry_after = 0

if minute_count >= tonumber(ARGV[1]) then
    retry_after = math.max(
        retry_after, redis.call("TTL", KEYS[1]), 1
    )
end

if daily_count >= tonumber(ARGV[2]) then
    retry_after = math.max(
        retry_after, redis.call("TTL", KEYS[2]), 1
    )
end

if retry_after > 0 then
    return retry_after
end

local new_minute_count = redis.call("INCR", KEYS[1])
if new_minute_count == 1 then
    redis.call("EXPIRE", KEYS[1], 60)
end

local new_daily_count = redis.call("INCR", KEYS[2])
if new_daily_count == 1 then
    redis.call("EXPIRE", KEYS[2], 86400)
end

return 0
"""


def enforce_chat_limits(redis_client: Redis, subject: str) -> None:
    user_key = sha256(subject.encode("utf-8")).hexdigest()

    prefix = f"chat:limits:{{{user_key}}}"

    try:
        retry_after = int(
            redis_client.eval(
                LIMIT_SCRIPT,
                2,
                f"{prefix}:minute",
                f"{prefix}:day",
                10,
                100,
            )
        )
    except RedisError:
        raise HTTPException(
            status_code=503,
            detail="Chat is temporarily unavailable",
        ) from None

    if retry_after > 0:
        raise HTTPException(
            status_code=429,
            detail="Chat request limit reached. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )