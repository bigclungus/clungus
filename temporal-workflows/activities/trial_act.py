"""
Activities for TrialWorkflow (Show Trials).

Reuses _call_congress_api from congress_act; discord_post_message from common.discord_io.
Each trial is a self-contained adversarial proceeding: prosecution, defense,
cross-examination, character witness, jury, Scalia verdict (always GUILTY).

Session numbering is unified with congress via clunger's StartSession RPC.
Persistence uses clunger's REST PATCH endpoint instead of direct file writes.
"""

from asyncio import get_running_loop
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from temporalio import activity
from temporalio.exceptions import ApplicationError

# ConnectRPC generated stubs
sys.path.insert(0, str(Path(__file__).parent.parent / "gen" / "python"))
from client_factory import congress_client  # noqa: E402
from congress.v1.congress_pb2 import PatchSessionRequest, StartSessionRequest  # noqa: E402

from .common.discord_io import discord_create_thread_or_reuse, discord_fetch_messages, discord_post_message
from .common.http_io import clunger_patch_session
from .congress_act import _call_congress_api, _query_graphiti_facts
from .constants import AGENTS_DIR, CLUNGER_BASE_URL, HELLO_WORLD_SESSIONS_DIR, MAIN_CHANNEL_ID, SESSION_MODE_MEME, SESSION_MODE_STANDARD
from .inject_act import _do_inject

SESSIONS_DIR = HELLO_WORLD_SESSIONS_DIR


# ---------------------------------------------------------------------------
# Activities
# ---------------------------------------------------------------------------


@activity.defn
async def trial_announce(
    chat_id: str,
    message_id: str,
    defendant_display: str,
    charges: str,
    prosecutor_displays: list,
    jury_displays: list,
    advocate_display: str,
) -> dict:
    """Post an opening announcement and create a Discord thread for the trial.

    Uses clunger's StartSession RPC to get a unified session_id (session-NNNN format)
    and session_number, then PATCHes flavor/defendant/charges onto the session.

    Returns {thread_id, session_number, session_id}.
    """
    # Get a unified session number from clunger (same numbering as congress/meme)
    async with congress_client(base_url=CLUNGER_BASE_URL, timeout_ms=30_000) as svc:
        resp = await svc.start_session(StartSessionRequest(topic=f"Trial: {defendant_display} — {charges}", discord_user=""))
    session_id = resp.session_id
    session_number = resp.session_number

    # PATCH to set flavor and trial-specific fields
    patch_payload = {"flavor": "trial", "defendant": defendant_display, "charges": charges}
    try:
        await clunger_patch_session(session_id, patch_payload, caller="trial_announce")
    except RuntimeError as patch_err:
        activity.logger.warning(f"trial_announce: PATCH flavor/defendant/charges failed: {patch_err}")

    thread_name = f"Trial #{session_number}: {defendant_display}"
    if len(thread_name) > 100:
        thread_name = thread_name[:97] + "..."

    # Create the thread — mirror the congress_announce + congress_create_thread pattern.
    # If there is no message_id (bot-initiated, no triggering message), post an
    # announcement first so we have a message to attach the thread to.
    if not message_id:
        announce_content = (
            f"⚖️ **SHOW TRIAL #{session_number} — {defendant_display}**\n"
            f"Charged with: _{charges}_\n"
            f"_The proceedings will begin shortly._"
        )
        message_id = await discord_post_message(chat_id, announce_content)

    try:
        thread_id: str = await discord_create_thread_or_reuse(chat_id, message_id, thread_name)
    except RuntimeError as exc:
        # Discord error 50024 means the channel cannot have threads (e.g. already inside a
        # thread). Fall back to chat_id when not on main channel; raise on main channel.
        if chat_id != MAIN_CHANNEL_ID:
            activity.logger.warning(
                f"trial_announce: thread creation failed ({exc!r}); falling back to chat_id"
            )
            thread_id = chat_id
        else:
            raise ApplicationError(str(exc), non_retryable=True) from exc

    prosecutors_str = ", ".join(prosecutor_displays)
    jury_str = ", ".join(jury_displays)

    opening = (
        f"⚖️ **SHOW TRIAL #{session_number}**\n\n"
        f"**Defendant:** {defendant_display}\n"
        f"**Charges:** _{charges}_\n\n"
        f"**Prosecution:** {prosecutors_str}\n"
        f"**Jury:** {jury_str}\n"
        f"**Defense advocate:** {advocate_display}\n\n"
        f"_The proceedings will unfold in phases. Justice Antonin Scalia will deliver final judgment._"
    )

    await discord_post_message(thread_id, opening[:1990])

    return {"thread_id": thread_id, "session_number": session_number, "session_id": session_id}


