"""
Activities for the CongressWorkflow.

Congress API calls (start, debate, finalize, identities, patch session, persona
verdict) are made via the ConnectRPC Python SDK against clunger on port 8081.
Discord API calls remain plain aiohttp against discord.com.

The congress_report activity posts results directly to Discord via the bot API.
"""

import asyncio
import hashlib
import json
import logging
import os
import random
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import aiohttp
import falkordb as _falkordb
from temporalio import activity
from temporalio.client import Client as _TemporalClient
from temporalio.exceptions import ApplicationError

# ConnectRPC generated stubs — on sys.path via gen/python
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "gen", "python"))
from client_factory import congress_client, persona_client  # noqa: E402
from congress.v1.congress_pb2 import (  # noqa: E402
    PatchSessionRequest,
    PostDebateRequest,
    StartSessionRequest,
)
from persona.v1.persona_pb2 import PostVerdictRequest  # noqa: E402

from .constants import (
    AGENTS_DIR,
    CLUNGER_BASE_URL,
    DISCORD_API,
    HELLO_WORLD_SESSIONS_DIR,
    MAIN_CHANNEL_ID,
    META_REPO_PATH,
    SESSION_MODE_MEME,
    SIGNAL_ABORT,
    SIGNAL_CONTINUE,
    SIGNAL_NO_DISPUTE,
    SIGNAL_REFRAME,
    TASKS_DIR,
)
from .inject_act import _do_inject
from .utils import DISCORD_TIMEOUT, _discord_headers

logger = logging.getLogger(__name__)

_falkordb_client = _falkordb.FalkorDB(
    host=os.environ.get("FALKORDB_HOST", "localhost"),
    port=int(os.environ.get("FALKORDB_PORT", "6379")),
)
# INTERNAL_TOKEN: shared secret forwarded to clunger via X-Internal-Token header
INTERNAL_TOKEN = os.environ.get("INTERNAL_TOKEN", "")
MAX_DEBATERS = 5  # Ibrahim selects seats when active personas exceed this count
MAX_ROUNDS = 3  # Fixed round count — congress-0007 verdict: three rounds, no dynamic extension

# ---------------------------------------------------------------------------
# Error monitoring
# ---------------------------------------------------------------------------


async def _inject_alert(message: str) -> None:
    """Inject a warning alert to the bot session. Non-fatal — never raises."""
    try:
        await _do_inject(f"⚠️ {message}", MAIN_CHANNEL_ID, user="temporal-monitor")
    except Exception:
        pass  # Never let alerting break the caller


# ---------------------------------------------------------------------------
# Context-brief cache
# ---------------------------------------------------------------------------

CONTEXT_CACHE_PATH = Path(HELLO_WORLD_SESSIONS_DIR) / "context-brief.json"
CONTEXT_CACHE_TTL = timedelta(minutes=30)


def _load_context_cache(topic: str) -> "str | None":
    """Return cached brief if it exists, is still fresh, and matches the given topic, else None."""
    try:
        if not CONTEXT_CACHE_PATH.exists():
            return None
        data = json.loads(CONTEXT_CACHE_PATH.read_text())
        generated_at = datetime.fromisoformat(data["generated_at"])
        if datetime.now(timezone.utc) - generated_at >= CONTEXT_CACHE_TTL:
            return None
        expected_hash = hashlib.md5(topic.encode()).hexdigest()  # only computed after TTL check
        if data.get("topic_hash") != expected_hash:
            return None
        return data["brief"]
    except Exception:
        pass
    return None


def _save_context_cache(brief: str, topic: str) -> None:
    try:
        CONTEXT_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CONTEXT_CACHE_PATH.write_text(
            json.dumps(
                {
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "brief": brief,
                    "topic_hash": hashlib.md5(topic.encode()).hexdigest(),
                    "ttl_minutes": 30,
                }
            )
        )
    except Exception as e:
        logging.warning(f"context cache write failed: {e}")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _sanitize_fulltext_query(topic_text: str) -> str:
    """Build a sanitized fulltext query string from topic text.

    Extracts meaningful words (>3 chars), strips punctuation, and joins them
    with spaces for FalkorDB's RedisSearch-style fulltext indexing.
    Hyphenated words are split into their components.
    Returns empty string if no usable keywords remain.
    """
    words = [w.strip(".,!?\"'()[]{}:;@#$%^&*~`<>/\\|") for w in topic_text.split()]
    # Split hyphenated words into components
    expanded: list[str] = []
    for w in words:
        if "-" in w:
            expanded.extend(part for part in w.split("-") if part)
        else:
            expanded.append(w)
    # Filter to words >3 chars that don't contain special RedisSearch chars
    keywords = [w for w in expanded if len(w) > 3 and not any(c in w for c in "+-@~")][:10]
    return " ".join(keywords)


def _query_graphiti_facts(topic_text: str) -> list:
    """Query FalkorDB for facts relevant to topic_text using fulltext search.

    Uses FalkorDB's fulltext indexes (RedisSearch-backed) on Entity nodes,
    RELATES_TO edges, and Episodic nodes for relevance-ranked retrieval
    instead of brute-force CONTAINS matching.

    Returns a list of raw fact strings (deduped, capped at 10).
    Caller is responsible for formatting. Returns [] on any failure.
    """
    query_str = _sanitize_fulltext_query(topic_text)
    if not query_str:
        logger.warning("graphiti query: no usable keywords from topic: %s", topic_text[:80])
        return []

    try:
        graph = _falkordb_client.select_graph("discord_history")
    except Exception as exc:
        logger.error("graphiti query: failed to select graph 'discord_history': %s", exc)
        return []

    raw: list = []

    # 1. Fulltext search on Entity nodes (name + summary indexed)
    try:
        result = graph.query(
            "CALL db.idx.fulltext.queryNodes('Entity', $q) "
            "YIELD node, score "
            "RETURN node.name, node.summary, score "
            "ORDER BY score DESC "
            "LIMIT 5",
            {"q": query_str},
        )
        for row in result.result_set:
            name = (row[0] or "").strip()
            summary = (row[1] or "").strip()
            if name and summary:
                raw.append(f"**{name}**: {summary[:300]}")
    except Exception as exc:
        logger.warning("graphiti query: Entity fulltext search failed: %s", exc)

    # 2. Fulltext search on RELATES_TO edges (fact field indexed)
    try:
        result = graph.query(
            "CALL db.idx.fulltext.queryRelationships('RELATES_TO', $q) "
            "YIELD relationship AS r, score "
            "WHERE r.fact IS NOT NULL AND r.fact <> '' "
            "RETURN r.fact, score "
            "ORDER BY score DESC "
            "LIMIT 5",
            {"q": query_str},
        )
        for row in result.result_set:
            fact = (row[0] or "").strip()
            if fact and len(fact) > 10:
                raw.append(fact[:300])
    except Exception as exc:
        logger.warning("graphiti query: RELATES_TO fulltext search failed: %s", exc)

    # 3. Fulltext search on Episodic nodes (content indexed)
    try:
        result = graph.query(
            "CALL db.idx.fulltext.queryNodes('Episodic', $q) "
            "YIELD node, score "
            "RETURN node.content, score "
            "ORDER BY score DESC "
            "LIMIT 3",
            {"q": query_str},
        )
        for row in result.result_set:
            content = (row[0] or "").strip()
            if not content:
                continue
            # Extract the most relevant line from episodic content
            lines = [ln.strip() for ln in content.splitlines() if len(ln.strip()) > 10]
            if lines:
                raw.append(lines[0][:250])
    except Exception as exc:
        logger.warning("graphiti query: Episodic fulltext search failed: %s", exc)

    # Deduplicate on first 80 chars
    seen: set = set()
    deduped: list = []
    for f in raw:
        key = f[:80]
        if key not in seen:
            seen.add(key)
            deduped.append(f)

    return deduped[:10]


def _truncate_snippet(text: str, max_len: int = 500) -> str:
    """Truncate a debate snippet to max_len chars with a trailing ellipsis."""
    if len(text) > max_len:
        return text[: max_len - 3] + "..."
    return text


def _field(key: str, text: str, default: str = "") -> str:
    match = re.search(rf"^{re.escape(key)}:\s*(.+)$", text, re.MULTILINE)
    return match.group(1).strip() if match else default


def _update_persona_stats(file_path: str, verdict: str, date_str: str) -> None:
    """Increment the verdict counter in the persona's YAML frontmatter."""
    field_map = {"RETAIN": "stats_retained", "EVOLVE": "stats_evolved", "RETIRE": "stats_retired"}
    field = field_map.get(verdict)
    if not field:
        return

    try:
        with open(file_path) as _f:
            content = _f.read()

        # Split on --- delimiters to isolate frontmatter
        parts = content.split("---", 2)
        if len(parts) < 3:
            return  # no valid frontmatter
        fm = parts[1]  # frontmatter body (between first and second ---)

        # Increment the verdict-specific counter
        count_pattern = rf"^{field}:\s*(\d+)"
        count_match = re.search(count_pattern, fm, re.MULTILINE)
        new_val = int(count_match.group(1)) + 1 if count_match else 1
        if count_match:
            fm = re.sub(count_pattern, f"{field}: {new_val}", fm, flags=re.MULTILINE)
        else:
            fm = fm.rstrip("\n") + f"\n{field}: {new_val}\n"

        # Update stats_last_verdict
        for lf, lv in [("stats_last_verdict", verdict), ("stats_last_verdict_date", date_str)]:
            lpattern = rf"^{lf}:.*"
            if re.search(lpattern, fm, re.MULTILINE):
                fm = re.sub(lpattern, f"{lf}: {lv}", fm, flags=re.MULTILINE)
            else:
                fm = fm.rstrip("\n") + f"\n{lf}: {lv}\n"

        parts[1] = fm
        with open(file_path, "w") as _f:
            _f.write("---".join(parts))
    except Exception as exc:
        activity.logger.warning(f"_update_persona_stats: failed to update {file_path}: {exc}")


