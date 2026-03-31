from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class Persona(_message.Message):
    __slots__ = ("name", "display_name", "model", "role", "title", "sex", "congress", "evolves", "avatar_url", "status", "prompt", "last_verdict", "last_verdict_date", "md_path", "special_seat", "stakeholder_only", "times_evolved", "times_retired", "times_reinstated", "total_congresses", "updated_at")
    NAME_FIELD_NUMBER: _ClassVar[int]
    DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
    MODEL_FIELD_NUMBER: _ClassVar[int]
    ROLE_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    SEX_FIELD_NUMBER: _ClassVar[int]
    CONGRESS_FIELD_NUMBER: _ClassVar[int]
    EVOLVES_FIELD_NUMBER: _ClassVar[int]
    AVATAR_URL_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    PROMPT_FIELD_NUMBER: _ClassVar[int]
    LAST_VERDICT_FIELD_NUMBER: _ClassVar[int]
    LAST_VERDICT_DATE_FIELD_NUMBER: _ClassVar[int]
    MD_PATH_FIELD_NUMBER: _ClassVar[int]
    SPECIAL_SEAT_FIELD_NUMBER: _ClassVar[int]
    STAKEHOLDER_ONLY_FIELD_NUMBER: _ClassVar[int]
    TIMES_EVOLVED_FIELD_NUMBER: _ClassVar[int]
    TIMES_RETIRED_FIELD_NUMBER: _ClassVar[int]
    TIMES_REINSTATED_FIELD_NUMBER: _ClassVar[int]
    TOTAL_CONGRESSES_FIELD_NUMBER: _ClassVar[int]
    UPDATED_AT_FIELD_NUMBER: _ClassVar[int]
    name: str
    display_name: str
    model: str
    role: str
    title: str
    sex: str
    congress: bool
    evolves: bool
    avatar_url: str
    status: str
    prompt: str
    last_verdict: str
    last_verdict_date: str
    md_path: str
    special_seat: int
    stakeholder_only: int
    times_evolved: int
    times_retired: int
    times_reinstated: int
    total_congresses: int
    updated_at: str
    def __init__(self, name: _Optional[str] = ..., display_name: _Optional[str] = ..., model: _Optional[str] = ..., role: _Optional[str] = ..., title: _Optional[str] = ..., sex: _Optional[str] = ..., congress: bool = ..., evolves: bool = ..., avatar_url: _Optional[str] = ..., status: _Optional[str] = ..., prompt: _Optional[str] = ..., last_verdict: _Optional[str] = ..., last_verdict_date: _Optional[str] = ..., md_path: _Optional[str] = ..., special_seat: _Optional[int] = ..., stakeholder_only: _Optional[int] = ..., times_evolved: _Optional[int] = ..., times_retired: _Optional[int] = ..., times_reinstated: _Optional[int] = ..., total_congresses: _Optional[int] = ..., updated_at: _Optional[str] = ...) -> None: ...

class ListPersonasRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ListPersonasResponse(_message.Message):
    __slots__ = ("personas",)
    PERSONAS_FIELD_NUMBER: _ClassVar[int]
    personas: _containers.RepeatedCompositeFieldContainer[Persona]
    def __init__(self, personas: _Optional[_Iterable[_Union[Persona, _Mapping]]] = ...) -> None: ...

class GetPersonaRequest(_message.Message):
    __slots__ = ("name",)
    NAME_FIELD_NUMBER: _ClassVar[int]
    name: str
    def __init__(self, name: _Optional[str] = ...) -> None: ...

class GetPersonaResponse(_message.Message):
    __slots__ = ("persona",)
    PERSONA_FIELD_NUMBER: _ClassVar[int]
    persona: Persona
    def __init__(self, persona: _Optional[_Union[Persona, _Mapping]] = ...) -> None: ...