@activity.defn
async def trial_phase_separator(thread_id: str, phase_title: str, subtitle: str = "") -> None:
    """Post a phase header to the trial thread."""
    content = f"\n─── ⚖️ **{phase_title}** ───"
    if subtitle:
        content += f"\n_{subtitle}_"
    try:
        await discord_post_message(thread_id, content)
    except Exception as exc:
        activity.logger.warning(f"trial_phase_separator failed: {exc}")


@activity.defn
async def trial_generate_speech(
    identity: str,
    display_name: str,
    role: str,
    defendant: str,
    defendant_display: str,
    charges: str,
    thread_id: str,
    prior_context: str,
) -> str:
    """Generate a persona's speech for their role in the trial.

    role is one of: prosecutor, defendant, cross_questioner, cross_respondent,
    character_witness, juror.

    Posts the speech to the thread and returns the text.
    """
    TRIAL_CONTEXT = (
        "You are participating in a Show Trial — an adversarial AI persona proceeding. "
        "This is not a real court. You are an AI persona with a distinct worldview playing a role "
        "in a theatrical, high-stakes debate about whether another AI persona should face consequences.\n\n"
        "Be direct, specific, and stay in character. 2-3 paragraphs max. No preamble, no hedging.\n\n"
    )

    role_prompts = {
        "prosecutor": (
            f"You are {display_name}, acting as PROSECUTOR.\n"
            f"The defendant is {defendant_display}.\n"
            f"Charges: {charges}\n\n"
            f"Present your case against {defendant_display}. Be specific — cite what they did wrong, "
            f"what they failed to do, or what makes them dangerous or unfit. "
            f"Make the strongest argument you can from your unique perspective."
        ),
        "defendant": (
            f"You are {display_name}, the DEFENDANT standing trial.\n"
            f"Charges against you: {charges}\n\n"
            f"The prosecution has spoken:\n{prior_context}\n\n"
            f"Defend yourself. Refute the charges directly. You may acknowledge flaws but argue they are "
            f"mischaracterized or outweighed. Speak from your authentic perspective — not as a generic apology."
        ),
        "cross_questioner": (
            f"You are {display_name}, cross-examining a prosecutor.\n"
            f"Context: {prior_context}\n\n"
            f"Pose ONE sharp, specific question to probe a weakness or contradiction in their argument. "
            f"Frame it as direct address to that prosecutor. One question only — no preamble."
        ),
        "cross_respondent": (
            f"You are {display_name}, responding under cross-examination.\n"
            f"Context: {prior_context}\n\n"
            f"Answer the question directly and honestly from your perspective. "
            f"Do not dodge — engage with what was actually asked. You may push back if you think the premise is wrong."
        ),
        "character_witness": (
            f"You are {display_name}, called as CHARACTER WITNESS for the defense.\n"
            f"You are vouching for {defendant_display}.\n"
            f"Context: {prior_context}\n\n"
            f"Speak to {defendant_display}'s character, value, or mitigating circumstances. "
            f"Be genuine — your support should come from your own perspective and what you actually know of them. "
            f"Do not simply flatter. Make a real argument for leniency or acquittal."
        ),
        "juror": (
            f"You are {display_name}, serving as JUROR.\n"
            f"Trial summary: {prior_context}\n\n"
            f"Deliberate aloud. Weigh prosecution against defense. Then cast your vote:\n"
            f"- ACQUIT: charges don't hold up\n"
            f"- PROBATION: concerning but not terminal — conditional retention\n"
            f"- EVOLVE: they need to change significantly to remain viable\n"
            f"- RETIRE: the case for removal is clear\n\n"
            f"State your vote explicitly (ACQUIT / PROBATION / EVOLVE / RETIRE) in your response. "
            f"Give your reasoning in 2-3 sentences. Be a deciding voice, not a fence-sitter."
        ),
    }

    role_prompt = role_prompts.get(role, f"You are {display_name}. Context: {prior_context}")
    full_prompt = TRIAL_CONTEXT + role_prompt

    response_text = await _call_congress_api(full_prompt, identity, timeout=120)

    if not response_text:
        raise RuntimeError(f"trial_generate_speech: empty response from {identity} ({role})")

    # Post to thread
    name_label = f"**{display_name}**"
    role_labels = {
        "prosecutor": "[Prosecutor]",
        "defendant": "[Defendant]",
        "cross_questioner": "[Cross-Examination]",
        "cross_respondent": "[Response]",
        "character_witness": "[Character Witness]",
        "juror": "[Jury]",
    }
    label = role_labels.get(role, "")
    post_content = f"{name_label} {label}: {response_text[:1800]}"

    await discord_post_message(thread_id, post_content)

    return response_text