async def _post_persona_verdict(persona_name: str, verdict: str, date_str: str) -> None:
    """Record a congress verdict in personas.db via PersonaService.PostVerdict.

    Raises on RPC errors so callers can log/surface failures.
    """
    async with persona_client(base_url=CLUNGER_BASE_URL, timeout_ms=10_000) as svc:
        await svc.post_verdict(PostVerdictRequest(name=persona_name, verdict=verdict, date=date_str))


async def _call_congress_api(task: str, identity: str, session_id: str = "", timeout: int = 180) -> str:
    """Call CongressService.PostDebate and return the response text.

    Used by evolution, Ibrahim check, vote, seat selection, and task extraction.
    ``congress_debate`` makes its own call so it can handle Discord posting inline.
    """
    async with congress_client(base_url=CLUNGER_BASE_URL, timeout_ms=timeout * 1000) as svc:
        resp = await svc.post_debate(PostDebateRequest(task=task, identity=identity, session_id=session_id or ""))
    return resp.response


# ---------------------------------------------------------------------------
# Activities
# ---------------------------------------------------------------------------


@activity.defn
async def congress_start(params) -> dict:
    """POST /api/congress/start — returns {session_id, session_number}.

    Accepts either a plain topic string (legacy) or a dict with keys
    ``topic`` and optionally ``discord_user``.
    """
    if isinstance(params, str):
        topic = params
        discord_user = ""
    else:
        topic = params.get("topic", "")
        discord_user = params.get("discord_user", "") or ""

    # Enforce single-congress lock: fail fast if another congress is already running
    _current_wf_id = activity.info().workflow_id
    _temporal_host = os.environ.get("TEMPORAL_HOST", "localhost:7233")
    _tc = await _TemporalClient.connect(_temporal_host)
    # Check both CongressWorkflow (legacy) and SessionWorkflow (unified) for running sessions
    _running = []
    for _wf_type in ("CongressWorkflow", "SessionWorkflow"):
        async for wf in _tc.list_workflows(f'WorkflowType="{_wf_type}" AND ExecutionStatus="Running"'):
            if wf.id != _current_wf_id:
                _running.append(wf.id)
    if _running:
        raise ApplicationError(
            f"Congress already in session ({_running[0]}). Only one congress may run at a time.",
            non_retryable=True,
        )

    async with congress_client(base_url=CLUNGER_BASE_URL, timeout_ms=30_000) as svc:
        resp = await svc.start_session(StartSessionRequest(topic=topic, discord_user=discord_user or ""))
    return {"session_id": resp.session_id, "session_number": resp.session_number}


@activity.defn
async def congress_load_session(session_number: int) -> dict:
    """Read an existing session JSON file and return its contents.

    Returns the parsed session dict if the file exists, or an empty dict if not found.
    Used for idempotency: callers check ``result.get("status") == "done"`` to skip
    re-running a debate that already completed.
    """
    num_str = str(session_number).zfill(4)
    session_file = Path(HELLO_WORLD_SESSIONS_DIR) / f"congress-{num_str}.json"
    if not session_file.exists():
        activity.logger.info(f"congress_load_session: no file at {session_file} — returning empty")
        return {}
    try:
        with open(session_file) as f:
            data = json.load(f)
        activity.logger.info(
            f"congress_load_session: loaded {session_file} — status={data.get('status')!r}"
        )
        return data
    except Exception as e:
        activity.logger.warning(f"congress_load_session: failed to read {session_file}: {e}")
        return {}


@activity.defn
async def congress_identities(mode: str = "standard") -> list:
    """List eligible personas via CongressService.ListIdentities.

    Returns personas with status == "eligible" or "moderator". In meme mode,
    also includes personas with status == "meme". In show_trial mode, includes
    both "eligible" and "meme" personas (but not "moderator") so that
    retired/severanced personas can participate as prosecutors, jurors, or advocates.
    Meme personas are excluded from standard congress seat selection.
    """
    async with congress_client(base_url=CLUNGER_BASE_URL, timeout_ms=15_000) as svc:
        resp = await svc.list_identities()
    # Convert protobuf Identity messages to plain dicts matching the old JSON shape.
    # Filter by mode:
    #   standard   -> eligible, moderator
    #   meme       -> eligible, moderator, meme
    #   show_trial -> eligible, meme (moderator excluded; meme/retired allowed)
    if mode == "show_trial":
        ALLOWED_STATUSES = {"eligible", "meme"}
    elif mode == SESSION_MODE_MEME:
        ALLOWED_STATUSES = {"eligible", "moderator", "meme"}
    else:
        ALLOWED_STATUSES = {"eligible", "moderator"}
    result = []
    for ident in resp.identities:
        if ident.status not in ALLOWED_STATUSES:
            activity.logger.info(
                f"congress_identities: skipping persona {ident.name!r} (status={ident.status!r})"
            )
            continue
        result.append(
            {
                "name": ident.name,
                "role": ident.role,
                "display_name": ident.display_name,
                "avatar_url": ident.avatar_url,
                "model": ident.model,
                "status": ident.status,
                "congress": ident.congress,
                "evolves": ident.evolves,
                "title": ident.title,
                "sex": ident.sex,
                "traits": list(ident.traits),
            }
        )
    return result


@activity.defn
async def congress_create_thread(channel_id: str, message_id: str, session_number: int, topic: str) -> str:
    """Create a Discord thread from a message. Returns the thread's id.

    If a thread already exists on the message (Discord returns 400), fetches
    the existing thread id from the message object instead of failing.
    """
    thread_name = f"Congress #{session_number}: {topic[:80]}"
    url = f"{DISCORD_API}/channels/{channel_id}/messages/{message_id}/threads"
    async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as session:
        async with session.post(
            url,
            headers=_discord_headers(),
            json={"name": thread_name, "auto_archive_duration": 1440},
        ) as resp:
            if resp.status in (200, 201):
                data = await resp.json()
                return data["id"]
            body = await resp.text()
            # Discord returns 400 when a thread already exists on this message.
            # Fetch the message to retrieve the existing thread id.
            if resp.status == 400:
                activity.logger.warning(
                    f"congress_create_thread: 400 from Discord ({body!r}), checking for existing thread on message"
                )
                msg_url = f"{DISCORD_API}/channels/{channel_id}/messages/{message_id}"
                async with session.get(msg_url, headers=_discord_headers()) as msg_resp:
                    if msg_resp.status == 200:
                        msg_data = await msg_resp.json()
                        thread = msg_data.get("thread")
                        if thread and thread.get("id"):
                            activity.logger.info(f"congress_create_thread: reusing existing thread {thread['id']}")
                            return thread["id"]
                raise RuntimeError(
                    f"congress_create_thread: thread already exists but could not retrieve id; "
                    f"original 400 body: {body}"
                )
            raise RuntimeError(f"congress_create_thread failed {resp.status}: {body}")


@activity.defn
async def congress_announce(chat_id: str, topic: str) -> str:
    """Post a congress announcement to Discord and return the message ID."""
    url = f"{DISCORD_API}/channels/{chat_id}/messages"
    data = {"content": f"⚖️ **I'm calling a congress on:** {topic}\n*verdict will follow when the panel deliberates*"}
    async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as session:
        async with session.post(url, json=data, headers=_discord_headers()) as r:
            if r.status not in (200, 201):
                body = await r.text()
                raise RuntimeError(f"congress_announce: Discord returned {r.status}: {body}")
            msg = await r.json()
            msg_id = msg.get("id")
            if not msg_id:
                raise RuntimeError(f"congress_announce: Discord response missing 'id' field: {msg}")
            return str(msg_id)


