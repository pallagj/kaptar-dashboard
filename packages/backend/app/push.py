"""Web Push notifications.

Generates a VAPID keypair on first use (stored in settings), manages
subscriptions in `push_subscriptions`, and sends notifications via
`pywebpush`. Dead subscriptions (410/404) are auto-removed.
"""
from __future__ import annotations
import base64
import json
import logging
from typing import Optional

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
from pywebpush import webpush, WebPushException

from .db import db, get_setting, set_setting

log = logging.getLogger("kaptar.push")

VAPID_SUB = "mailto:admin@kaptar.local"


def _ensure_vapid() -> tuple[str, str]:
    priv_pem = get_setting("vapid_private_pem")
    pub_b64 = get_setting("vapid_public_b64")
    if priv_pem and pub_b64:
        return priv_pem, pub_b64
    private_key = ec.generate_private_key(ec.SECP256R1())
    priv_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    raw_pub = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    pub_b64 = base64.urlsafe_b64encode(raw_pub).rstrip(b"=").decode()
    set_setting("vapid_private_pem", priv_pem)
    set_setting("vapid_public_b64", pub_b64)
    log.info("generated new VAPID keypair")
    return priv_pem, pub_b64


def public_key_b64() -> str:
    return _ensure_vapid()[1]


def add_subscription(endpoint: str, keys: dict) -> None:
    import time
    with db() as c:
        c.execute(
            "INSERT INTO push_subscriptions(endpoint,keys_json,created_at) VALUES(?,?,?) "
            "ON CONFLICT(endpoint) DO UPDATE SET keys_json=excluded.keys_json",
            (endpoint, json.dumps(keys), int(time.time() * 1000)),
        )


def remove_subscription(endpoint: str) -> None:
    with db() as c:
        c.execute("DELETE FROM push_subscriptions WHERE endpoint=?", (endpoint,))


def list_subscriptions() -> list[dict]:
    with db() as c:
        rows = c.execute("SELECT endpoint,keys_json FROM push_subscriptions").fetchall()
        return [{"endpoint": r["endpoint"], "keys": json.loads(r["keys_json"])} for r in rows]


def send(title: str, body: str, tag: Optional[str] = None, url: Optional[str] = None) -> int:
    priv_pem, _ = _ensure_vapid()
    payload = json.dumps({"title": title, "body": body, "tag": tag, "url": url or "/"})
    sent = 0
    dead: list[str] = []
    for sub in list_subscriptions():
        try:
            webpush(
                subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
                data=payload,
                vapid_private_key=priv_pem,
                vapid_claims={"sub": VAPID_SUB},
            )
            sent += 1
        except WebPushException as e:
            status = getattr(e.response, "status_code", None)
            if status in (404, 410):
                dead.append(sub["endpoint"])
            else:
                log.warning("push failed (%s): %s", status, e)
        except Exception as e:
            log.warning("push failed: %s", e)
    for ep in dead:
        remove_subscription(ep)
        log.info("removed dead subscription")
    return sent