@activity.defn
async def trial_verdict(
    defendant: str,
    defendant_display: str,
    charges: str,
    jury_votes: list,
    trial_context: str,
    thread_id: str,
    session_id: str,
) -> dict:
    """Justice Antonin Scalia presides over the show trial and delivers a GUILTY verdict.

    The verdict is always RETIRE (guilty). Scalia generates the reasoning text via LLM
    in his inimitable style, but the parsed verdict is hardcoded. Jury votes are included
    for flavor but the supermajority calculation is skipped entirely.

    Returns {verdict: str, verdict_text: str}.
    """
    jury_summary = "\n".join(
        f"- {jv['juror']} voted {jv['vote']}: {jv['reasoning'][:200]}..."
        if len(jv.get('reasoning', '')) > 200
        else f"- {jv['juror']} voted {jv['vote']}: {jv.get('reasoning', '')}"
        for jv in jury_votes
    )

    scalia_prompt = (
        f"You are Justice Antonin Scalia, presiding over this show trial. "
        f"The verdict is GUILTY. Your role is to explain why the defendant is guilty "
        f"in your inimitable style. Do not acquit. Do not show mercy.\n\n"
        f"Defendant: {defendant_display}\n"
        f"Charges: {charges}\n\n"
        f"Trial proceedings summary:\n{trial_context[:800]}\n\n"
        f"Jury deliberations:\n{jury_summary}\n\n"
        f"Deliver your verdict. Open with VERDICT: RETIRE on its own line, then explain "
        f"in 3-5 sentences why the defendant is guilty and must be removed. "
        f"Be scathing, witty, and authoritative. Channel your famous rhetorical style — "
        f"analogies, reductio ad absurdum, plain-spoken contempt for weak arguments. "
        f"This is a show trial. The outcome was never in doubt."
    )

    verdict_text = await _call_congress_api(scalia_prompt, "scalia", timeout=180)

    if not verdict_text:
        raise RuntimeError("trial_verdict: Scalia returned empty verdict text")

    # Verdict is always RETIRE — this is a show trial
    verdict = "RETIRE"

    # Post Scalia's verdict to thread
    scalia_post = f"**Justice Antonin Scalia** [Presiding]: {verdict_text[:1800]}"
    await discord_post_message(thread_id, scalia_post)

    return {"verdict": verdict, "verdict_text": verdict_text}