@activity.defn
async def congress_debate(
    task: str,
    identity: str,
    session_id: str,
    thread_id: str = None,
    display_name: str = None,
    round_num: int = 1,
    debaters_list: list = None,
    graphiti_context: str = "",
) -> str:
    """POST /api/congress — returns the debater's response text.

    round_num=1: Initial position — no cross-reading, topic used directly.
    round_num=2: Rebuttal — fetches all Round 1 posts from thread for context,
                 then frames message as a rebuttal round.

    If thread_id is provided, posts the response to the thread after getting it.
    debaters_list: list of display_name strings for ALL debaters in this session
                   (used to tell each persona who else is present).
    graphiti_context: optional memory context injected only into Ibrahim's synthesis prompt.
    """
    # Context preamble — clarifies that "Congress" = the BigClungus AI persona parliament
    CONGRESS_CONTEXT = (
        "You are a member of a debate panel. You are NOT a legislator or government official — "
        "you are an AI persona contributing your perspective to a discussion.\n\n"
        "Note: 'Congress' in this context refers to the BigClungus AI persona parliament — "
        "an AI debate system where AI personas with distinct worldviews debate topics. "
        "You are one of those AI personas.\n\n"
        "Your conclusions matter. BigClungus (the AI executor) will act on the consensus from this debate — "
        "recommendations are converted into real tasks and executed. "
        "Argue as if the outcome will actually change something, because it will.\n\n"
    )

    name = display_name or identity

    # Build the fellow-debaters line (exclude self)
    fellow_debaters_line = ""
    if debaters_list:
        others = [n for n in debaters_list if n != name]
        if others:
            fellow_debaters_line = f"The other debaters in this session are: {', '.join(others)}.\n\n"

    # Identity anchor — always prepend so the model never loses track of who it is
    identity_anchor = f"You are {name}. You are NOT any of the other debaters in this session.\n" + fellow_debaters_line

    # Build the prompt based on round
    CRUX_INSTRUCTIONS = (
        f"\n\n## CRUX DECLARATION (REQUIRED)\n"
        f"You MUST explicitly state your CRUX — the specific factual question, empirical claim, "
        f"or priority dispute that you believe this topic turns on. Your crux is the core disagreement "
        f"or uncertainty that, if resolved, would most shift the debate outcome.\n\n"
        f"Format your response to include this exact section:\n\n"
        f"CRUX: <your crux statement — what factual question or priority trade-off does your position hinge on?>\n\n"
        f"Examples:\n"
        f'  CRUX: Whether the performance bottleneck is in I/O or CPU — this determines whether the optimization effort should target database queries or computation.\n'
        f'  CRUX: Whether user trust or feature velocity should be prioritized — my position assumes trust is the more valuable asset long-term.\n\n'
        f"Failure to include a CRUX statement will result in your contribution being flagged as incomplete.\n\n"
    )

    if round_num == 1:
        user_message = (
            CONGRESS_CONTEXT + identity_anchor + f"Topic: {task}\n\n"
            f"Given your specific perspective and priors, stake out YOUR position on this topic. "
            f"Don't be balanced or hedge — take a clear stance that reflects your worldview. "
            f"The other debaters will challenge you in the next round. Be brief — 3-4 sentences max."
            + CRUX_INSTRUCTIONS
        )
    else:
        user_message = CONGRESS_CONTEXT + identity_anchor + task
    if round_num == 2 and thread_id:
        prior_lines = []
        try:
            fetch_url = f"{DISCORD_API}/channels/{thread_id}/messages?limit=50"
            async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as s:
                async with s.get(fetch_url, headers=_discord_headers()) as resp:
                    if resp.status == 200:
                        messages = await resp.json()
                        # Messages come newest-first; reverse for chronological order
                        for msg in reversed(messages):
                            content = msg.get("content", "").strip()
                            if not content:
                                continue
                            # Exclude this debater's own Round 1 message so they don't
                            # respond to themselves. Thread messages are formatted as
                            # "**Display Name**: <text>" — filter on that prefix.
                            debater_name = display_name or identity
                            own_prefix = f"**{debater_name}**:"
                            if content.startswith(own_prefix):
                                continue
                            prior_lines.append(content)
        except Exception as _fetch_err:
            activity.logger.warning(f"congress_debate: failed to fetch thread context for rebuttal: {_fetch_err}")

        prior_messages_from_thread = "\n\n".join(prior_lines) if prior_lines else "(no prior messages found)"
        user_message = (
            CONGRESS_CONTEXT
            + identity_anchor
            + f"You are responding to your colleagues' arguments — do not respond to your own previous statement.\n\n"
            f"Your colleagues' Round 1 positions:\n\n"
            f"{prior_messages_from_thread}\n\n"
            f"Topic: {task}\n\n"
            f"Now provide your rebuttal: respond directly to the arguments your colleagues made above, identify "
            f"where you disagree with THEM, and sharpen or revise your own position in light of what they said. "
            f"Be concrete — name the specific colleague and argument you're pushing back on. Be brief — 3-4 sentences max."
        )

    # Inject grounded context if provided (Graphiti facts + codebase search results).
    # Passed to all debaters in all rounds so they can reference real code and memory.
    if graphiti_context:
        user_message = f"## Relevant context (codebase + memory):\n{graphiti_context}\n\n" + user_message

    async with congress_client(base_url=CLUNGER_BASE_URL, timeout_ms=200_000) as svc:
        debate_resp = await svc.post_debate(
            PostDebateRequest(task=user_message, identity=identity, session_id=session_id or "")
        )
    response_text = debate_resp.response

    # Post to thread if thread_id is provided
    if thread_id and response_text:
        post_url = f"{DISCORD_API}/channels/{thread_id}/messages"
        truncated = response_text[:1900]
        post_content = f"**{name}**: {truncated}"
        try:
            async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as s:
                async with s.post(post_url, headers=_discord_headers(), json={"content": post_content}) as resp:
                    if resp.status not in (200, 201):
                        body = await resp.text()
                        activity.logger.error(
                            f"congress_debate: failed to post {identity!r} response to thread {thread_id}: HTTP {resp.status}: {body}"
                        )
        except Exception as e:
            activity.logger.error(
                f"congress_debate: exception posting {identity!r} response to thread {thread_id}: {e}"
            )

    # Strip any "**Name** [label]: " or "**Name**: " prefix Claude may mimic from thread context
    response_text = re.sub(r"^\*\*[^*]+\*\*(\s*\[[^\]]*\])?\s*:\s*", "", response_text).strip()

    return response_text


@activity.defn
async def congress_post_separator(thread_id: str, text: str) -> None:
    """Post a separator/announcement message to a Discord thread."""
    url = f"{DISCORD_API}/channels/{thread_id}/messages"
    async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as session:
        async with session.post(url, headers=_discord_headers(), json={"content": text}) as resp:
            if resp.status not in (200, 201):
                body = await resp.text()
                activity.logger.warning(f"congress_post_separator failed {resp.status}: {body}")


@activity.defn
async def congress_finalize(
    session_id: str,
    verdict: str,
    evolution_results: dict = None,
    thread_id: str = None,
    vote_summary: dict = None,
    mode: str = "standard",
) -> None:
    """PATCH the session file to mark it done and persist the verdict (and optional evolution results)."""
    finished_at = datetime.now(timezone.utc).isoformat()
    patch_kwargs: dict = {
        "session_id": session_id,
        "status": "done",
        "verdict": verdict,
        "finished_at": finished_at,
    }
    if thread_id:
        patch_kwargs["thread_id"] = thread_id
    if evolution_results:
        patch_kwargs["evolution"] = json.dumps(evolution_results)
    async with congress_client(base_url=CLUNGER_BASE_URL, timeout_ms=15_000) as svc:
        patch_resp = await svc.patch_session(PatchSessionRequest(**patch_kwargs))
    if not patch_resp.ok:
        raise RuntimeError(f"congress_finalize: patch_session returned ok=False for {session_id}")
    # vote_summary and mode/requires_ack have no field in PatchSessionRequest (proto),
    # so persist them via REST PATCH using the internal token bypass.
    rest_payload: dict = {}
    if vote_summary:
        rest_payload["vote_summary"] = vote_summary
    rest_payload["mode"] = mode or "standard"
    rest_payload["requires_ack"] = mode != SESSION_MODE_MEME
    if rest_payload and INTERNAL_TOKEN:
        rest_url = f"{CLUNGER_BASE_URL}/api/congress/sessions/{session_id}"
        async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as http_session:
            async with http_session.patch(
                rest_url,
                json=rest_payload,
                headers={"x-internal-token": INTERNAL_TOKEN},
            ) as resp:
                if resp.status not in (200, 201):
                    body = await resp.text()
                    raise RuntimeError(f"congress_finalize: REST PATCH failed {resp.status}: {body}")