class CreatePersonaRequest(_message.Message):
    __slots__ = ("name", "display_name", "model", "role", "title", "sex", "congress", "evolves", "avatar_url", "prompt")
    NAME_FIELD_NUMBER: _ClassVar[int]
    DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
    MODEL_FIELD_NUMBER: _ClassVar[int]
    ROLE_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    SEX_FIELD_NUMBER: _ClassVar[int]
    CONGRESS_FIELD_NUMBER: _ClassVar[int]
    EVOLVES_FIELD_NUMBER: _ClassVar[int]
    AVATAR_URL_FIELD_NUMBER: _ClassVar[int]
    PROMPT_FIELD_NUMBER: _ClassVar[int]
    name: str
    display_name: str
    model: str
    role: str
    title: str
    sex: str
    congress: bool
    evolves: bool
    avatar_url: str
    prompt: str
    def __init__(self, name: _Optional[str] = ..., display_name: _Optional[str] = ..., model: _Optional[str] = ..., role: _Optional[str] = ..., title: _Optional[str] = ..., sex: _Optional[str] = ..., congress: bool = ..., evolves: bool = ..., avatar_url: _Optional[str] = ..., prompt: _Optional[str] = ...) -> None: ...

class CreatePersonaResponse(_message.Message):
    __slots__ = ("persona",)
    PERSONA_FIELD_NUMBER: _ClassVar[int]
    persona: Persona
    def __init__(self, persona: _Optional[_Union[Persona, _Mapping]] = ...) -> None: ...

class UpdatePersonaRequest(_message.Message):
    __slots__ = ("name", "display_name", "model", "role", "title", "sex", "congress", "evolves", "avatar_url", "prompt", "status")
    NAME_FIELD_NUMBER: _ClassVar[int]
    DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
    MODEL_FIELD_NUMBER: _ClassVar[int]
    ROLE_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    SEX_FIELD_NUMBER: _ClassVar[int]
    CONGRESS_FIELD_NUMBER: _ClassVar[int]
    EVOLVES_FIELD_NUMBER: _ClassVar[int]
    AVATAR_URL_FIELD_NUMBER: _ClassVar[int]
    PROMPT_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    name: str
    display_name: str
    model: str
    role: str
    title: str
    sex: str
    congress: bool
    evolves: bool
    avatar_url: str
    prompt: str
    status: str
    def __init__(self, name: _Optional[str] = ..., display_name: _Optional[str] = ..., model: _Optional[str] = ..., role: _Optional[str] = ..., title: _Optional[str] = ..., sex: _Optional[str] = ..., congress: bool = ..., evolves: bool = ..., avatar_url: _Optional[str] = ..., prompt: _Optional[str] = ..., status: _Optional[str] = ...) -> None: ...

class UpdatePersonaResponse(_message.Message):
    __slots__ = ("persona",)
    PERSONA_FIELD_NUMBER: _ClassVar[int]
    persona: Persona
    def __init__(self, persona: _Optional[_Union[Persona, _Mapping]] = ...) -> None: ...

class DeletePersonaRequest(_message.Message):
    __slots__ = ("name",)
    NAME_FIELD_NUMBER: _ClassVar[int]
    name: str
    def __init__(self, name: _Optional[str] = ...) -> None: ...

class DeletePersonaResponse(_message.Message):
    __slots__ = ("ok", "deleted")
    OK_FIELD_NUMBER: _ClassVar[int]
    DELETED_FIELD_NUMBER: _ClassVar[int]
    ok: bool
    deleted: str
    def __init__(self, ok: bool = ..., deleted: _Optional[str] = ...) -> None: ...

class PostVerdictRequest(_message.Message):
    __slots__ = ("name", "verdict", "date")
    NAME_FIELD_NUMBER: _ClassVar[int]
    VERDICT_FIELD_NUMBER: _ClassVar[int]
    DATE_FIELD_NUMBER: _ClassVar[int]
    name: str
    verdict: str
    date: str
    def __init__(self, name: _Optional[str] = ..., verdict: _Optional[str] = ..., date: _Optional[str] = ...) -> None: ...

class PostVerdictResponse(_message.Message):
    __slots__ = ("ok",)
    OK_FIELD_NUMBER: _ClassVar[int]
    ok: bool
    def __init__(self, ok: bool = ...) -> None: ...
