"""
Activities for CongressAuditWorkflow.

Loads congress sessions completed since the last audit, calls Claude CLI
to generate a self-critical audit, and posts results to Discord via the
inject endpoint (with an optional thread for long reports).
"""

import asyncio
from json import dumps as json_dumps, loads as json_loads
from logging import getLogger
from datetime import datetime, timezone

from temporalio import activity

from .common.discord_io import discord_create_thread, discord_post_message
from .constants import CLAUDE_CLI, HELLO_WORLD_SESSIONS_DIR, MAIN_CHANNEL_ID
from .inject_act import _do_inject

logger = getLogger(__name__)

SESSIONS_DIR = HELLO_WORLD_SESSIONS_DIR
AUDIT_STATE_PATH = SESSIONS_DIR / "audit-state.json"

AUDIT_SYSTEM_PROMPT = (
    "You are BigClungus, reviewing your own congress sessions for quality. "
    "Be direct and self-critical. For each session identify: "
    "(1) vote tally accuracy — did the AGREE/DISAGREE counts match the stated verdict direction; "
    "(2) strongest and weakest persona reasoning — name names, cite specific arguments; "
    "(3) quality of evolution/retirement decisions — were EVOLVEs and RETIREs well-justified; "
    "(4) whether the verdict was actionable — vague verdicts are a failure. "
    "Keep each session audit to 3-5 sentences. Do not use headers or markdown formatting beyond "
    "bold for persona names. Write in plain direct prose."
)


def _load_audit_state() -> datetime:
    """Return the last_audit_at timestamp, or today at 00:00 UTC if state file absent."""
    if AUDIT_STATE_PATH.exists():
        try:
            data = json_loads(AUDIT_STATE_PATH.read_text())
            ts_str = data.get("last_audit_at", "")
            if ts_str:
                return datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        except Exception as exc:
            logger.warning("[audit] failed to parse audit state file: %s", exc)
    # Default: start of today UTC
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _parse_session_ts(session: dict) -> "datetime | None":
    """Return the completed_at / finished_at datetime from a session dict, or None."""
    for field in ("completed_at", "finished_at"):
        ts_str = session.get(field)
        if ts_str:
            try:
                return datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            except ValueError:
                logger.warning("could not parse timestamp %r from field %r", ts_str, field)
    return None


def _summarise_session(session: dict) -> dict:
    """Extract a compact summary of a congress session for the audit prompt."""
    evolution = session.get("evolution")
    if isinstance(evolution, str):
        try:
            evolution = json_loads(evolution)
        except Exception as exc:
            logger.warning("[audit] failed to parse evolution JSON in session %s: %s", session.get("session_id"), exc)

    vote_summary = session.get("vote_summary")
    if isinstance(vote_summary, str):
        try:
            vote_summary = json_loads(vote_summary)
        except Exception as exc:
            logger.warning("[audit] failed to parse vote_summary JSON in session %s: %s", session.get("session_id"), exc)

    debaters = [
        r.get("identity", "unknown")
        for r in session.get("rounds", [])
        if r.get("identity") not in ("chairman", "hiring-manager")
    ]
    # Deduplicate while preserving order
    seen: set[str] = set()
    unique_debaters = []
    for debater in debaters:
        if debater not in seen:
            seen.add(debater)
            unique_debaters.append(debater)

    return {
        "session_id": session.get("session_id", "unknown"),
        "session_number": session.get("session_number"),
        "topic": session.get("topic", "(no topic)"),
        "verdict": session.get("verdict", "(no verdict)"),
        "vote_summary": vote_summary,
        "evolution": evolution,
        "task_titles": session.get("task_titles"),
        "debaters": unique_debaters,
        "mode": session.get("mode"),
    }


@activity.defn
async def load_sessions_since_last_audit() -> list[dict]:
    """
    Scan sessions/congress-*.json for sessions completed after last_audit_at.
    Returns a list of session summary dicts.
    """
    last_audit = _load_audit_state()
    activity.logger.info("Loading sessions completed after %s", last_audit.isoformat())

    results = []
    for path in sorted(SESSIONS_DIR.glob("congress-*.json")):
        try:
            session = json_loads(path.read_text())
        except Exception as exc:
            activity.logger.warning("Skipping %s: %s", path.name, exc)
            continue

        # Only include completed sessions
        if session.get("status") != "done":
            continue

        ts = _parse_session_ts(session)
        if ts is None:
            continue

        if ts > last_audit:
            summary = _summarise_session(session)
            summary["completed_at"] = ts.isoformat()
            results.append(summary)

    activity.logger.info("Found %d new session(s) to audit", len(results))
    return results