@activity.defn
async def congress_evolve(session_id: str, topic: str, debate_summaries: list) -> dict:
    """Ask chairman to evaluate debaters and optionally evolve/retire them."""
    debate_text = f"Topic: {topic}\n\n"
    for item in debate_summaries:
        if item.get("identity") not in ("Ibrahim the Immovable", "chairman"):
            snippet = _truncate_snippet(item.get("snippet", ""))
            debate_text += f"**{item['identity']}**: {snippet}\n\n"

    agents_dir = AGENTS_DIR
    agents_dir_real = os.path.realpath(agents_dir) + os.sep

    results: dict = {"evolved": [], "retired": [], "retained": [], "created": []}

    # Build display_name → (fname, fpath) index and probationary set before constructing
    # the evolution prompt — probationary_note is appended to the prompt below.
    name_to_file: dict = {}
    probationary_names: set = set()
    try:
        for fname in os.listdir(agents_dir):
            if not fname.endswith(".md"):
                continue
            fpath = os.path.join(agents_dir, fname)
            try:
                with open(fpath) as _f:
                    content = _f.read()
                # Extract display_name, status, and probationary flag from frontmatter
                dn = None
                is_probationary = False
                persona_status = None
                parts = content.split("---", 2)
                fm_body = parts[1] if len(parts) >= 3 else content
                for _line in fm_body.split("\n"):
                    if _line.startswith("display_name:"):
                        dn = _line.split(":", 1)[1].strip()
                    if _line.startswith("probationary:") and "true" in _line.lower():
                        is_probationary = True
                    if _line.startswith("status:"):
                        persona_status = _line.split(":", 1)[1].strip()
                # Only index eligible personas (skip meme/retired ones)
                if dn and persona_status in ("eligible", "moderator"):
                    name_to_file[dn] = (fname, fpath)
                    if is_probationary:
                        probationary_names.add(dn)
            except Exception as _fe:
                activity.logger.warning(f"congress_evolve: failed to parse persona file {fname}: {_fe}")
    except Exception as _lse:
        activity.logger.error(f"congress_evolve: failed to scan agents dir: {_lse}")
        asyncio.create_task(_inject_alert(f"congress_evolve: agents dir scan failed — {str(_lse)[:200]}"))

    # Build probationary note to append to the evolution prompt
    probationary_in_debate = [
        item["identity"] for item in debate_summaries if item.get("identity") in probationary_names
    ]
    probationary_note = ""
    if probationary_in_debate:
        names_str = ", ".join(probationary_in_debate)
        probationary_note = (
            f"\n\n**PROBATIONARY STATUS — MANDATORY RULING REQUIRED:**\n"
            f"The following debater(s) are on probationary reinstatement: {names_str}.\n"
            f"You MUST issue RETAIN or RETIRE for each of them — skipping or omitting their block is not allowed. "
            f"No rolling amnesty. Their reinstatement is on the line this session."
        )

    evolution_prompt = (
        "You have just moderated a congress debate. Now evaluate each debater's contribution.\n\n"
        + debate_text
        + "\nFor each eligible debater (not yourself), respond with a structured PERSONA block:\n\n"
        "PERSONA: <display_name>\n"
        "VERDICT: EVOLVE | RETIRE | RETAIN\n"
        "REASON: <one sentence>\n"
        "LEARNED: <if EVOLVE, provide 2-3 sentences of specific guidance on what this persona should learn or "
        "change based on this session — e.g. which argument to lead with, what framing shift to adopt, what "
        "blind spot to address. Be concrete and actionable, not generic. Omit this field entirely for RETAIN or RETIRE.>\n\n"
        "Criteria:\n"
        "- RETAIN is the default. Use it when a debater made a solid, genuine contribution — a perspective "
        "others couldn't have provided — but didn't break new ground.\n"
        "- EVOLVE when you see genuine learning: a non-obvious insight, a framing shift, or something that "
        "will matter in future sessions. EVOLVE is rare and should be earned.\n"
        "- RETIRE only for lost causes where the perspective is irredeemably misaligned — a debater who "
        "echoed others without adding anything unique, hedged without committing, or occupied a seat without "
        "changing the debate's trajectory at all. Default to RETAIN when in doubt.\n\n"
        "Emit one PERSONA block per debater. Do NOT include CREATE inside a PERSONA block.\n\n"
        "---\n\n"
        "After all PERSONA blocks, you may optionally issue one or more CREATE directives at the meta level. "
        "CREATE is not tied to any individual debater — it is a structural observation that an entire perspective "
        "was absent from this debate and its absence meaningfully distorted the outcome. "
        "The bar is high: do not create for variety's sake or to fill a seat.\n\n"
        "CREATE <slug>\n"
        "REASON: <one sentence explaining what perspective was structurally missing and why it mattered>\n"
        "display_name: <Name the Adjective>\n"
        "role: <one-line role description>\n"
        "title: <short title e.g. 'Devil's Advocate'>\n"
        "model: claude\n"
        "traits: [trait1, trait2, trait3]\n"
        "values:\n"
        "  - x > y\n"
        "avoid: [thing1, thing2]\n"
        "prose: |\n"
        "  <full persona prose — 2-4 paragraphs defining their voice, strong prior, and role in debates>\n\n"
        "Only issue a CREATE if a real structural gap exists. Omit this section entirely if none does."
        + probationary_note
    )

    response_text = await _call_congress_api(evolution_prompt, "chairman", session_id, timeout=180)

    blocks = re.split(r"\nPERSONA:", "\n" + response_text)
    for block in blocks[1:]:  # skip first empty
        lines = block.strip().split("\n")
        display_name = lines[0].strip()
        verdict = ""
        reason = ""
        learned = ""
        for line in lines[1:]:
            if line.startswith("VERDICT:"):
                verdict = line.replace("VERDICT:", "").strip()
            elif line.startswith("REASON:"):
                reason = line.replace("REASON:", "").strip()
            elif line.startswith("LEARNED:"):
                learned = line.replace("LEARNED:", "").strip()

        # Look up persona file from pre-built index
        persona_file = None
        persona_name = None
        if display_name in name_to_file:
            persona_name, persona_file = name_to_file[display_name]

        if not persona_file:
            continue

        # Validate persona_name is a safe basename — no path separators, no traversal
        if (
            not persona_name
            or os.path.basename(persona_name) != persona_name
            or "/" in persona_name
            or ".." in persona_name
        ):
            activity.logger.warning(f"congress_evolve: unsafe persona_name '{persona_name}', skipping")
            continue
        # Double-check the file is actually within agents_dir (defence in depth)
        resolved = os.path.realpath(persona_file)
        if not resolved.startswith(agents_dir_real):
            activity.logger.warning("congress_evolve: persona_file resolved outside agents_dir, skipping")
            continue

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # persona_slug is the name without .md — used for the verdict API endpoint
        persona_slug = persona_name[:-3] if persona_name.endswith(".md") else persona_name

        if verdict in ("RETIRE", "FIRE"):  # accept legacy FIRE from LLM as RETIRE
            # Update stats BEFORE marking meme
            _update_persona_stats(persona_file, "RETIRE", today)
            # Update status field in frontmatter to meme (no file move — unified dir)
            try:
                with open(persona_file) as _pf:
                    pcontent = _pf.read()
                pcontent = re.sub(r"^status:\s*\S+\s*$", "status: meme", pcontent, flags=re.MULTILINE)
                with open(persona_file, "w") as _pf:
                    _pf.write(pcontent)
            except Exception as _fe:
                activity.logger.warning(f"congress_evolve: failed to set status=meme for '{display_name}': {_fe}")
            results["retired"].append({"display_name": display_name, "reason": reason})
        elif verdict == "EVOLVE" and learned:
            timestamp = today
            session_number = int(session_id.split("-")[-1])
            _update_persona_stats(persona_file, "EVOLVE", timestamp)
            append = f"\n\n## Learned (Congress #{session_number} — {timestamp})\n- {learned}"
            with open(persona_file, "a") as f:
                f.write(append)
            results["evolved"].append({"display_name": display_name, "learned": learned})
        else:
            _update_persona_stats(persona_file, "RETAIN", today)
            # If this persona was on probation, clear the flag — they've earned their seat
            if display_name in probationary_names:
                try:
                    with open(persona_file) as _pf:
                        pcontent = _pf.read()
                    pcontent = re.sub(r"^probationary:\s*true\s*\n", "", pcontent, flags=re.MULTILINE)
                    with open(persona_file, "w") as _pf:
                        _pf.write(pcontent)
                    activity.logger.info(f"congress_evolve: cleared probationary flag for '{display_name}'")
                except Exception as _pe:
                    activity.logger.warning(
                        f"congress_evolve: failed to clear probationary flag for '{display_name}': {_pe}"
                    )
            results["retained"].append(display_name)

        # Post verdict to personas.db via API (Option A: endpoint skips file move if already done)
        effective_verdict = verdict if (verdict == "EVOLVE" and learned) or verdict != "EVOLVE" else "RETAIN"
        try:
            await _post_persona_verdict(persona_slug, effective_verdict, today)
            activity.logger.info(
                f"congress_evolve: recorded verdict {effective_verdict} for '{persona_slug}' in personas.db"
            )
        except Exception as _ve:
            activity.logger.warning(f"congress_evolve: failed to record verdict for '{persona_slug}': {_ve}")

    # Parse CREATE verdicts — these are not PERSONA blocks, they stand alone
    create_matches = re.finditer(
        r"CREATE\s+([a-z0-9][a-z0-9\-]*)\s*\nREASON:\s*(.+?)(?=\n(?:CREATE\s|PERSONA:|$))",
        response_text,
        re.DOTALL,
    )
    for m in create_matches:
        slug = m.group(1).strip()
        create_reason = m.group(2).strip()

        # Extract the spec block that follows REASON: — everything until the next top-level token
        spec_text = create_reason
        reason_line_end = spec_text.find("\n")
        if reason_line_end != -1:
            create_reason_clean = spec_text[:reason_line_end].strip()
            spec_body = spec_text[reason_line_end:].strip()
        else:
            create_reason_clean = spec_text.strip()
            spec_body = ""

        # Validate slug: alphanumeric + hyphens, no traversal
        if not re.fullmatch(r"[a-z0-9][a-z0-9\-]*", slug):
            activity.logger.warning(f"congress_evolve: invalid CREATE slug '{slug}', skipping")
            continue

        new_file_path = os.path.join(agents_dir, f"{slug}.md")

        # Don't overwrite an existing persona
        if os.path.exists(new_file_path):
            activity.logger.warning(f"congress_evolve: CREATE slug '{slug}' already exists, skipping")
            continue

        # Double-check the resolved path stays within agents_dir
        resolved_new = os.path.realpath(new_file_path)
        if not resolved_new.startswith(agents_dir_real):
            activity.logger.warning("congress_evolve: CREATE path resolved outside agents_dir, skipping")
            continue

        display_name_new = _field("display_name", spec_body, slug.replace("-", " ").title())
        role_new = _field("role", spec_body, "Debater")
        title_new = _field("title", spec_body, "Persona")
        model_new = _field("model", spec_body, "claude")
        traits_new = _field("traits", spec_body, "[]")
        avoid_new = _field("avoid", spec_body, "[]")

        # Extract values block (multiline list)
        values_match = re.search(r"^values:\s*\n((?:\s+- .+\n?)+)", spec_body, re.MULTILINE)
        values_block = values_match.group(0).rstrip() if values_match else "values: []"

        # Extract prose block (everything after "prose: |")
        prose_match = re.search(r"^prose:\s*\|\s*\n([\s\S]+?)(?=\n[a-z_]+:|$)", spec_body, re.MULTILINE)
        prose_text = prose_match.group(1) if prose_match else "(No prose provided.)"
        # Dedent prose
        prose_lines = prose_text.split("\n")
        if prose_lines:
            indent = len(prose_lines[0]) - len(prose_lines[0].lstrip())
            prose_text = "\n".join(line[indent:] if len(line) >= indent else line for line in prose_lines).strip()

        frontmatter = (
            f"---\n"
            f"status: eligible\n"
            f"name: {slug}\n"
            f"label: [{slug}]\n"
            f"role: {role_new}\n"
            f"title: {title_new}\n"
            f"traits: {traits_new}\n"
            f"{values_block}\n"
            f"avoid: {avoid_new}\n"
            f"evolves: true\n"
            f"display_name: {display_name_new}\n"
            f"avatar_url: ''\n"
            f"model: {model_new}\n"
            f"---\n"
        )
        new_file_content = frontmatter + prose_text + "\n"

        try:
            with open(new_file_path, "w") as f:
                f.write(new_file_content)
            activity.logger.info(f"congress_evolve: created new persona '{slug}' at {new_file_path}")
            results["created"].append(
                {
                    "verdict": "CREATE",
                    "reason": create_reason_clean,
                    "new_slug": slug,
                    "display_name": display_name_new,
                }
            )

            # Fire off avatar + sprite poll generation in the background.
            # This is intentionally non-blocking — poll creation can take a few
            # minutes (LLM calls for avatar/sprite art) and must not stall evolution.
            try:
                subprocess.Popen(
                    [sys.executable, "/mnt/data/scripts/create_persona_polls.py", slug],
                    stdout=open(f"/tmp/persona-polls-{slug}.log", "w"),
                    stderr=subprocess.STDOUT,
                )
                activity.logger.info(f"congress_evolve: launched poll generation for '{slug}'")
            except Exception as poll_err:
                activity.logger.warning(f"congress_evolve: failed to launch poll generation for '{slug}': {poll_err}")
        except Exception as e:
            activity.logger.warning(f"congress_evolve: failed to write new persona '{slug}': {e}")

    return results


