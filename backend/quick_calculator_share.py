"""Persisted share links for free retirement and tax calculators."""

from __future__ import annotations

import json
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Literal, Optional

from backend.db import get_db, init_db
from backend.db_connection import use_postgres

_log = logging.getLogger(__name__)

ShareKind = Literal["retirement", "tax"]
_SHARE_TTL_DAYS = 365


def _site_origin() -> str:
    base = (os.environ.get("SITE_URL") or os.environ.get("PUBLIC_SITE_URL") or "https://getquala.dev").strip()
    return base.rstrip("/")


def _share_path(kind: ShareKind, share_id: str) -> str:
    if kind == "retirement":
        return f"/retirement-calculator/s/{share_id}"
    return f"/tax-calculator/s/{share_id}"


def build_share_url(kind: ShareKind, share_id: str) -> str:
    return f"{_site_origin()}{_share_path(kind, share_id)}"


def _new_share_id() -> str:
    return secrets.token_urlsafe(9).replace("-", "").replace("_", "")[:12]


def _ensure_share_table(conn) -> None:
    if use_postgres():
        conn.execute("""
            CREATE TABLE IF NOT EXISTS quick_calculator_shares (
                share_id TEXT PRIMARY KEY,
                kind TEXT NOT NULL CHECK (kind IN ('retirement', 'tax')),
                payload_json TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                expires_at TIMESTAMPTZ
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_quick_calculator_shares_created "
            "ON quick_calculator_shares (created_at)"
        )
    else:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS quick_calculator_shares (
                share_id TEXT PRIMARY KEY,
                kind TEXT NOT NULL CHECK (kind IN ('retirement', 'tax')),
                payload_json TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                expires_at TEXT
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_quick_calculator_shares_created "
            "ON quick_calculator_shares(created_at)"
        )


def create_quick_calculator_share(kind: ShareKind, payload: Dict[str, Any]) -> Dict[str, str]:
    init_db()
    share_id = _new_share_id()
    created = datetime.now(timezone.utc).isoformat()
    expires = (datetime.now(timezone.utc) + timedelta(days=_SHARE_TTL_DAYS)).isoformat()
    blob = json.dumps(payload, separators=(",", ":"), default=str)
    with get_db() as conn:
        _ensure_share_table(conn)
        conn.execute(
            """
            INSERT INTO quick_calculator_shares (share_id, kind, payload_json, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (share_id, kind, blob, created, expires),
        )
    url = build_share_url(kind, share_id)
    return {"share_id": share_id, "share_url": url, "kind": kind}


def get_quick_calculator_share(share_id: str) -> Optional[Dict[str, Any]]:
    sid = (share_id or "").strip()
    if not sid or len(sid) > 32:
        return None
    init_db()
    with get_db() as conn:
        _ensure_share_table(conn)
        row = conn.execute(
            """
            SELECT share_id, kind, payload_json, created_at, expires_at
            FROM quick_calculator_shares
            WHERE share_id = ?
            """,
            (sid,),
        ).fetchone()
    if not row:
        return None
    if isinstance(row, dict):
        data = row
    elif hasattr(row, "keys"):
        data = dict(row)
    else:
        keys = ("share_id", "kind", "payload_json", "created_at", "expires_at")
        data = dict(zip(keys, row))
    exp = data.get("expires_at")
    if exp:
        try:
            exp_s = str(exp).replace("Z", "+00:00")
            if datetime.fromisoformat(exp_s) < datetime.now(timezone.utc):
                return None
        except (TypeError, ValueError):
            pass
    raw_payload = data.get("payload_json")
    if isinstance(raw_payload, dict):
        payload = raw_payload
    elif isinstance(raw_payload, str):
        try:
            payload = json.loads(raw_payload)
        except json.JSONDecodeError:
            _log.warning("Invalid share payload for %s", sid)
            return None
    else:
        _log.warning("Invalid share payload for %s", sid)
        return None
    if not isinstance(payload, dict):
        return None
    return {
        "share_id": data["share_id"],
        "kind": data["kind"],
        "payload": payload,
        "share_url": build_share_url(data["kind"], data["share_id"]),
        "created_at": data.get("created_at"),
    }
