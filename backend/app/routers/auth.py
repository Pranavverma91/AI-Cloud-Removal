import secrets
import smtplib
from datetime import timedelta, timezone
from email.message import EmailMessage

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from ..config import settings
from ..database import db_session
from ..models import PasswordReset, Session, User, now
from ..security import (
    COOKIE,
    DUMMY_HASH,
    current_user,
    digest,
    new_session,
    passwords,
    rate_limit,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)


class Signup(Credentials):
    name: str = Field(min_length=1, max_length=100)


class EmailInput(BaseModel):
    email: EmailStr


class ResetInput(BaseModel):
    token: str = Field(min_length=30, max_length=200)
    password: str = Field(min_length=10, max_length=128)


def public(user):
    return {"id": user.id, "name": user.name, "email": user.email}


@router.post("/signup", status_code=201)
def signup(data: Signup, response: Response, request: Request, db=Depends(db_session)):
    rate_limit("signup:" + (request.client.host if request.client else "proxy"), 20, 3600)
    user = User(
        email=data.email.lower(),
        name=data.name.strip(),
        password_hash=passwords.hash(data.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "An account with that email already exists") from None
    new_session(db, user, response)
    return public(user)


@router.post("/login")
def login(data: Credentials, response: Response, db=Depends(db_session)):
    rate_limit("login:" + data.email.lower())
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    valid = passwords.verify(data.password, user.password_hash if user else DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(401, "Email or password is incorrect")
    new_session(db, user, response)
    return public(user)


@router.get("/me")
def me(user=Depends(current_user)):
    return public(user)


@router.post("/logout")
def logout(request: Request, response: Response, db=Depends(db_session)):
    token = request.cookies.get(COOKIE)
    if token:
        db.execute(delete(Session).where(Session.token_hash == digest(token)))
        db.commit()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.post("/forgot")
def forgot(data: EmailInput, db=Depends(db_session)):
    rate_limit("reset:" + data.email.lower(), 3, 3600)
    cfg = settings()
    if not cfg.smtp_host or not cfg.smtp_from:
        raise HTTPException(503, "Password reset email is not configured")
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    if user:
        token = secrets.token_urlsafe(48)
        record = PasswordReset(
            user_id=user.id,
            token_hash=digest(token),
            expires_at=now() + timedelta(minutes=20),
        )
        message = EmailMessage()
        message["To"], message["From"], message["Subject"] = (
            user.email,
            cfg.smtp_from,
            "Reset your SPACE EYE password",
        )
        message.set_content(
            f"Reset link (valid for 20 minutes): {cfg.frontend_url}/forgot-password?token={token}"
        )
        try:
            with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=10) as smtp:
                smtp.starttls()
                if cfg.smtp_user:
                    smtp.login(cfg.smtp_user, cfg.smtp_password)
                smtp.send_message(message)
        except (OSError, smtplib.SMTPException) as exc:
            raise HTTPException(503, "Reset email could not be sent") from exc
        db.add(record)
        db.commit()
    return {"detail": "If the account exists, a reset link has been sent."}


@router.post("/reset")
def reset(data: ResetInput, db=Depends(db_session)):
    record = db.scalar(
        select(PasswordReset)
        .where(PasswordReset.token_hash == digest(data.token))
        .with_for_update()
    )
    if not record or record.used or record.expires_at.replace(tzinfo=timezone.utc) <= now():
        raise HTTPException(400, "Reset link is invalid or expired")
    db.get(User, record.user_id).password_hash = passwords.hash(data.password)
    record.used = True
    db.execute(delete(Session).where(Session.user_id == record.user_id))
    db.commit()
    return {"detail": "Password updated. Sign in again."}