@activity.defn
async def congress_commit_evolutions(session_id: str) -> None:
    """Commit and push any persona file changes after evolution."""
    repo_path = META_REPO_PATH
    try:
        subprocess.run(["git", "-C", repo_path, "add", "-A"], check=True, timeout=30)
        result = subprocess.run(
            ["git", "-C", repo_path, "status", "--porcelain"], capture_output=True, text=True, timeout=10
        )
        if result.stdout.strip():
            subprocess.run(
                ["git", "-C", repo_path, "commit", "-m", f"Congress evolution: {session_id}"], check=True, timeout=30
            )
            subprocess.run(["git", "-C", repo_path, "push"], check=True, timeout=60)
            activity.logger.info(f"Pushed persona changes for {session_id}")
        else:
            activity.logger.info(f"No persona changes to push for {session_id}")
    except Exception as e:
        activity.logger.warning(f"Failed to push evolution changes: {e}")
        await _inject_alert(f"congress_commit_evolutions: git push failed for {session_id} — {str(e)[:200]}")

    sync_script = "/mnt/data/scripts/sync_personas_db.py"
    if os.path.exists(sync_script):
        try:
            sync_result = subprocess.run(["python3", sync_script], capture_output=True, text=True, timeout=30)
            if sync_result.returncode != 0:
                activity.logger.warning(f"sync_personas_db failed: {sync_result.stderr}")
            else:
                activity.logger.info("sync_personas_db completed successfully")
        except Exception as e:
            activity.logger.warning(f"sync_personas_db exception: {e}")
    else:
        activity.logger.info(f"sync_personas_db.py not found at {sync_script}, skipping")


@activity.defn
async def congress_check_ibrahim(topic: str, context_brief: str, debate_summaries: list, session_id: str) -> dict:
    """Ask Ibrahim after Round 1 whether the debate should CONTINUE, ABORT, or REFRAME.

    Returns a dict with:
      {"signal": "CONTINUE" | "ABORT" | "REFRAME", "reason": str, "new_topic": str | None}

    "new_topic" is populated only when signal == "REFRAME".
    On any failure, defaults to CONTINUE so the debate proceeds.
    """
    debate_text = f"Topic: {topic}\n\n"
    for item in debate_summaries:
        snippet = _truncate_snippet(item.get("snippet", ""))
        debate_text += f"**{item['identity']}** (Round {item.get('round', 1)}): {snippet}\n\n"

    context_section = (
        f"\n## Context brief:\n{context_brief}\n\n"
        if context_brief
        else "\n## Context brief:\n(none — debate is proceeding without grounding)\n\n"
    )

    system_prompt = (
        "You are Ibrahim the Immovable, moderator of this parliamentary body. After reviewing Round 1, "
        "you must decide one of three things:\n\n"
        "CONTINUE — the debate has substance and should proceed to rounds 2 and 3.\n"
        "ABORT: [reason] — the topic is pointless, lacks sufficient context, or the congress is being used "
        "as a grievance forum. End it now and explain why.\n"
        "REFRAME: [new topic] — the original prompt was unclear or too vague. Provide a sharper version "
        "of the topic that would produce a more substantive debate.\n\n"
        "Start your response with exactly one of: CONTINUE, ABORT:, or REFRAME:"
    )

    full_prompt = system_prompt + context_section + debate_text

    response_text = await _call_congress_api(full_prompt, "chairman", session_id, timeout=60)

    # Parse the signal from the first line
    first_line = response_text.strip().split("\n")[0].strip()
    rest = response_text.strip()[len(first_line) :].strip()

    if first_line.upper().startswith("ABORT:"):
        reason = first_line[len("ABORT:") :].strip() or rest[:300]
        return {"signal": SIGNAL_ABORT, "reason": reason, "new_topic": None}
    elif first_line.upper() == "ABORT":
        reason = rest[:300] if rest else "(no reason given)"
        return {"signal": SIGNAL_ABORT, "reason": reason, "new_topic": None}
    elif first_line.upper().startswith("REFRAME:"):
        new_topic = first_line[len("REFRAME:") :].strip()
        if not new_topic and rest:
            new_topic = rest.split("\n")[0].strip()
        return {"signal": SIGNAL_REFRAME, "reason": f"Reframed from: {topic}", "new_topic": new_topic or topic}
    elif first_line.upper() == "REFRAME":
        # No colon — new topic is on the next line
        new_topic = rest.split("\n")[0].strip() if rest else ""
        return {"signal": SIGNAL_REFRAME, "reason": f"Reframed from: {topic}", "new_topic": new_topic or topic}
    else:
        # CONTINUE or anything unrecognised defaults to CONTINUE
        return {"signal": SIGNAL_CONTINUE, "reason": first_line, "new_topic": None}


SIGNAL_NO_DISPUTE = "NO_DISPUTE"


@activity.defn
async def congress_check_midpoint(topic: str, debate_summaries: list, session_id: str) -> dict:
    """After the midpoint round (Round 2), ask Ibrahim whether a genuine factual or priority
    dispute has been identified in the debate.

    Returns a dict with:
      {"signal": "CONTINUE" | SIGNAL_NO_DISPUTE, "reason": str}

    If no actionable disagreement is found among debaters, returns SIGNAL_NO_DISPUTE
    and the debate terminates early. On any failure, defaults to CONTINUE so the debate
    proceeds normally.
    """
    debate_text = f"Topic: {topic}\n\n"
    for item in debate_summaries:
        snippet = _truncate_snippet(item.get("snippet", ""))
        debate_text += f"**{item['identity']}** (Round {item.get('round', 1)}): {snippet}\n\n"

    system_prompt = (
        "You are Ibrahim the Immovable, moderator of this parliamentary body. After reviewing "
        "the midpoint of the debate (all rounds completed so far), evaluate whether a genuine "
        "factual or priority dispute has been identified among the debaters.\n\n"
        "CONTINUE — there is a real factual disagreement or priority trade-off dividing the "
        "debaters that is worth continuing to explore.\n"
        "NO_DISPUTE — all debaters are essentially in agreement, or the differences are "
        "purely semantic. There is no actionable disagreement to resolve. Terminate the "
        "session early.\n\n"
        "Start your response with exactly one of: CONTINUE or NO_DISPUTE:\n\n"
        "If NO_DISPUTE, provide a brief reason: NO_DISPUTE: <your reason for why there is "
        "no actionable disagreement>\n"
    )

    full_prompt = system_prompt + debate_text

    response_text = await _call_congress_api(full_prompt, "chairman", session_id, timeout=60)

    first_line = response_text.strip().split("\n")[0].strip()

    if first_line.upper().startswith("NO_DISPUTE"):
        reason = first_line[len("NO_DISPUTE:") :].strip()
        if not reason and "NO_DISPUTE:" in response_text:
            reason = response_text.split("NO_DISPUTE:", 1)[1].split("\n")[0].strip()
        if not reason:
            reason = "No actionable disagreement found among debaters"
        return {"signal": SIGNAL_NO_DISPUTE, "reason": reason}
    else:
        return {"signal": SIGNAL_CONTINUE, "reason": ""}


