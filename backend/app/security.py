import hashlib
import secrets
from datetime import timedelta, timezone

from fastapi import Depends, HTTPException, Request
from pwdlib import PasswordHash
from redis import Redis, RedisError
from sqlalchemy import select

from .config import settings
from .database import db_session
from .models import Session, User, now

COOKIE = "space_eye_session"
passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash("constant-time-unknown-account")


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def csrf(request: Request):
    if request.method in {"POST", "PUT", "DELETE", "PATCH"}:
        origin = request.headers.get("origin")
        if (origin and origin not in settings().origins) or request.headers.get(
            "x-space-eye"
        ) != "1":
            raise HTTPException(403, "Request origin or protection header is invalid")


def rate_limit(key, limit=10, seconds=60):
    if settings().testing:
        return
    try:
        redis = Redis.from_url(settings().redis_url, socket_connect_timeout=2, socket_timeout=2)
        count = redis.eval(
            "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n",
            1,
            "limit:" + digest(key),
            seconds,
        )
        if count > limit:
            raise HTTPException(429, "Too many requests. Try again shortly.")
    except RedisError as exc:
        raise HTTPException(503, "Rate-limit service unavailable") from exc


def current_user(request: Request, db=Depends(db_session)):
    token = request.cookies.get(COOKIE)
    session = (
        db.scalar(select(Session).where(Session.token_hash == digest(token))) if token else None
    )
    if not session or session.expires_at.replace(tzinfo=timezone.utc) <= now():
        raise HTTPException(401, "Sign in to continue")
    user = db.get(User, session.user_id)
    if not user:
        raise HTTPException(401, "Session unavailable")
    return user


def new_session(db, user, response):
    token = secrets.token_urlsafe(48)
    db.add(
        Session(
            user_id=user.id,
            token_hash=digest(token),
            expires_at=now() + timedelta(hours=settings().session_hours),
        )
    )
    db.commit()
    response.set_cookie(
        COOKIE,
        token,
        max_age=settings().session_hours * 3600,
        httponly=True,
        secure=settings().session_secure,
        samesite="lax",
        path="/",
    )


def owned(db, cls, id_, user):
    item = db.get(cls, id_)
    if not item or item.owner_id != user.id:
        raise HTTPException(404, "Record unavailable")
    return item
