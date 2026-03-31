"""Factory helpers for building ConnectRPC service clients.

Usage:
    async with congress_client() as svc:
        resp = await svc.start_session(StartSessionRequest(topic="..."))

Both helpers accept an optional ``token`` which is sent as ``X-Internal-Token``.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

from connectrpc.client import ConnectClient

from congress.v1.congress_connect import CongressServiceClient
from persona.v1.persona_connect import PersonaServiceClient

CLUNGER_BASE_URL = os.environ.get("CLUNGER_BASE_URL", "http://localhost:8081")


def _auth_headers(token: str | None = None) -> dict[str, str]:
    tok = token or os.environ.get("INTERNAL_TOKEN", "")
    if tok:
        return {"X-Internal-Token": tok}
    return {}


@asynccontextmanager
async def congress_client(
    *,
    base_url: str | None = None,
    token: str | None = None,
    timeout_ms: int | None = None,
):
    """Async context manager that yields a CongressServiceClient."""
    url = base_url or CLUNGER_BASE_URL
    headers = _auth_headers(token)
    async with ConnectClient(
        url,
        proto_json=True,   # use Connect JSON protocol (no binary framing overhead)
        timeout_ms=timeout_ms,
        send_compression=None,  # disable gzip for local loopback
    ) as raw:
        # Attach static auth headers by wrapping execute_unary
        yield _HeaderedCongressClient(raw, headers)


@asynccontextmanager
async def persona_client(
    *,
    base_url: str | None = None,
    token: str | None = None,
    timeout_ms: int | None = None,
):
    """Async context manager that yields a PersonaServiceClient."""
    url = base_url or CLUNGER_BASE_URL
    headers = _auth_headers(token)
    async with ConnectClient(
        url,
        proto_json=True,
        timeout_ms=timeout_ms,
        send_compression=None,
    ) as raw:
        yield _HeaderedPersonaClient(raw, headers)


class _HeaderedCongressClient(CongressServiceClient):
    """CongressServiceClient that injects auth headers into every call."""

    def __init__(self, raw_client, headers: dict[str, str]) -> None:
        super().__init__(raw_client)
        self._headers = headers

    async def start_session(self, req, *, headers=None, timeout_ms=None):
        return await super().start_session(req, headers=self._merge(headers), timeout_ms=timeout_ms)

    async def post_debate(self, req, *, headers=None, timeout_ms=None):
        return await super().post_debate(req, headers=self._merge(headers), timeout_ms=timeout_ms)

    def stream_debate(self, req, *, headers=None, timeout_ms=None):
        return super().stream_debate(req, headers=self._merge(headers), timeout_ms=timeout_ms)

    async def list_identities(self, req=None, *, headers=None, timeout_ms=None):
        return await super().list_identities(req, headers=self._merge(headers), timeout_ms=timeout_ms)

    async def get_session(self, req, *, headers=None, timeout_ms=None):
        return await super().get_session(req, headers=self._merge(headers), timeout_ms=timeout_ms)

    async def patch_session(self, req, *, headers=None, timeout_ms=None):
        return await super().patch_session(req, headers=self._merge(headers), timeout_ms=timeout_ms)

    def _merge(self, extra: dict | None) -> dict[str, str]:
        if not extra:
            return self._headers
        return {**self._headers, **extra}


class _HeaderedPersonaClient(PersonaServiceClient):
    """PersonaServiceClient that injects auth headers into every call."""

    def __init__(self, raw_client, headers: dict[str, str]) -> None:
        super().__init__(raw_client)
        self._headers = headers

    async def list_personas(self, req=None, *, headers=None, timeout_ms=None):
        return await super().list_personas(req, headers=self._merge(headers), timeout_ms=timeout_ms)

    async def get_persona(self, req, *, headers=None, timeout_ms=None):
        return await super().get_persona(req, headers=self._merge(headers), timeout_ms=timeout_ms)

    async def create_persona(self, req, *, headers=None, timeout_ms=None):
        return await super().create_persona(req, headers=self._merge(headers), timeout_ms=timeout_ms)

    async def update_persona(self, req, *, headers=None, timeout_ms=None):
        return await super().update_persona(req, headers=self._merge(headers), timeout_ms=timeout_ms)

    async def delete_persona(self, req, *, headers=None, timeout_ms=None):
        return await super().delete_persona(req, headers=self._merge(headers), timeout_ms=timeout_ms)

    async def post_verdict(self, req, *, headers=None, timeout_ms=None):
        return await super().post_verdict(req, headers=self._merge(headers), timeout_ms=timeout_ms)

    def _merge(self, extra: dict | None) -> dict[str, str]:
        if not extra:
            return self._headers
        return {**self._headers, **extra}