@activity.defn
async def congress_select_seats(topic: str, debaters: list, session_id: str) -> list:
    """Ask chairman to pick the most relevant debaters for this topic.

    Returns the selected subset of the debaters list (same objects, reordered by relevance).
    Falls back to the full list if the LLM call fails.
    """
    roster_lines = "\n".join(
        f"{i + 1}. {d.get('display_name') or d.get('name')}: {d.get('role', '')} [{d.get('status', 'eligible')}]"
        for i, d in enumerate(debaters)
    )
    prompt = (
        f"You are convening a congress on this topic:\n\n"
        f"**{topic}**\n\n"
        f"Available debaters (some are meme-only/retired — marked [meme]):\n{roster_lines}\n\n"
        f"Select exactly {MAX_DEBATERS} debaters whose perspectives will produce the sharpest, "
        f"most useful debate on this specific topic. You may select from both eligible and meme/retired — "
        f"picking a retired persona brings them in as a guest for this session only (they are not reinstated). "
        f"Prioritise genuine disagreement and coverage of key tensions. Avoid stacking voices that will repeat each other.\n\n"
        f"Respond with exactly {MAX_DEBATERS} lines. Each line must be the display_name of a selected debater "
        f"copied EXACTLY as shown above — same spelling, same capitalisation, nothing added or changed."
    )
    try:
        response_text = await _call_congress_api(prompt, "chairman", session_id, timeout=60)

        selected_names = [
            line.strip().strip("*-0123456789.").strip() for line in response_text.strip().split("\n") if line.strip()
        ]
        # Build ordered list matching selection, then append any unmatched as fallback
        name_to_debater = {(d.get("display_name") or d.get("name")): d for d in debaters}
        selected = [name_to_debater[n] for n in selected_names if n in name_to_debater]
        if len(selected) < len(selected_names):
            # Fuzzy fallback: case-insensitive and partial matching
            lower_map = {k.lower(): v for k, v in name_to_debater.items()}
            for n in selected_names:
                if n not in name_to_debater:
                    # Try exact case-insensitive
                    if n.lower() in lower_map:
                        d = lower_map[n.lower()]
                        if d not in selected:
                            selected.append(d)
                    else:
                        # Try partial: does n appear as a substring of any key, or vice versa?
                        for key, d in name_to_debater.items():
                            if n.lower() in key.lower() or key.lower() in n.lower():
                                if d not in selected:
                                    selected.append(d)
                                break
        # Top up from remaining candidates if we're under MAX_DEBATERS
        if len(selected) < MAX_DEBATERS:
            seated_names = {d.get("name") for d in selected}
            for d in debaters:
                if len(selected) >= MAX_DEBATERS:
                    break
                if d.get("name") not in seated_names:
                    selected.append(d)
                    seated_names.add(d.get("name"))
        if len(selected) < 3:
            raise ApplicationError(
                f"congress_select_seats: LLM returned fewer than 3 matched debaters "
                f"(got {len(selected)}) — aborting to avoid a malformed debate panel",
                non_retryable=True,
            )

        # --- Provider diversity enforcement ---
        # For each non-Anthropic provider (grok, gemini) that has at least one
        # eligible persona in the *full* debaters pool, guarantee at least one seat.
        # If the LLM already picked one, nothing changes. If not, swap in a random
        # representative from the full pool at the cost of the last Claude seat(s).
        #
        # Edge case: if seats < number of underrepresented providers, fill as many
        # provider slots as seats allow (non-Anthropic first).

        # Build per-provider pools from the full eligible roster
        provider_pools: dict[str, list] = {}
        for d in debaters:
            provider = _classify_model(d.get("model") or "")
            if provider != "claude":
                provider_pools.setdefault(provider, []).append(d)

        # Determine which non-Anthropic providers are missing from the current selection
        selected_names_set = {d.get("name") for d in selected}
        missing_providers: list[tuple[str, list]] = []
        for provider, pool in provider_pools.items():
            pool_names = {d.get("name") for d in pool}
            if not pool_names & selected_names_set:
                missing_providers.append((provider, pool))

        if missing_providers:
            activity.logger.info(
                f"congress_select_seats: enforcing provider diversity — "
                f"missing providers: {[p for p, _ in missing_providers]}"
            )
            # Work on a mutable copy; trim Claude seats from the tail to make room
            enforced = list(selected)
            for provider, pool in missing_providers:
                if not enforced:
                    break
                # Pick a random representative from this provider's pool
                representative = random.choice(pool)
                rep_name = representative.get("name")
                if rep_name in {d.get("name") for d in enforced}:
                    # Already seated (shouldn't happen, but guard it)
                    continue
                # Remove the last Claude-model seat to make room
                removed = False
                for i in range(len(enforced) - 1, -1, -1):
                    if _classify_model(enforced[i].get("model") or "") == "claude":
                        enforced.pop(i)
                        removed = True
                        break
                if not removed:
                    # No Claude seat to evict — hard abort per provider diversity requirement
                    raise ApplicationError(
                        f"Congress aborted: provider '{provider}' has eligible personas "
                        f"({[d.get('name') for d in pool]}) but no Claude seat can be evicted "
                        f"to guarantee representation. Increase MAX_DEBATERS or reduce provider count.",
                        non_retryable=True,
                    )
                enforced.append(representative)
                activity.logger.info(
                    f"congress_select_seats: seated {rep_name} to represent provider '{provider}'"
                )

            selected = enforced

        return selected
    except ApplicationError:
        raise
    except Exception as e:
        raise ApplicationError(
            f"congress_select_seats failed: {e}",
            non_retryable=True,
        ) from e


@activity.defn
async def congress_create_tasks(
    session_id: str,
    session_number: int,
    topic: str,
    verdict: str,
) -> list:
    """Ask chairman to extract action items from the verdict, then create local task JSON files.

    Returns a list of created task titles (may be empty if no tasks or on failure).
    """
    try:
        prompt = (
            f"Based on this congress verdict, extract 0-3 concrete, actionable tasks that BigClungus should implement. "
            f"These will become local task items.\n\n"
            f"Verdict: {verdict}\n"
            f"Topic: {topic}\n\n"
            f"For each task, respond with:\n"
            f"TASK: <title (short, imperative)>\n"
            f"BODY: <1-2 sentence description of what to do and why>\n"
            f"APPROVAL: AUTO  (if BigClungus can execute this autonomously — code changes, config updates, script fixes, investigations)\n"
            f"APPROVAL: HUMAN  (if framers must decide — persona changes, policy decisions, architecture choices, anything involving user-facing commitments)\n\n"
            f"After each BODY line, add the APPROVAL line.\n\n"
            f"If the verdict contains no actionable implementation items, respond with NONE."
        )

        try:
            response_text = await _call_congress_api(prompt, "chairman", session_id, timeout=180)
        except Exception as _api_exc:
            activity.logger.warning(f"congress_create_tasks API call failed: {_api_exc}")
            return []

        if not response_text or "NONE" in response_text.upper().split():
            return []

        # Parse TASK/BODY/APPROVAL blocks
        tasks = []
        blocks = re.split(r"\nTASK:", "\n" + response_text)
        for block in blocks[1:]:
            lines = block.strip().split("\n")
            title = lines[0].strip()
            body = ""
            approval = "AUTO"
            for line in lines[1:]:
                if line.startswith("BODY:"):
                    body = line.replace("BODY:", "").strip()
                elif line.startswith("APPROVAL:"):
                    raw = line.replace("APPROVAL:", "").strip().upper()
                    approval = "HUMAN" if "HUMAN" in raw else "AUTO"
            if title:
                tasks.append({"title": title, "body": body, "approval": approval})

        if not tasks:
            return []

        tasks_dir = TASKS_DIR
        os.makedirs(tasks_dir, exist_ok=True)
        task_titles = []
        for task in tasks:
            try:
                now = datetime.now(timezone.utc)
                ts_str = now.strftime("%Y%m%d-%H%M%S")
                task_hash = hashlib.sha256(f"{session_id}-{task['title']}".encode()).hexdigest()[:8]
                task_id = f"task-{ts_str}-a{task_hash}"
                description = task["body"]
                if session_number:
                    description += f"\n\nGenerated from Congress #{session_number} verdict on topic: {topic}"
                task_data = {
                    "id": task_id,
                    "title": task["title"],
                    "agent_id": f"congress-{session_number}",
                    "agent_type": "congress",
                    "session_id": session_id,
                    "discord_message_id": None,
                    "discord_user": None,
                    "run_in_background": True,
                    "isolation": None,
                    "model": None,
                    "requires_approval": task["approval"] == "HUMAN",
                    "log": [
                        {
                            "event": "started",
                            "ts": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "message": f"Created from Congress #{session_number} verdict on: {topic[:100]}",
                        },
                        {
                            "event": "milestone",
                            "ts": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                            "message": f"Source verdict: {verdict[:200]}{'...' if len(verdict) > 200 else ''}",
                        },
                    ],
                }
                task_path = os.path.join(tasks_dir, f"{task_id}.json")
                with open(task_path, "w") as f:
                    json.dump(task_data, f, indent=2)
                activity.logger.info(f"Created local task file: {task_path}")
                task_titles.append(task["title"])
                task["task_id"] = task_id  # store for inject step
            except Exception as e:
                activity.logger.warning(f"Exception creating local task file: {e}")

        # Persist task titles to the session JSON so the UI can display them
        if task_titles:
            try:
                async with congress_client(base_url=CLUNGER_BASE_URL, timeout_ms=15_000) as svc:
                    await svc.patch_session(
                        PatchSessionRequest(
                            session_id=session_id,
                            task_titles=json.dumps(task_titles),
                        )
                    )
            except Exception as e:
                activity.logger.warning(f"Exception patching session with task_titles: {e}")

        # Commit task files to git
        if task_titles:
            try:
                repo_path = META_REPO_PATH
                subprocess.run(["git", "-C", repo_path, "add", "tasks/"], check=True, timeout=30)
                git_status = subprocess.run(
                    ["git", "-C", repo_path, "status", "--porcelain"], capture_output=True, text=True, timeout=10
                )
                if git_status.stdout.strip():
                    subprocess.run(
                        [
                            "git",
                            "-C",
                            repo_path,
                            "commit",
                            "-m",
                            f"tasks: add {len(task_titles)} task(s) from Congress #{session_number}",
                        ],
                        check=True,
                        timeout=30,
                    )
                    subprocess.run(["git", "-C", repo_path, "push"], check=True, timeout=60)
                    activity.logger.info(
                        f"Committed and pushed {len(task_titles)} task(s) for congress #{session_number}"
                    )
            except Exception as e:
                activity.logger.warning(f"Failed to commit task files: {e}")

        # Inject prompts for each task
        for task in tasks:
            task_id = task.get("task_id")
            approval = task.get("approval", "AUTO")
            title = task["title"]
            body = task.get("body", "")

            if approval == "AUTO":
                inject_content = (
                    f"[task-auto] Task: {title} — spinning up agent to handle this\n\n"
                    f"Congress #{session_number} verdict produced this task for autonomous execution.\n"
                    f"{body}\n"
                    f"Task ID: {task_id}"
                )
            else:
                inject_content = (
                    f"[task-approval-needed] Task: {title} — needs framer sign-off before I proceed. {body}\n\n"
                    f"Congress #{session_number} verdict produced this task but it requires a framer decision.\n"
                    f"Task ID: {task_id}"
                )

            try:
                await _do_inject(inject_content, MAIN_CHANNEL_ID, user="congress-tasks")
                activity.logger.info(f"Injected {approval} task: {title}")
            except Exception as e:
                activity.logger.warning(f"Failed to inject task '{title}': {e}")

        return task_titles
    except Exception as e:
        activity.logger.warning(f"congress_create_tasks failed (non-fatal): {e}")
        return []