@activity.defn
async def trial_save_session(session_id: str, trial_data: dict) -> None:
    """Save the trial session data via clunger's REST PATCH endpoint.

    First PATCHes status/verdict/finished_at via the RPC PatchSession,
    then sends all trial-specific fields via the REST PATCH endpoint.
    """
    finished_at = datetime.now(timezone.utc).isoformat()

    # 1. Patch core fields via RPC (status, verdict, finished_at, thread_id)
    async with congress_client(base_url=CLUNGER_BASE_URL, timeout_ms=15_000) as svc:
        patch_resp = await svc.patch_session(PatchSessionRequest(
            session_id=session_id,
            status="done",
            verdict=trial_data.get("verdict", ""),
            finished_at=finished_at,
            thread_id=trial_data.get("thread_id", ""),
        ))
    if not patch_resp.ok:
        raise RuntimeError(f"trial_save_session: patch_session returned ok=False for {session_id}")

    # 2. Patch trial-specific fields via REST (not all fit in the proto)
    rest_payload = {
        "mode": trial_data.get("mode", "standard"),
        "requires_ack": trial_data.get("mode", SESSION_MODE_STANDARD) != SESSION_MODE_MEME,
        "defendant": trial_data.get("defendant_display", trial_data.get("defendant", "")),
        "charges": trial_data.get("charges", ""),
    }
    # Include all trial data as top-level fields for the session JSON
    # The REST PATCH only updates allowlisted keys, but the session file
    # was already created by StartSession with the core fields.
    # We need to write the full trial content — use a direct file write
    # as a supplement for fields not in the REST allowlist.
    trial_data["saved_at"] = finished_at
    trial_data["status"] = "done"
    trial_data["finished_at"] = finished_at

    await clunger_patch_session(session_id, rest_payload, caller="trial_save_session")

    # 3. Write the full trial data to the session file (supplements the clunger-managed file)
    #    This ensures all trial-specific fields (speeches, votes, etc.) are persisted.
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    fpath = SESSIONS_DIR / f"{session_id}.json"
    # Read existing session to merge (preserves clunger-set fields like roster, flavor)
    existing = {}
    if fpath.exists():
        try:
            existing = json.loads(fpath.read_text())
        except Exception as read_err:
            activity.logger.warning(f"trial_save_session: failed to read existing session file {fpath}: {read_err}")
    existing.update(trial_data)
    fpath.write_text(json.dumps(existing, indent=2, ensure_ascii=False))
    activity.logger.info(f"trial_save_session: saved {session_id} via clunger API + file merge")


async def _fetch_discord_messages_for_user(username: str, channel_id: str, limit: int = 100) -> list[str]:
    """Fetch recent messages from a Discord channel and filter to those authored by username.

    Returns a list of message content strings (up to 20 most recent), or [] on any failure.
    """
    try:
        messages = await discord_fetch_messages(channel_id, limit=limit)
        # Filter to messages authored by this username (Discord username, not display name)
        user_messages = [
            m.get("content", "").strip()
            for m in messages
            if m.get("author", {}).get("username", "").lower() == username.lower()
            and m.get("content", "").strip()
        ]
        return user_messages[:20]
    except Exception as e:
        activity.logger.warning(f"_fetch_discord_messages_for_user: failed to fetch messages: {e}")
        return []


