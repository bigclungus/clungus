from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class StartSessionRequest(_message.Message):
    __slots__ = ("topic", "discord_user")
    TOPIC_FIELD_NUMBER: _ClassVar[int]
    DISCORD_USER_FIELD_NUMBER: _ClassVar[int]
    topic: str
    discord_user: str
    def __init__(self, topic: _Optional[str] = ..., discord_user: _Optional[str] = ...) -> None: ...

class StartSessionResponse(_message.Message):
    __slots__ = ("session_id", "session_number")
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    SESSION_NUMBER_FIELD_NUMBER: _ClassVar[int]
    session_id: str
    session_number: int
    def __init__(self, session_id: _Optional[str] = ..., session_number: _Optional[int] = ...) -> None: ...

class PostDebateRequest(_message.Message):
    __slots__ = ("task", "identity", "session_id")
    TASK_FIELD_NUMBER: _ClassVar[int]
    IDENTITY_FIELD_NUMBER: _ClassVar[int]
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    task: str
    identity: str
    session_id: str
    def __init__(self, task: _Optional[str] = ..., identity: _Optional[str] = ..., session_id: _Optional[str] = ...) -> None: ...

class PostDebateResponse(_message.Message):
    __slots__ = ("response", "identity")
    RESPONSE_FIELD_NUMBER: _ClassVar[int]
    IDENTITY_FIELD_NUMBER: _ClassVar[int]
    response: str
    identity: str
    def __init__(self, response: _Optional[str] = ..., identity: _Optional[str] = ...) -> None: ...

class StreamDebateRequest(_message.Message):
    __slots__ = ("session_id",)
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    session_id: str
    def __init__(self, session_id: _Optional[str] = ...) -> None: ...

class DebateToken(_message.Message):
    __slots__ = ("identity", "display_name", "text", "done")
    IDENTITY_FIELD_NUMBER: _ClassVar[int]
    DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
    TEXT_FIELD_NUMBER: _ClassVar[int]
    DONE_FIELD_NUMBER: _ClassVar[int]
    identity: str
    display_name: str
    text: str
    done: bool
    def __init__(self, identity: _Optional[str] = ..., display_name: _Optional[str] = ..., text: _Optional[str] = ..., done: bool = ...) -> None: ...

class ListIdentitiesRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class Identity(_message.Message):
    __slots__ = ("name", "role", "display_name", "avatar_url", "model", "status", "congress", "evolves", "title", "sex", "traits")
    NAME_FIELD_NUMBER: _ClassVar[int]
    ROLE_FIELD_NUMBER: _ClassVar[int]
    DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
    AVATAR_URL_FIELD_NUMBER: _ClassVar[int]
    MODEL_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    CONGRESS_FIELD_NUMBER: _ClassVar[int]
    EVOLVES_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    SEX_FIELD_NUMBER: _ClassVar[int]
    TRAITS_FIELD_NUMBER: _ClassVar[int]
    name: str
    role: str
    display_name: str
    avatar_url: str
    model: str
    status: str
    congress: bool
    evolves: bool
    title: str
    sex: str
    traits: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, name: _Optional[str] = ..., role: _Optional[str] = ..., display_name: _Optional[str] = ..., avatar_url: _Optional[str] = ..., model: _Optional[str] = ..., status: _Optional[str] = ..., congress: bool = ..., evolves: bool = ..., title: _Optional[str] = ..., sex: _Optional[str] = ..., traits: _Optional[_Iterable[str]] = ...) -> None: ...

class ListIdentitiesResponse(_message.Message):
    __slots__ = ("identities",)
    IDENTITIES_FIELD_NUMBER: _ClassVar[int]
    identities: _containers.RepeatedCompositeFieldContainer[Identity]
    def __init__(self, identities: _Optional[_Iterable[_Union[Identity, _Mapping]]] = ...) -> None: ...

class ListSessionsRequest(_message.Message):
    __slots__ = ("page_size",)
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    page_size: int
    def __init__(self, page_size: _Optional[int] = ...) -> None: ...

class SessionSummary(_message.Message):
    __slots__ = ("session_id", "session_number", "topic", "status", "verdict")
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    SESSION_NUMBER_FIELD_NUMBER: _ClassVar[int]
    TOPIC_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    VERDICT_FIELD_NUMBER: _ClassVar[int]
    session_id: str
    session_number: int
    topic: str
    status: str
    verdict: str
    def __init__(self, session_id: _Optional[str] = ..., session_number: _Optional[int] = ..., topic: _Optional[str] = ..., status: _Optional[str] = ..., verdict: _Optional[str] = ...) -> None: ...

class ListSessionsResponse(_message.Message):
    __slots__ = ("sessions",)
    SESSIONS_FIELD_NUMBER: _ClassVar[int]
    sessions: _containers.RepeatedCompositeFieldContainer[SessionSummary]
    def __init__(self, sessions: _Optional[_Iterable[_Union[SessionSummary, _Mapping]]] = ...) -> None: ...

class GetSessionRequest(_message.Message):
    __slots__ = ("session_id",)
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    session_id: str
    def __init__(self, session_id: _Optional[str] = ...) -> None: ...

class GetSessionResponse(_message.Message):
    __slots__ = ("session_json",)
    SESSION_JSON_FIELD_NUMBER: _ClassVar[int]
    session_json: str
    def __init__(self, session_json: _Optional[str] = ...) -> None: ...

class PatchSessionRequest(_message.Message):
    __slots__ = ("session_id", "verdict", "status", "finished_at", "evolution", "thread_id", "task_titles")
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    VERDICT_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    FINISHED_AT_FIELD_NUMBER: _ClassVar[int]
    EVOLUTION_FIELD_NUMBER: _ClassVar[int]
    THREAD_ID_FIELD_NUMBER: _ClassVar[int]
    TASK_TITLES_FIELD_NUMBER: _ClassVar[int]
    session_id: str
    verdict: str
    status: str
    finished_at: str
    evolution: str
    thread_id: str
    task_titles: str
    def __init__(self, session_id: _Optional[str] = ..., verdict: _Optional[str] = ..., status: _Optional[str] = ..., finished_at: _Optional[str] = ..., evolution: _Optional[str] = ..., thread_id: _Optional[str] = ..., task_titles: _Optional[str] = ...) -> None: ...

class PatchSessionResponse(_message.Message):
    __slots__ = ("ok", "session_id")
    OK_FIELD_NUMBER: _ClassVar[int]
    SESSION_ID_FIELD_NUMBER: _ClassVar[int]
    ok: bool
    session_id: str
    def __init__(self, ok: bool = ..., session_id: _Optional[str] = ...) -> None: ...
