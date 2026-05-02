"""Google OAuth + JWT session auth.

Frontend posts a Google ID token to /api/auth/google; we verify it via Google's
JWKS, upsert the user, and return a long-lived HS256 JWT used as a Bearer
session token for subsequent /api/* calls.

Two separate auth dependencies exist:
- `current_user`: Bearer-JWT, for the regular web/mobile app.
- `current_user_by_ingest_token`: `X-Ingest-Token` header, for the SMS ingest
  endpoint hit by iPhone Shortcuts.
"""
from __future__ import annotations
import os
import secrets
import time

import jwt
from fastapi import HTTPException, Request
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from .db import db, get_setting, set_setting, seed_user_defaults

JWT_ALG = "HS256"
JWT_TTL_DAYS = 90  # long-lived so offline read-only stays available for a while


def _jwt_secret() -> str:
    env = os.environ.get("KAPTAR_JWT_SECRET")
    if env:
        return env
    stored = get_setting("jwt_secret")
    if stored:
        return stored
    generated = secrets.token_urlsafe(48)
    set_setting("jwt_secret", generated)
    return generated


def _google_client_id() -> str:
    cid = os.environ.get("GOOGLE_CLIENT_ID") or get_setting("google_client_id")
    if not cid:
        raise HTTPException(500, "GOOGLE_CLIENT_ID nincs beállítva a szerveren")
    return cid


def verify_google_id_token(token: str) -> dict:
    try:
        info = id_token.verify_oauth2_token(
            token, google_requests.Request(), _google_client_id()
        )
    except ValueError as e:
        raise HTTPException(401, f"Érvénytelen Google ID token: {e}")
    if info.get("iss") not in ("https://accounts.google.com", "accounts.google.com"):
        raise HTTPException(401, "Érvénytelen token kibocsátó")
    if not info.get("email_verified", False):
        raise HTTPException(401, "A Google fiók email címe nincs megerősítve")
    return info


def upsert_user_from_google(info: dict) -> dict:
    now = int(time.time() * 1000)
    sub = info["sub"]
    email = (info.get("email") or "").lower()
    name = info.get("name") or ""
    picture = info.get("picture")
    with db() as c:
        row = c.execute("SELECT * FROM users WHERE google_sub=?", (sub,)).fetchone()
        if row:
            c.execute(
                "UPDATE users SET email=?, name=?, picture=? WHERE id=?",
                (email, name, picture, row["id"]),
            )
            return dict(c.execute("SELECT * FROM users WHERE id=?", (row["id"],)).fetchone())
        # Match by email (e.g. pre-seeded Roland account) — claim it on first login.
        row = c.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if row:
            c.execute(
                "UPDATE users SET google_sub=?, name=?, picture=? WHERE id=?",
                (sub, name, picture, row["id"]),
            )
            return dict(c.execute("SELECT * FROM users WHERE id=?", (row["id"],)).fetchone())
        # Brand-new user.
        c.execute(
            "INSERT INTO users(google_sub, email, name, picture, ingest_token, created_at) "
            "VALUES(?,?,?,?,?,?)",
            (sub, email, name, picture, secrets.token_urlsafe(32), now),
        )
        uid = c.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
        seed_user_defaults(c, uid)
        return dict(c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone())


def issue_session_jwt(user_id: int) -> str:
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + JWT_TTL_DAYS * 86400,
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALG)


def _decode_session_jwt(token: str) -> int:
    try:
        payload = jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALG])
        return int(payload["sub"])
    except Exception as e:
        raise HTTPException(401, f"Érvénytelen session: {e}")


def current_user(request: Request) -> dict:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "Bejelentkezés szükséges")
    token = auth.split(" ", 1)[1].strip()
    user_id = _decode_session_jwt(token)
    with db() as c:
        row = c.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(401, "Felhasználó nem található")
        return dict(row)


def current_user_by_ingest_token(request: Request) -> dict:
    token = request.headers.get("x-ingest-token", "").strip()
    if not token:
        raise HTTPException(401, "Hiányzó X-Ingest-Token fejléc")
    with db() as c:
        row = c.execute("SELECT * FROM users WHERE ingest_token=?", (token,)).fetchone()
        if not row:
            raise HTTPException(401, "Érvénytelen ingest token")
        return dict(row)