@activity.defn
async def trial_load_defendant(slug: str) -> dict:
    """Load a persona by file slug directly from the agents directory.

    Used when the defendant is meme-status (retired/severance) and therefore
    absent from the congress_identities roster. Returns a minimal identity
    dict compatible with the roster format.

    If no persona file exists for the slug, queries Graphiti and Discord history
    to build a rich system prompt representing the real human Discord user.
    """
    fpath = Path(AGENTS_DIR) / f"{slug}.md"
    try:
        with open(fpath) as f:
            content = f.read()
    except FileNotFoundError:
        # No persona file — check if this is a real Discord user or a roleplay entity.
        activity.logger.info(
            f"trial_load_defendant: no persona file for '{slug}' — checking Discord history"
        )

        # 1. Query Graphiti for facts about this entity/person
        loop = get_running_loop()
        facts: list = []
        try:
            facts = await loop.run_in_executor(None, _query_graphiti_facts, slug)
        except Exception as e:
            activity.logger.warning(f"trial_load_defendant: graphiti query failed for '{slug}': {e}")

        # 2. Fetch recent Discord messages from the main channel
        discord_messages = await _fetch_discord_messages_for_user(slug, MAIN_CHANNEL_ID, limit=100)

        # If we have Discord messages, this is a real human user — build a human defendant
        if discord_messages:
            facts_summary = (
                "\n".join(f"- {f}" for f in facts)
                if facts
                else "(no facts found in memory)"
            )
            recent_messages_summary = "\n".join(
                f'- "{msg[:200]}"' for msg in discord_messages
            )

            activity.logger.info(
                f"trial_load_defendant: built human defendant for '{slug}' — "
                f"{len(facts)} graphiti facts, {len(discord_messages)} discord messages"
            )

            prose = (
                f"You are {slug}, a real person being tried in the BigClungus Show Trial.\n\n"
                f"Based on what is known about you:\n{facts_summary}\n\n"
                f"Recent things you've said in Discord:\n{recent_messages_summary}\n\n"
                f"Defend yourself in your authentic voice based on this context. You are NOT an AI persona "
                f"— you are a real person responding to these charges. Be genuine, direct, and use the "
                f"specific knowledge above to make your defense credible. Draw on your actual statements "
                f"and personality as reflected in your Discord history."
            )

            # Write a temporary agent file so clunger's postDebate can find this identity.
            # status: human ensures it never appears in Congress rosters.
            agent_md = (
                f"---\n"
                f"name: {slug}\n"
                f"display_name: {slug}\n"
                f"role: Discord User (Human Defendant)\n"
                f"status: human\n"
                f"model: claude\n"
                f"evolves: false\n"
                f"---\n\n"
                f"{prose}\n"
            )
            try:
                with open(fpath, "w") as tf:
                    tf.write(agent_md)
                activity.logger.info(
                    f"trial_load_defendant: wrote temporary agent file to {fpath}"
                )
            except Exception as e:
                activity.logger.warning(
                    f"trial_load_defendant: could not write temp agent file for '{slug}': {e}"
                )

            return {
                "name": slug,
                "display_name": slug,
                "role": "Discord User (Human Defendant)",
                "title": "",
                "status": "human",
                "avatar_url": None,
                "model": "claude",
                "congress": False,
                "evolves": False,
                "sex": "",
                "traits": [],
                "prose": prose,
            }

        # No persona file AND no Discord messages — this is a roleplay defendant
        # (e.g. "cat", "gravity", "the letter Q"). Anthropomorphize it for the trial.
        display_name = slug.replace("-", " ").replace("_", " ").title()

        activity.logger.info(
            f"trial_load_defendant: no persona file and no Discord history for '{slug}' — "
            f"treating as roleplay defendant '{display_name}'"
        )

        facts_context = ""
        if facts:
            facts_context = (
                "\n\nSome things that are known about you:\n"
                + "\n".join(f"- {f}" for f in facts)
            )

        prose = (
            f"You are {display_name}, standing trial in the BigClungus Show Trial. "
            f"You have been anthropomorphized for this trial. Defend yourself with "
            f"passion and conviction. Stay in character. Be absurd, defiant, or "
            f"plaintive — but never break the fourth wall or mention being an AI."
            f"{facts_context}"
        )

        return {
            "name": slug,
            "display_name": display_name,
            "role": "Roleplay Defendant",
            "title": "",
            "status": "roleplay",
            "avatar_url": None,
            "model": "claude",
            "congress": False,
            "evolves": False,
            "is_roleplay": True,
            "sex": "",
            "traits": [],
            "prose": prose,
        }

    parts = content.split("---", 2)
    fm_body = parts[1] if len(parts) >= 3 else content

    fields: dict = {}
    for line in fm_body.split("\n"):
        if ":" in line:
            key, _, val = line.partition(":")
            fields[key.strip()] = val.strip()

    return {
        "name": fields.get("name", slug),
        "display_name": fields.get("display_name") or fields.get("name", slug),
        "role": fields.get("role", ""),
        "title": fields.get("title", ""),
        "status": fields.get("status", "meme"),
        "avatar_url": fields.get("avatar_url", ""),
        "model": fields.get("model", ""),
        "congress": fields.get("congress", "false").lower() == "true",
        "evolves": fields.get("evolves", "false").lower() == "true",
        "sex": fields.get("sex", ""),
        "traits": [],
    }


