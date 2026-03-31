"""ConnectRPC client stubs for persona.v1.PersonaService.

Hand-written — same pattern as congress_connect.py.
"""
from __future__ import annotations

from connectrpc.method import IdempotencyLevel, MethodInfo

from .persona_pb2 import (
    ListPersonasRequest,
    ListPersonasResponse,
    GetPersonaRequest,
    GetPersonaResponse,
    CreatePersonaRequest,
    CreatePersonaResponse,
    UpdatePersonaRequest,
    UpdatePersonaResponse,
    DeletePersonaRequest,
    DeletePersonaResponse,
    PostVerdictRequest,
    PostVerdictResponse,
)

# ---------------------------------------------------------------------------
# Method descriptors
# ---------------------------------------------------------------------------

LIST_PERSONAS = MethodInfo(
    name="ListPersonas",
    service_name="persona.v1.PersonaService",
    input=ListPersonasRequest,
    output=ListPersonasResponse,
    idempotency_level=IdempotencyLevel.NO_SIDE_EFFECTS,
)

GET_PERSONA = MethodInfo(
    name="GetPersona",
    service_name="persona.v1.PersonaService",
    input=GetPersonaRequest,
    output=GetPersonaResponse,
    idempotency_level=IdempotencyLevel.NO_SIDE_EFFECTS,
)

CREATE_PERSONA = MethodInfo(
    name="CreatePersona",
    service_name="persona.v1.PersonaService",
    input=CreatePersonaRequest,
    output=CreatePersonaResponse,
    idempotency_level=IdempotencyLevel.UNKNOWN,
)

UPDATE_PERSONA = MethodInfo(
    name="UpdatePersona",
    service_name="persona.v1.PersonaService",
    input=UpdatePersonaRequest,
    output=UpdatePersonaResponse,
    idempotency_level=IdempotencyLevel.UNKNOWN,
)

DELETE_PERSONA = MethodInfo(
    name="DeletePersona",
    service_name="persona.v1.PersonaService",
    input=DeletePersonaRequest,
    output=DeletePersonaResponse,
    idempotency_level=IdempotencyLevel.UNKNOWN,
)

POST_VERDICT = MethodInfo(
    name="PostVerdict",
    service_name="persona.v1.PersonaService",
    input=PostVerdictRequest,
    output=PostVerdictResponse,
    idempotency_level=IdempotencyLevel.UNKNOWN,
)


# ---------------------------------------------------------------------------
# Service client
# ---------------------------------------------------------------------------

class PersonaServiceClient:
    """Async client for persona.v1.PersonaService."""

    def __init__(self, client) -> None:
        self._client = client

    async def list_personas(
        self,
        req: ListPersonasRequest | None = None,
        *,
        headers=None,
        timeout_ms: int | None = None,
    ) -> ListPersonasResponse:
        if req is None:
            req = ListPersonasRequest()
        return await self._client.execute_unary(
            request=req, method=LIST_PERSONAS, headers=headers, timeout_ms=timeout_ms,
        )

    async def get_persona(
        self,
        req: GetPersonaRequest,
        *,
        headers=None,
        timeout_ms: int | None = None,
    ) -> GetPersonaResponse:
        return await self._client.execute_unary(
            request=req, method=GET_PERSONA, headers=headers, timeout_ms=timeout_ms,
        )

    async def create_persona(
        self,
        req: CreatePersonaRequest,
        *,
        headers=None,
        timeout_ms: int | None = None,
    ) -> CreatePersonaResponse:
        return await self._client.execute_unary(
            request=req, method=CREATE_PERSONA, headers=headers, timeout_ms=timeout_ms,
        )

    async def update_persona(
        self,
        req: UpdatePersonaRequest,
        *,
        headers=None,
        timeout_ms: int | None = None,
    ) -> UpdatePersonaResponse:
        return await self._client.execute_unary(
            request=req, method=UPDATE_PERSONA, headers=headers, timeout_ms=timeout_ms,
        )

    async def delete_persona(
        self,
        req: DeletePersonaRequest,
        *,
        headers=None,
        timeout_ms: int | None = None,
    ) -> DeletePersonaResponse:
        return await self._client.execute_unary(
            request=req, method=DELETE_PERSONA, headers=headers, timeout_ms=timeout_ms,
        )

    async def post_verdict(
        self,
        req: PostVerdictRequest,
        *,
        headers=None,
        timeout_ms: int | None = None,
    ) -> PostVerdictResponse:
        return await self._client.execute_unary(
            request=req, method=POST_VERDICT, headers=headers, timeout_ms=timeout_ms,
        )
