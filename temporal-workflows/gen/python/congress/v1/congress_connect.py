"""ConnectRPC client stubs for congress.v1.CongressService.

Hand-written because protoc-gen-connectrpc is not yet available as a pip
package. Follows the same pattern the buf remote plugin would produce:
one MethodInfo constant per RPC, plus a thin service client class.
"""
from __future__ import annotations

from connectrpc.method import IdempotencyLevel, MethodInfo

from .congress_pb2 import (
    GetSessionRequest,
    GetSessionResponse,
    ListIdentitiesRequest,
    ListIdentitiesResponse,
    PatchSessionRequest,
    PatchSessionResponse,
    PostDebateRequest,
    PostDebateResponse,
    StartSessionRequest,
    StartSessionResponse,
    StreamDebateRequest,
    DebateToken,
)

# ---------------------------------------------------------------------------
# Method descriptors
# ---------------------------------------------------------------------------

START_SESSION = MethodInfo(
    name="StartSession",
    service_name="congress.v1.CongressService",
    input=StartSessionRequest,
    output=StartSessionResponse,
    idempotency_level=IdempotencyLevel.UNKNOWN,
)

POST_DEBATE = MethodInfo(
    name="PostDebate",
    service_name="congress.v1.CongressService",
    input=PostDebateRequest,
    output=PostDebateResponse,
    idempotency_level=IdempotencyLevel.UNKNOWN,
)

STREAM_DEBATE = MethodInfo(
    name="StreamDebate",
    service_name="congress.v1.CongressService",
    input=StreamDebateRequest,
    output=DebateToken,
    idempotency_level=IdempotencyLevel.UNKNOWN,
)

LIST_IDENTITIES = MethodInfo(
    name="ListIdentities",
    service_name="congress.v1.CongressService",
    input=ListIdentitiesRequest,
    output=ListIdentitiesResponse,
    idempotency_level=IdempotencyLevel.NO_SIDE_EFFECTS,
)

GET_SESSION = MethodInfo(
    name="GetSession",
    service_name="congress.v1.CongressService",
    input=GetSessionRequest,
    output=GetSessionResponse,
    idempotency_level=IdempotencyLevel.NO_SIDE_EFFECTS,
)

PATCH_SESSION = MethodInfo(
    name="PatchSession",
    service_name="congress.v1.CongressService",
    input=PatchSessionRequest,
    output=PatchSessionResponse,
    idempotency_level=IdempotencyLevel.UNKNOWN,
)


# ---------------------------------------------------------------------------
# Service client
# ---------------------------------------------------------------------------

class CongressServiceClient:
    """Async client for congress.v1.CongressService.

    Wraps a ``ConnectClient`` and exposes one method per RPC. Callers are
    responsible for opening/closing the underlying ``ConnectClient``.
    """

    def __init__(self, client) -> None:
        self._client = client

    async def start_session(
        self,
        req: StartSessionRequest,
        *,
        headers=None,
        timeout_ms: int | None = None,
    ) -> StartSessionResponse:
        return await self._client.execute_unary(
            request=req,
            method=START_SESSION,
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def post_debate(
        self,
        req: PostDebateRequest,
        *,
        headers=None,
        timeout_ms: int | None = None,
    ) -> PostDebateResponse:
        return await self._client.execute_unary(
            request=req,
            method=POST_DEBATE,
            headers=headers,
            timeout_ms=timeout_ms,
        )

    def stream_debate(
        self,
        req: StreamDebateRequest,
        *,
        headers=None,
        timeout_ms: int | None = None,
    ):
        """Returns an async iterator of DebateToken messages."""
        return self._client.execute_server_stream(
            request=req,
            method=STREAM_DEBATE,
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def list_identities(
        self,
        req: ListIdentitiesRequest | None = None,
        *,
        headers=None,
        timeout_ms: int | None = None,
    ) -> ListIdentitiesResponse:
        if req is None:
            req = ListIdentitiesRequest()
        return await self._client.execute_unary(
            request=req,
            method=LIST_IDENTITIES,
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def get_session(
        self,
        req: GetSessionRequest,
        *,
        headers=None,
        timeout_ms: int | None = None,
    ) -> GetSessionResponse:
        return await self._client.execute_unary(
            request=req,
            method=GET_SESSION,
            headers=headers,
            timeout_ms=timeout_ms,
        )

    async def patch_session(
        self,
        req: PatchSessionRequest,
        *,
        headers=None,
        timeout_ms: int | None = None,
    ) -> PatchSessionResponse:
        return await self._client.execute_unary(
            request=req,
            method=PATCH_SESSION,
            headers=headers,
            timeout_ms=timeout_ms,
        )