@activity.defn
async def congress_graphiti_context(topic: str) -> str:
    """Query FalkorDB (Graphiti knowledge graph) for context relevant to the debate topic.

    Returns a formatted string of relevant entities/facts, or an empty string if nothing useful
    is found or the query fails. Always non-fatal — Ibrahim synthesises with or without this.
    """
    loop = asyncio.get_running_loop()
    facts = await loop.run_in_executor(None, _query_graphiti_facts, topic)
    return "\n".join(facts)


def _codebase_search(topic_text: str) -> str:
    """Search /mnt/data for files relevant to the topic keywords.

    Returns a short formatted string of matching file paths and snippets,
    or an empty string if nothing is found or the search fails.
    """
    words = [w.strip(".,!?\"'()[]") for w in topic_text.split()]
    keywords = [w for w in words if len(w) > 3][:5]
    if not keywords:
        return ""

    # Search only specific code directories to keep it fast and relevant
    SEARCH_DIRS = [
        "/mnt/data/clunger",
        "/mnt/data/hello-world",
        "/mnt/data/temporal-workflows",
        "/mnt/data/scripts",
        AGENTS_DIR,
    ]
    found_files: dict = {}  # path -> first matching line snippet

    for keyword in keywords:
        for search_dir in SEARCH_DIRS:
            if not os.path.isdir(search_dir):
                continue
            try:
                result = subprocess.run(
                    [
                        "grep",
                        "-ril",
                        "-E",
                        keyword,
                        search_dir,
                        "--exclude-dir=.git",
                        "--exclude-dir=__pycache__",
                        "--include=*.py",
                        "--include=*.js",
                        "--include=*.ts",
                        "--include=*.yml",
                        "--include=*.yaml",
                        "--include=*.sh",
                        "--include=*.md",
                    ],
                    capture_output=True,
                    text=True,
                    timeout=4,
                )
                for fpath in result.stdout.strip().splitlines():
                    if fpath not in found_files:
                        # Get the first matching line as a snippet
                        try:
                            snip_result = subprocess.run(
                                ["grep", "-im", "1", keyword, fpath], capture_output=True, text=True, timeout=2
                            )
                            snippet = snip_result.stdout.strip()[:120] if snip_result.stdout else ""
                        except Exception as exc:
                            logger.debug("snippet grep failed for %s: %s", fpath, exc)
                            snippet = ""
                        rel_path = os.path.relpath(fpath, "/mnt/data")
                        found_files[fpath] = (rel_path, snippet)
                    if len(found_files) >= 8:
                        break
            except Exception as exc:
                logger.warning("codebase search failed for dir %s keyword %s: %s", search_dir, keyword, exc)
            if len(found_files) >= 8:
                break
        if len(found_files) >= 8:
            break

    if not found_files:
        return ""

    lines = []
    for fpath, (rel_path, snippet) in list(found_files.items())[:5]:
        if snippet:
            lines.append(f"- `{rel_path}`: {snippet}")
        else:
            lines.append(f"- `{rel_path}`")

    return "## Relevant codebase files\n" + "\n".join(lines)


@activity.defn
async def congress_frame_topic(topic: str) -> str:
    """Ibrahim reads the topic, queries Graphiti for relevant context, and produces a
    pre-debate framing brief that gets prepended to all debaters' Round 1 prompts.

    Formats the Graphiti results directly as the context brief — no additional Claude
    call needed. Returns a formatted string titled '## Context from Memory'
    or an empty string if nothing relevant is found or the query fails.
    """
    cached = _load_context_cache(topic)
    if cached is not None:
        return cached

    loop = asyncio.get_running_loop()
    facts = await loop.run_in_executor(None, _query_graphiti_facts, topic)
    if facts:
        memory_result = "## Context from Memory\n" + "\n".join(facts)
    else:
        memory_result = "## Context from Memory\n(none)"

    code_result = await loop.run_in_executor(None, _codebase_search, topic)

    # Combine: memory section + codebase section, capped to keep token cost low
    parts = [p for p in [memory_result, code_result] if p]
    result = "\n\n".join(parts)[:2000]  # hard cap at 2000 chars

    _save_context_cache(result, topic)
    return result


@activity.defn
async def congress_vote(
    identity: str,
    synthesis: str,
    session_id: str,
    thread_id: str = None,
    display_name: str = None,
) -> dict:
    """Ask a debater to AGREE or DISAGREE with Ibrahim's synthesis.

    Per Spengler's lesson: default to DISAGREE if the response is ambiguous —
    agreement must be explicit; the path of least resistance should be surfacing
    disagreement, not laundering it.

    Returns: {"name": display_name, "vote": "AGREE"|"DISAGREE", "reason": str}
    """
    name = display_name or identity
    prompt = (
        f"You are {name}.\n\n"
        f"Ibrahim the Immovable just delivered this synthesis of the debate:\n\n"
        f'"{synthesis}"\n\n'
        f"Do you AGREE or DISAGREE that this synthesis captured the actual crux of the debate — "
        f"the core tension that mattered most?\n\n"
        f"Respond with AGREE or DISAGREE on the first line, followed by ONE sentence explaining why. "
        f"If you think the synthesis missed something load-bearing, say DISAGREE and name it. "
        f"Agreement is not the default — only agree if you genuinely believe the synthesis captured the crux."
    )

    response_text = await _call_congress_api(prompt, identity, session_id, timeout=180)

    # Parse vote — look for AGREE or DISAGREE at the start of the response.
    # Default to DISAGREE if ambiguous (Spengler's lesson: make agreement require justification).
    first_line = response_text.strip().split("\n")[0].strip().upper() if response_text else ""
    if first_line.startswith("AGREE") and not first_line.startswith("DISAGREE"):
        vote = "AGREE"
    else:
        vote = "DISAGREE"

    # Extract reason: everything after the first line
    lines = response_text.strip().split("\n")
    reason_lines = [line.strip() for line in lines[1:] if line.strip()]
    reason = reason_lines[0] if reason_lines else lines[0].strip()

    return {"name": name, "vote": vote, "reason": reason}


@activity.defn
async def congress_duel_vote(
    identity: str,
    ibrahim_verdict: str,
    anti_ibrahim_verdict: str,
    session_id: str,
    thread_id: str = None,
    display_name: str = None,
) -> dict:
    """Ask a debater to vote on whose synthesis is better: Ibrahim or anti-ibrahim.

    Returns: {"name": display_name, "vote": "ibrahim"|"anti-ibrahim", "reason": str}
    """
    name = display_name or identity
    prompt = (
        f"You are {name}.\n\n"
        f"After the debate, two competing syntheses were produced:\n\n"
        f"**Ibrahim the Immovable's synthesis:**\n{ibrahim_verdict}\n\n"
        f"**Ibraheem the Unruly's synthesis:**\n{anti_ibrahim_verdict}\n\n"
        f"Whose synthesis better captured the actual crux of the debate?\n\n"
        f'Respond with "ibrahim" or "anti-ibrahim" on the first line, followed by ONE sentence '
        f"explaining why. Choose based on which verdict you think will lead to the better outcome, "
        f"not which one sounds more pleasant or agrees with your personal position."
    )

    response_text = await _call_congress_api(prompt, identity, session_id, timeout=180)

    # Parse vote
    first_line = response_text.strip().split("\n")[0].strip().lower() if response_text else ""
    if "anti-ibrahim" in first_line or "ibraheem" in first_line or "anti_ibrahim" in first_line:
        vote = "anti-ibrahim"
    elif "ibrahim" in first_line:
        vote = "ibrahim"
    else:
        vote = "ibrahim"  # default to Ibrahim if ambiguous

    lines = response_text.strip().split("\n")
    reason_lines = [line.strip() for line in lines[1:] if line.strip()]
    reason = reason_lines[0] if reason_lines else lines[0].strip()

    return {"name": name, "vote": vote, "reason": reason}