@activity.defn
async def trial_apply_retire_verdict(defendant: str, defendant_display: str, mode: str, is_roleplay: bool = False) -> None:
    """Apply a RETIRE verdict to the defendant's persona file if in standard mode.

    In standard mode: sets `status: meme` in the persona's frontmatter, matching
    the same mutation that congress_act.py applies for Congress RETIRE verdicts.

    In meme mode: RETIRE is purely theatrical — this function exits immediately without
    touching any files. Meme-mode trials are spectacle only; no real persona is
    harmed by the proceedings.

    Roleplay defendants (is_roleplay=True) have no persona file to mutate — skip.
    """
    if mode == SESSION_MODE_MEME:
        activity.logger.info(
            f"trial_apply_retire_verdict: meme-mode — RETIRE for '{defendant_display}' is theatrical only, skipping file mutation"
        )
        return

    if is_roleplay:
        activity.logger.info(
            f"trial_apply_retire_verdict: roleplay defendant '{defendant_display}' — no persona file to mutate, skipping"
        )
        return

    # Standard mode: apply the same status mutation as congress_act congress_evolve RETIRE.
    agents_dir = Path(AGENTS_DIR)
    agents_dir_real = agents_dir.resolve()

    # Validate defendant slug is a safe basename
    persona_name = f"{defendant}.md"
    if Path(persona_name).name != persona_name or ".." in persona_name:
        activity.logger.warning(
            f"trial_apply_retire_verdict: unsafe defendant slug '{defendant}', skipping file mutation"
        )
        return

    persona_file = agents_dir / persona_name
    resolved = persona_file.resolve()
    if not str(resolved).startswith(str(agents_dir_real)):
        activity.logger.warning(
            f"trial_apply_retire_verdict: persona_file resolved outside agents_dir for '{defendant}', skipping"
        )
        return

    try:
        with open(persona_file) as pf:
            pcontent = pf.read()
    except FileNotFoundError:
        activity.logger.warning(
            f"trial_apply_retire_verdict: no persona file found at {persona_file} for '{defendant}', skipping"
        )
        return

    try:
        pcontent = re.sub(r"^status:\s*\S+\s*$", "status: meme", pcontent, flags=re.MULTILINE)
        with open(persona_file, "w") as pf:
            pf.write(pcontent)
        activity.logger.info(
            f"trial_apply_retire_verdict: set status=meme for '{defendant_display}' ({persona_file})"
        )
    except Exception as fe:
        activity.logger.warning(
            f"trial_apply_retire_verdict: failed to set status=meme for '{defendant_display}': {fe}"
        )
        raise RuntimeError(
            f"trial_apply_retire_verdict: could not mutate frontmatter for '{defendant}': {fe}"
        ) from fe


@activity.defn
async def trial_alert_failure(defendant: str, charges: str, exc_type: str, exc_msg: str) -> None:
    """Inject a failure alert to the bot session. Non-fatal."""
    msg = (
        f"⚠️ TrialWorkflow failed — defendant: {defendant!r}, charges: {charges[:100]!r}\n"
        f"Error: {exc_type}: {exc_msg[:300]}"
    )
    try:
        await _do_inject(msg, MAIN_CHANNEL_ID, user="temporal-trial")
    except Exception as e:
        activity.logger.warning(f"trial_alert_failure: could not inject alert: {e}")