@activity.defn
async def audit_sessions(sessions: list[dict]) -> str:
    """
    Call Claude CLI to generate an audit of the provided session summaries.
    Returns the raw audit text.
    """
    if not sessions:
        return "No sessions to audit."

    # Build prompt listing each session
    lines = []
    for session in sessions:
        num = session.get("session_number", "?")
        sid = session.get("session_id", "?")
        topic = session.get("topic", "(no topic)")
        verdict = session.get("verdict", "(no verdict)")
        vote = session.get("vote_summary")
        evolution = session.get("evolution")
        debaters = ", ".join(session.get("debaters", []))
        tasks = session.get("task_titles")
        mode = session.get("mode")

        lines.append(f"--- SESSION {num} ({sid}) ---")
        if mode and mode != "standard":
            lines.append(f"Mode: {mode}")
        lines.append(f"Topic: {topic}")
        lines.append(f"Debaters: {debaters}")
        lines.append(f"Verdict: {verdict}")
        if vote:
            tally = vote.get("tally", "")
            agree = ", ".join(vote.get("agree", []))
            disagree = ", ".join(vote.get("disagree", []))
            lines.append(f"Vote: {tally} | Agree: {agree} | Disagree: {disagree}")
        if evolution and isinstance(evolution, dict):
            evolved = [e.get("display_name", "") for e in evolution.get("evolved", [])]
            retired = [p.get("display_name", "") for p in evolution.get("retired", evolution.get("fired", []))]
            retained = evolution.get("retained", [])
            if evolved:
                lines.append(f"Evolved: {', '.join(evolved)}")
            if retired:
                lines.append(f"Retired: {', '.join(retired)}")
            if retained:
                lines.append(f"Retained: {', '.join(retained)}")
        if tasks:
            lines.append(f"Tasks created: {tasks}")
        lines.append("")

    user_message = (
        f"Please audit the following {len(sessions)} congress session(s):\n\n"
        + "\n".join(lines)
    )

    activity.logger.info("Calling Claude CLI to audit %d session(s)", len(sessions))

    proc = await asyncio.create_subprocess_exec(
        CLAUDE_CLI,
        "-p",
        AUDIT_SYSTEM_PROMPT,
        "--output-format",
        "text",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate(input=user_message.encode())

    if proc.returncode != 0:
        err = stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"Claude CLI exited {proc.returncode}: {err}")

    audit_text = stdout.decode("utf-8", errors="replace").strip()
    if not audit_text:
        raise RuntimeError("Claude CLI returned empty audit output")

    activity.logger.info("Audit generated: %d chars", len(audit_text))
    return audit_text


@activity.defn
async def save_audit_state(latest_session_ts: str) -> None:
    """Write updated last_audit_at to audit-state.json."""
    now_utc = datetime.now(timezone.utc).isoformat()
    state = {
        "last_audit_at": latest_session_ts,
        "audit_ran_at": now_utc,
    }
    AUDIT_STATE_PATH.write_text(json_dumps(state, indent=2))
    activity.logger.info("Saved audit state: last_audit_at=%s", latest_session_ts)


@activity.defn
async def post_audit_results(audit_text: str) -> None:
    """
    Post audit results to Discord. If the text is <=1800 chars, post directly
    to the main channel via inject. Otherwise post a short summary to main
    channel and full details to a Discord thread.
    """
    header = "📋 **daily congress audit**\n"
    full_message = header + audit_text

    if len(full_message) <= 1800:
        # Short enough to post directly
        await _do_inject(full_message, MAIN_CHANNEL_ID, user="congress-audit")
        activity.logger.info("Posted audit directly to main channel (%d chars)", len(full_message))
        return

    # Long: post a truncated summary to main channel, full text to a thread
    # First, grab the message_id from the inject response to anchor a thread
    summary_lines = audit_text.split("\n")
    # Take up to the first ~400 chars as summary
    summary = ""
    for line in summary_lines:
        if len(summary) + len(line) + 1 > 400:
            break
        summary += line + "\n"
    summary = summary.strip()

    summary_msg = (
        f"{header}"
        f"_{len(audit_text)} chars — see thread for full audit_\n\n"
        f"{summary}\n… *(continued in thread)*"
    )

    # Post summary to main channel via inject; get message_id from the response
    msg_id = await _do_inject(summary_msg, MAIN_CHANNEL_ID, user="congress-audit", return_message_id=True)

    if msg_id:
        # Create a thread off the summary message and post full audit there
        await _post_to_thread(msg_id, audit_text)
        activity.logger.info(
            "Posted summary (%d chars) to main channel, full audit to thread off msg %s",
            len(summary_msg),
            msg_id,
        )
    else:
        # Fall back: split and post in chunks to main channel via inject
        activity.logger.warning(
            "Could not create thread (msg_id=%s) — chunking to main channel",
            msg_id,
        )
        chunk_size = 1800
        chunks = [audit_text[i:i + chunk_size] for i in range(0, len(audit_text), chunk_size)]
        for i, chunk in enumerate(chunks, 1):
            prefix = f"📋 **daily congress audit** (part {i}/{len(chunks)})\n"
            await _do_inject(prefix + chunk, MAIN_CHANNEL_ID, user="congress-audit")


async def _post_to_thread(anchor_message_id: str, content: str) -> None:
    """
    Create a Discord thread off anchor_message_id and post content there.
    The thread channel_id equals the message_id for Discord threads.
    """
    try:
        thread_id = await discord_create_thread(MAIN_CHANNEL_ID, anchor_message_id, "full congress audit")
    except Exception as exc:
        logger.warning("Thread creation failed: %s", exc)
        return

    # Post full audit content to thread (chunk if needed)
    chunk_size = 1900
    chunks = [content[i:i + chunk_size] for i in range(0, len(content), chunk_size)]
    for chunk in chunks:
        try:
            await discord_post_message(thread_id, chunk)
        except Exception as exc:
            logger.warning("Thread post failed: %s", exc)