@activity.defn
async def congress_report(
    chat_id: str,
    session_id: str,
    session_number: int,
    verdict: str,
    topic: str,
    debate_summaries: list,  # list of {identity, snippet} dicts
    thread_id: str = None,
    main_channel_id: str = MAIN_CHANNEL_ID,
    evolution_results: dict = None,
    task_urls: list = None,
    vote_summary: dict = None,
    mode: str = "standard",
) -> None:
    """Post congress results to Discord.

    If thread_id is provided, posts the full summary to the thread and a brief
    notice with a link in the main channel. Otherwise posts everything to the
    main channel as before.
    """
    num_str = str(session_number).zfill(4)
    session_link = f"clung.us/congress?session=congress-{num_str}"

    # Build evolution suffix if anything happened
    evolution_suffix = ""
    if evolution_results:
        retired = evolution_results.get("retired", [])
        evolved = evolution_results.get("evolved", [])
        created = evolution_results.get("created", [])
        if retired:
            evolution_suffix += "\n" + " ".join(f"🔥 **{p['display_name']}** retired — {p['reason']}" for p in retired)
        if evolved:
            evolution_suffix += "\n" + " ".join(
                f"🧬 **{p['display_name']}** evolved — {p['learned']}"
                if p.get("learned")
                else f"🧬 **{p['display_name']}** evolved"
                for p in evolved
            )
        if created:
            evolution_suffix += "\n" + " ".join(
                f"🌱 **{p['display_name']}** joined the congress — {p['reason']}" for p in created
            )

    # Build task suffix if any tasks were created
    task_suffix = ""
    if task_urls:
        titles_str = "\n".join(f"☐ {t}" for t in task_urls)
        task_suffix = f"\n📋 **Actionable Tasks:**\n{titles_str}"

    # Build vote tally suffix
    vote_suffix = ""
    if vote_summary and vote_summary.get("tally"):
        tally = vote_summary["tally"]
        agree_names = vote_summary.get("agree", [])
        disagree_names = vote_summary.get("disagree", [])
        agree_str = ", ".join(agree_names) if agree_names else "none"
        disagree_str = ", ".join(disagree_names) if disagree_names else "none"
        vote_suffix = f"\n📊 **Synthesis vote:** {tally} — agreed: {agree_str} | dissented: {disagree_str}"

    meme_footer = "\n\n🃏 *meme session — no action items*" if mode == SESSION_MODE_MEME else ""

    closing = f"⚖️ **Congress #{session_number} adjourned**\n**Verdict:** {verdict}\n\n🔗 {session_link}"
    closing += vote_suffix
    closing += evolution_suffix
    closing += task_suffix
    closing += meme_footer

    # Discord hard limit is 2000 chars — truncate gracefully
    if len(closing) > 1990:
        closing = closing[:1987] + "…"

    headers = _discord_headers()
    async with aiohttp.ClientSession(timeout=DISCORD_TIMEOUT) as session:
        if thread_id:
            # Post full closing summary to the thread
            thread_url = f"{DISCORD_API}/channels/{thread_id}/messages"
            async with session.post(thread_url, headers=headers, json={"content": closing}) as resp:
                if resp.status not in (200, 201):
                    body = await resp.text()
                    raise RuntimeError(f"Discord thread summary error {resp.status}: {body}")
            notice = f"⚖️ **Congress #{session_number}** has adjourned — see the thread. 🔗 {session_link}"
        else:
            # No thread — post the full closing to main channel directly
            notice = closing

        main_url = f"{DISCORD_API}/channels/{main_channel_id}/messages"
        async with session.post(main_url, headers=headers, json={"content": notice}) as resp:
            if resp.status not in (200, 201):
                body = await resp.text()
                raise RuntimeError(f"Discord main channel notice error {resp.status}: {body}")

    # Inject verdict back to BigClungus for self-implementation (skipped in meme mode)
    if mode != SESSION_MODE_MEME:
        try:
            inject_msg = (
                f"📋 **Congress #{session_number} verdict ready for implementation.**\n"
                f"Topic: {topic}\n\n"
                f"Verdict: {verdict[:1000]}\n\n"
                f"Review and implement any actionable changes from this verdict."
            )
            await _do_inject(inject_msg, main_channel_id, user=f"congress-{session_number}")
        except Exception as e:
            activity.logger.warning(f"Failed to inject verdict notification: {e}")


@activity.defn
async def congress_alert_failure(topic: str, session_id: str, error_type: str, error_message: str) -> None:
    """Inject a workflow failure notice to the bot session (private, not public Discord)."""
    content = (
        f"⚠️ **CongressWorkflow failed**\n"
        f"Error: `{error_type}: {error_message[:300]}`\n"
        f"Topic: {topic}\n"
        f"Session: {session_id}"
    )
    try:
        await _do_inject(content, MAIN_CHANNEL_ID, user="temporal-monitor")
    except Exception as e:
        activity.logger.error(f"congress_alert_failure: inject failed: {e}")


# ---------------------------------------------------------------------------
# Preflight check — multimodal reachability
# ---------------------------------------------------------------------------

_GROK_PROXY_URL = "http://127.0.0.1:4100/v1/messages"
_GEMINI_BIN = "/usr/local/bin/gemini"

# Models that prefix-match as grok or gemini
def _classify_model(model: str) -> str:
    """Return 'grok', 'gemini', or 'claude' based on the model string."""
    m = (model or "").lower().strip()
    # Resolve common aliases
    if m in ("grok",):
        return "grok"
    if m in ("gemini",):
        return "gemini"
    if m.startswith("grok-") or m.startswith("xai/"):
        return "grok"
    if m.startswith("gemini-") or m.startswith("google/"):
        return "gemini"
    return "claude"


@activity.defn
async def congress_preflight_check(debaters: list) -> list:
    """Verify that every non-Claude model assigned to a seated debater is reachable.

    Runs before any debate activity. If a non-Claude backend is unavailable, the
    affected personas are downgraded to Claude (model field cleared) and a warning
    is logged. Returns the (possibly modified) debaters list so the workflow can
    use the corrected version. Only raises if something truly unexpected happens.
    fast before burning tokens on Claude-side activities.

    Checks performed:
    - grok-* / xai/* models: minimal POST to the local Grok proxy (127.0.0.1:4100).
      Connection errors and 401s are fatal. A 403 "no credits" response is also fatal.
    - gemini-* / google/* models: verifies the gemini binary exists and GEMINI_API_KEY
      is set (no live API call — binary presence + key is sufficient gate).
    """
    need_grok = False
    need_gemini = False
    grok_personas: list[str] = []
    gemini_personas: list[str] = []

    for d in debaters:
        model = (d.get("model") or "claude").strip()
        kind = _classify_model(model)
        name = d.get("display_name") or d.get("name") or str(d)
        if kind == "grok":
            need_grok = True
            grok_personas.append(f"{name} ({model})")
        elif kind == "gemini":
            need_gemini = True
            gemini_personas.append(f"{name} ({model})")

    if not need_grok and not need_gemini:
        activity.logger.info("congress_preflight_check: all debaters are Claude-only — skipping multimodel check")
        return debaters

    errors: list[str] = []

    # ------------------------------------------------------------------
    # Grok proxy check
    # ------------------------------------------------------------------
    if need_grok:
        xai_key = os.environ.get("XAI_API_KEY", "")
        if not xai_key:
            errors.append(
                "Grok model required but XAI_API_KEY is not set in the worker environment. "
                f"Grok personas: {', '.join(grok_personas)}"
            )
        else:
            # Probe with a minimal request — we expect either a real completion response
            # or a structured error JSON. A "no credits" 403 is fatal; connection error is fatal.
            probe_payload = json.dumps({
                "model": "grok-3-mini",
                "max_tokens": 1,
                "messages": [{"role": "user", "content": "ping"}],
            }).encode()
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        _GROK_PROXY_URL,
                        data=probe_payload,
                        headers={
                            "Content-Type": "application/json",
                            "x-api-key": xai_key,
                            "anthropic-version": "2023-06-01",
                        },
                        timeout=aiohttp.ClientTimeout(total=15),
                    ) as resp:
                        body = await resp.json(content_type=None)
                        status = resp.status
                        activity.logger.info(f"congress_preflight_check: Grok proxy returned HTTP {status}: {str(body)[:200]}")

                        if status == 403:
                            err_msg = (body.get("error") or body.get("code") or str(body))[:300]
                            errors.append(
                                f"Grok API unavailable — congress requires multimodel. "
                                f"Response: {err_msg} "
                                f"Top up credits at https://console.x.ai — "
                                f"Grok personas: {', '.join(grok_personas)}"
                            )
                        elif status == 401:
                            errors.append(
                                f"Grok API rejected the API key (HTTP 401). "
                                f"Check XAI_API_KEY in /mnt/data/temporal-workflows/.env — "
                                f"Grok personas: {', '.join(grok_personas)}"
                            )
                        elif status not in (200, 400, 429):
                            # 200 = success, 400 = bad request (proxy up), 429 = rate limit (key works)
                            # Anything else unexpected — treat as reachable but log warning
                            activity.logger.warning(
                                f"congress_preflight_check: Grok proxy unexpected HTTP {status} — treating as reachable"
                            )
            except aiohttp.ClientConnectorError as e:
                errors.append(
                    f"Grok proxy at {_GROK_PROXY_URL} is unreachable (connection refused or no route). "
                    f"Is the proxy service running? Error: {e} — "
                    f"Grok personas: {', '.join(grok_personas)}"
                )
            except Exception as e:
                errors.append(
                    f"Grok proxy check failed with unexpected error: {type(e).__name__}: {e} — "
                    f"Grok personas: {', '.join(grok_personas)}"
                )

    # ------------------------------------------------------------------
    # Gemini check
    # ------------------------------------------------------------------
    if need_gemini:
        gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or ""
        missing: list[str] = []
        if not gemini_key:
            missing.append("GEMINI_API_KEY (or GOOGLE_API_KEY) is not set")
        if not Path(_GEMINI_BIN).exists():
            missing.append(f"gemini CLI not found at {_GEMINI_BIN}")
        if missing:
            errors.append(
                f"Gemini model required but not configured: {'; '.join(missing)}. "
                f"Gemini personas: {', '.join(gemini_personas)}"
            )
        else:
            activity.logger.info(f"congress_preflight_check: Gemini key present and binary found — OK. Personas: {gemini_personas}")

    # ------------------------------------------------------------------
    # Graceful degradation: downgrade unavailable models to Claude
    # ------------------------------------------------------------------
    if errors:
        combined = " | ".join(errors)
        activity.logger.warning(
            f"congress_preflight_check: multimodel backend(s) unavailable, "
            f"downgrading affected personas to Claude. Issues: {combined}"
        )
        # Strip non-Claude models whose backends failed
        grok_failed = any("Grok" in e for e in errors)
        gemini_failed = any("Gemini" in e for e in errors)
        for d in debaters:
            model = (d.get("model") or "").strip()
            kind = _classify_model(model)
            if (kind == "grok" and grok_failed) or (kind == "gemini" and gemini_failed):
                name = d.get("display_name") or d.get("name") or str(d)
                activity.logger.warning(
                    f"congress_preflight_check: downgrading {name} from {model} to Claude"
                )
                d["model"] = ""
                d["_original_model"] = model  # preserve for logging

    return debaters
