"""
Temporal workflow: SessionWorkflow (Unified)

Handles all session flavors: congress (standard), meme, and trial.

This is the unified workflow that merges CongressWorkflow and TrialWorkflow.
Both old workflow classes are kept as thin aliases for backward compatibility
with existing trigger code and Temporal schedules.

Flavor detection:
  - flavor="congress" or mode="standard" (default): standard congress debate
  - flavor="meme" or mode="meme": meme congress (no Ibrahim veto, no tasks)
  - flavor="trial": show trial (prosecution, defense, jury, Scalia verdict)

Input dict keys (shared):
  topic / charges  – the debate topic or charges (trial)
  chat_id          – Discord channel ID to post back to
  message_id       – (optional) Discord message ID that triggered this
  discord_user     – (optional) Discord user who triggered this
  flavor           – (optional) "congress" | "meme" | "trial"
  mode             – (optional) alias for flavor (legacy compat)

Congress-specific input keys:
  personas         – (optional) list of persona IDs for the roster
  forced_personas  – (optional) list of persona slugs that bypass recusal

Trial-specific input keys:
  defendant        – persona slug for the defendant
  charges          – charge string
"""
import asyncio
import json
import re
from datetime import timedelta
from typing import Any

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError, ApplicationError

with workflow.unsafe.imports_passed_through():
    from activities.congress_act import (
        MAX_ROUNDS,
        congress_alert_failure,
        congress_announce,
        congress_check_ibrahim,
        congress_check_midpoint,
        congress_commit_evolutions,
        congress_create_tasks,
        congress_create_thread,
        congress_debate,
        congress_duel_vote,
        congress_evolve,
        congress_finalize,
        congress_frame_topic,
        congress_graphiti_context,
        congress_identities,
        congress_load_session,
        congress_post_separator,
        congress_preflight_check,
        congress_report,
        congress_select_seats,
        congress_start,
        congress_vote,
    )
    from activities.constants import MAIN_CHANNEL_ID, SIGNAL_ABORT, SIGNAL_CONTINUE, SIGNAL_NO_DISPUTE, SIGNAL_REFRAME
    from activities.trial_act import (
        trial_alert_failure,
        trial_announce,
        trial_apply_retire_verdict,
        trial_generate_speech,
        trial_load_defendant,
        trial_phase_separator,
        trial_save_session,
        trial_verdict,
    )

_DEBATE_TIMEOUT = timedelta(minutes=3)
_SPEECH_TIMEOUT = timedelta(minutes=3)
_SHORT_TIMEOUT = timedelta(seconds=30)
_ALERT_TIMEOUT = timedelta(seconds=15)
_VERDICT_TIMEOUT = timedelta(minutes=4)


def _resolve_flavor(input: dict) -> str:
    """Determine the session flavor from input dict.

    Checks 'flavor' first, then 'mode', then falls back to detecting
    trial-specific keys ('defendant'). Returns one of: 'congress', 'meme', 'trial'.
    """
    flavor = input.get("flavor", "") or ""
    mode = input.get("mode", "") or ""

    if flavor == "trial" or (not flavor and "defendant" in input):
        return "trial"
    if flavor == "meme" or mode == "meme":
        return "meme"
    return "congress"


def _build_persona_lookup(candidates: list) -> dict:
    """Build lookup maps for persona resolution by name, lowercase name, and display name.

    Returns a dict with keys: 'by_name', 'by_name_lower', 'by_display'.
    """
    by_name = {i.get("name"): i for i in candidates if i.get("name")}
    by_name_lower = {(i.get("name") or "").lower(): i for i in candidates if i.get("name")}
    by_display = {}
    for i in candidates:
        dn = (i.get("display_name") or "").strip().strip('"').strip("'")
        if dn:
            by_display[dn.lower()] = i
    return {"by_name": by_name, "by_name_lower": by_name_lower, "by_display": by_display}


def _resolve_persona(slug: str, lookup: dict) -> object:
    """Look up a persona by exact name, case-insensitive name, or display name.

    Returns the matched identity dict, or None if not found.
    """
    slug_clean = slug.strip()
    slug_lower = slug_clean.lower()
    return (
        lookup["by_name"].get(slug_clean)
        or lookup["by_name_lower"].get(slug_lower)
        or lookup["by_display"].get(slug_lower)
    )


def _parse_jury_vote(speech: str) -> str:
    """Extract a jury vote from their deliberation text.

    Prefers explicit vote declarations; falls back to the last occurrence
    of a verdict keyword. Defaults to PROBATION if nothing is found.
    """
    explicit = re.search(r'\b(?:vote|voting|voted):\s*(ACQUIT|RETIRE|FIRE|EVOLVE|PROBATION)\b', speech, re.IGNORECASE)
    if explicit:
        v = explicit.group(1).upper()
        return "RETIRE" if v == "FIRE" else v
    explicit2 = re.search(r'\bI\s+vote\s+(ACQUIT|RETIRE|FIRE|EVOLVE|PROBATION)\b', speech, re.IGNORECASE)
    if explicit2:
        v = explicit2.group(1).upper()
        return "RETIRE" if v == "FIRE" else v
    last_match = None
    for m in re.finditer(r'\b(ACQUIT|RETIRE|FIRE|EVOLVE|PROBATION)\b', speech, re.IGNORECASE):
        last_match = m.group(1).upper()
    if last_match == "FIRE":
        last_match = "RETIRE"
    return last_match or "PROBATION"


@workflow.defn
class SessionWorkflow:
    """Unified workflow for congress, meme-congress, and show-trial sessions."""

    # ====================================================================== #
    # Top-level run — shared error handling and flavor dispatch
    # ====================================================================== #

    @workflow.run
    async def run(self, input: Any) -> dict:
        # Coerce a bare string into a dict (guards against CLI invocations that
        # pass the topic as a plain JSON string instead of an object).
        if isinstance(input, str):
            input = {"topic": input}
        flavor = _resolve_flavor(input)
        _session_tracker: list = ["unknown"]  # mutable container for error handler

        try:
            if flavor == "trial":
                return await self._run_trial(input, _session_tracker)
            else:
                return await self._run_congress(input, flavor, _session_tracker)
        except Exception as exc:
            # Shared failure alerting
            try:
                if flavor == "trial":
                    defendant = input.get("defendant", "unknown")
                    charges = input.get("charges", "unknown")
                    await workflow.execute_activity(
                        trial_alert_failure,
                        args=[defendant, charges, type(exc).__name__, str(exc)],
                        start_to_close_timeout=_ALERT_TIMEOUT,
                        retry_policy=RetryPolicy(maximum_attempts=1),
                    )
                else:
                    topic = input.get("topic", "unknown")
                    await workflow.execute_activity(
                        congress_alert_failure,
                        args=[topic, _session_tracker[0], type(exc).__name__, str(exc)],
                        start_to_close_timeout=_ALERT_TIMEOUT,
                        retry_policy=RetryPolicy(maximum_attempts=1),
                    )
            except Exception as _alert_err:
                workflow.logger.warning(f"congress_alert_failure activity itself failed: {_alert_err}")
            raise  # Re-raise so Temporal marks the workflow as failed

    # ====================================================================== #
    # Congress / Meme branch
    # ====================================================================== #

    def _merge_forced_personas(self, debaters: list, forced_personas: list, all_candidates: list) -> list:
        """Add forced_personas to debaters, bypassing recusal. Returns updated debaters list."""
        lookup = _build_persona_lookup(all_candidates)
        current_names = {d.get("name") for d in debaters}
        result = list(debaters)
        for fp in forced_personas:
            matched = _resolve_persona(fp, lookup)
            fp_clean = fp.strip()
            if matched:
                if matched.get("name") not in current_names:
                    result.append(matched)
                    current_names.add(matched.get("name"))
                    workflow.logger.info(
                        f"forced_personas: added '{matched.get('name')}' (display='{matched.get('display_name')}') — recusal bypassed"
                    )
                else:
                    workflow.logger.info(
                        f"forced_personas: '{fp_clean}' already in debater pool — skipping duplicate"
                    )
            else:
                workflow.logger.warning(
                    f"forced_personas: '{fp_clean}' not found in identities — skipping. "
                    f"Available names: {sorted(lookup['by_name'].keys())}"
                )
        return result

    async def _run_debate_round(
        self,
        topic: str,
        debaters: list,
        session_id: str,
        thread_id,
        debater_display_names: list,
        round_num: int,
        pre_debate_context: str,
        parallel: bool = True,
    ) -> list:
        """Run one debate round for all debaters.

        Returns a list of {"identity": display_name, "snippet": ..., "round": round_num}.
        If parallel=True, all debaters run concurrently (Round 1 behaviour).
        If parallel=False, debaters run sequentially (Round 2+ rebuttal behaviour).
        """
        summaries = []
        if parallel:
            round_tasks = [
                workflow.execute_activity(
                    congress_debate,
                    args=[topic, i.get("name", str(i)), session_id, thread_id, i.get("display_name") or i.get("name", str(i)), round_num, debater_display_names, pre_debate_context],
                    start_to_close_timeout=_DEBATE_TIMEOUT,
                    schedule_to_start_timeout=timedelta(minutes=3),
                    retry_policy=RetryPolicy(maximum_attempts=2),
                )
                for i in debaters
            ]
            responses = await asyncio.gather(*round_tasks, return_exceptions=True)
            for identity_obj, response in zip(debaters, responses):
                display_name: str = identity_obj.get("display_name") or identity_obj.get("name", str(identity_obj))
                if isinstance(response, Exception):
                    workflow.logger.warning(f"Round {round_num} debate failed for {display_name}: {response}")
                    response_text = f"[DEBATE FAILED: {response}]"
                else:
                    response_text = response
                snippet = response_text[:500].strip() if response_text else ""
                summaries.append({"identity": display_name, "snippet": snippet, "round": round_num})
        else:
            for identity_obj in debaters:
                identity_name: str = identity_obj.get("name", str(identity_obj))
                display_name: str = identity_obj.get("display_name") or identity_name
                try:
                    response_text: str = await workflow.execute_activity(
                        congress_debate,
                        args=[topic, identity_name, session_id, thread_id, display_name, round_num, debater_display_names, pre_debate_context],
                        start_to_close_timeout=_DEBATE_TIMEOUT,
                        schedule_to_start_timeout=timedelta(minutes=3),
                        retry_policy=RetryPolicy(maximum_attempts=2),
                    )
                except Exception as exc:
                    workflow.logger.warning(f"Round {round_num} debate failed for {display_name}: {exc}")
                    response_text = f"[DEBATE FAILED: {exc}]"
                snippet = response_text[:500].strip() if response_text else ""
                summaries.append({"identity": display_name, "snippet": snippet, "round": round_num})
        return summaries

    async def _run_congress(self, input: dict, flavor: str, _session_tracker: list) -> dict:
        topic: str = input["topic"]
        chat_id: str = input.get("chat_id", MAIN_CHANNEL_ID)
        message_id: str = input.get("message_id")
        discord_user: str = input.get("discord_user", "") or input.get("user", "")
        custom_personas: list = input.get("personas") or []
        forced_personas: list = input.get("forced_personas") or []
        is_meme: bool = (flavor == "meme")
        mode: str = "meme" if is_meme else "standard"

        # ------------------------------------------------------------------ #
        # 1. Start session
        # ------------------------------------------------------------------ #
        session_info: dict = await workflow.execute_activity(
            congress_start,
            {"topic": topic, "discord_user": discord_user},
            start_to_close_timeout=_SHORT_TIMEOUT,
            schedule_to_start_timeout=timedelta(minutes=3),
            retry_policy=RetryPolicy(maximum_attempts=1),
        )
        session_id: str = session_info["session_id"]
        session_number: int = session_info.get("session_number", 0)
        _session_tracker[0] = session_id

        # ------------------------------------------------------------------ #
        # 1b. Idempotency check — skip debate if session already completed
        # ------------------------------------------------------------------ #
        if session_number:
            existing: dict = await workflow.execute_activity(
                congress_load_session,
                session_number,
                start_to_close_timeout=_SHORT_TIMEOUT,
                schedule_to_start_timeout=timedelta(minutes=3),
                retry_policy=RetryPolicy(maximum_attempts=1),
            )
            if existing.get("status") == "done":
                workflow.logger.info(
                    f"congress idempotency: session {session_id} already has status=done — "
                    "skipping debate and jumping to congress_report"
                )
                existing_verdict: str = existing.get("verdict") or "NO VERDICT"
                existing_thread_id = existing.get("thread_id")
                existing_evolution: dict = existing.get("evolution") or {}
                if isinstance(existing_evolution, str):
                    try:
                        existing_evolution = json.loads(existing_evolution)
                    except Exception:
                        existing_evolution = {}
                existing_vote_summary: dict = existing.get("vote_summary") or {}
                existing_mode: str = existing.get("mode") or mode
                existing_task_urls: list = []  # tasks already created; don't recreate

                await workflow.execute_activity(
                    congress_report,
                    args=[
                        chat_id, session_id, session_number, existing_verdict, topic,
                        [], existing_thread_id, MAIN_CHANNEL_ID,
                        existing_evolution, existing_task_urls,
                        existing_vote_summary, existing_mode,
                    ],
                    start_to_close_timeout=_SHORT_TIMEOUT,
                    schedule_to_start_timeout=timedelta(minutes=3),
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )
                return {"session_id": session_id, "verdict": existing_verdict}

        # ------------------------------------------------------------------ #
        # 2. Get identities
        # ------------------------------------------------------------------ #
        identities: list = await workflow.execute_activity(
            congress_identities,
            mode,
            start_to_close_timeout=_SHORT_TIMEOUT,
            schedule_to_start_timeout=timedelta(minutes=3),
            retry_policy=RetryPolicy(maximum_attempts=1),
        )

        eligible_statuses = ("eligible", "meme") if is_meme else ("eligible",)
        all_candidates = [i for i in identities if i.get("name") != "chairman" and i.get("status", "eligible") in eligible_statuses]
        hiring_managers = [i for i in identities if i.get("name") == "chairman"]

        if custom_personas:
            lookup = _build_persona_lookup(all_candidates)
            debaters = []
            for pid in custom_personas:
                matched = _resolve_persona(pid, lookup)
                pid_clean = pid.strip()
                if matched:
                    debaters.append(matched)
                    workflow.logger.info(f"custom persona '{pid_clean}' resolved to '{matched.get('name')}'")
                else:
                    workflow.logger.warning(f"custom persona '{pid_clean}' not found in identities — skipping. Available names: {sorted(lookup['by_name'].keys())}")
            resolved_names = [d.get("name") for d in debaters]
            workflow.logger.info(f"custom_personas resolved: requested={custom_personas}, resolved={resolved_names}")
            if not debaters:
                workflow.logger.warning("custom_personas specified but none matched — falling back to full candidate list")
                debaters = all_candidates
        else:
            debaters = await workflow.execute_activity(
                congress_select_seats,
                args=[topic, all_candidates, session_id],
                start_to_close_timeout=_DEBATE_TIMEOUT,
                schedule_to_start_timeout=timedelta(minutes=3),
                retry_policy=RetryPolicy(maximum_attempts=1),
            )

        # ------------------------------------------------------------------ #
        # 2a. Recusal
        # ------------------------------------------------------------------ #
        firing_keywords = {
            "retire", "retired", "retiring", "retirement",
            "fire", "fired", "firing",
            "terminate", "termination", "severance",
            "remove", "removal", "dismiss", "dismissal",
            "kick out", "let go", "impeach", "impeachment",
        }
        topic_lower = topic.lower()
        if any(kw in topic_lower for kw in firing_keywords):
            recused = []
            kept = []
            for d in debaters:
                d_name = (d.get("name") or "").lower()
                d_display = (d.get("display_name") or "").lower()
                d_role = (d.get("role") or "").lower()
                d_title = (d.get("title") or "").lower()
                tokens = [t for t in [d_name, d_display, d_role, d_title] if t]
                is_subject = any(tok in topic_lower for tok in tokens if len(tok) > 2)
                if is_subject:
                    recused.append(d.get("display_name") or d.get("name", str(d)))
                else:
                    kept.append(d)
            if recused:
                workflow.logger.info(
                    f"congress recusal: excluded {recused} — their own termination is the topic"
                )
                debaters = kept

        # 2a-ii. Forced personas bypass recusal
        if forced_personas:
            debaters = self._merge_forced_personas(debaters, forced_personas, all_candidates)

        # ------------------------------------------------------------------ #
        # 2b. Debater count sanity checks
        # ------------------------------------------------------------------ #
        if not debaters:
            raise ApplicationError(
                "No debaters could be resolved — congress cannot proceed",
                non_retryable=True,
            )

        if len(debaters) < 5:
            raise ApplicationError(
                f"Congress seated only {len(debaters)} debater(s) — minimum is 5. "
                f"Seated: {[d.get('name') for d in debaters]}. Topic: {topic}",
                non_retryable=True,
            )

        # ------------------------------------------------------------------ #
        # 2c. Multimodel preflight — downgrade unavailable backends to Claude
        # ------------------------------------------------------------------ #
        debaters = await workflow.execute_activity(
            congress_preflight_check,
            args=[debaters],
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=RetryPolicy(maximum_attempts=1),
        )

        # ------------------------------------------------------------------ #
        # 3. Create Discord thread (if message_id is available)
        # ------------------------------------------------------------------ #
        thread_id: str | None = None
        main_channel_id: str = MAIN_CHANNEL_ID

        if not message_id and chat_id:
            message_id = await workflow.execute_activity(
                congress_announce,
                args=[chat_id, topic],
                start_to_close_timeout=_SHORT_TIMEOUT,
                retry_policy=RetryPolicy(maximum_attempts=1),
            )

        if message_id:
            try:
                thread_id = await workflow.execute_activity(
                    congress_create_thread,
                    args=[chat_id, message_id, session_number, topic],
                    start_to_close_timeout=_SHORT_TIMEOUT,
                    schedule_to_start_timeout=timedelta(minutes=3),
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )
            except ActivityError as _thread_err:
                if chat_id != MAIN_CHANNEL_ID:
                    workflow.logger.warning(f"congress_create_thread failed, falling back to chat_id as thread: {_thread_err}")
                    thread_id = chat_id
                else:
                    raise ApplicationError(
                        f"congress_create_thread failed on main channel and no fallback thread is available. "
                        f"Debate cannot proceed without a thread. Original error: {_thread_err}",
                        non_retryable=True,
                    ) from _thread_err

        # ------------------------------------------------------------------ #
        # 3b. Ibrahim pre-debate framing
        # ------------------------------------------------------------------ #
        pre_debate_context: str = ""
        try:
            pre_debate_context = await workflow.execute_activity(
                congress_frame_topic,
                args=[topic],
                start_to_close_timeout=_SHORT_TIMEOUT,
                schedule_to_start_timeout=timedelta(minutes=3),
                retry_policy=RetryPolicy(maximum_attempts=1),
            )
        except ActivityError as _err:
            workflow.logger.warning(f"congress_frame_topic failed (non-fatal): {_err}")
            pre_debate_context = ""

        # ------------------------------------------------------------------ #
        # 4. Debate rounds
        # ------------------------------------------------------------------ #
        debate_summaries: list = []
        debater_display_names: list = [
            i.get("display_name") or i.get("name", str(i)) for i in debaters
        ]

        reframe_used: bool = False
        aborted: bool = False
        abort_verdict: str = ""

        for round_num in range(1, MAX_ROUNDS + 1):
            if round_num > 1 and thread_id:
                label = "Rebuttal Round — responding to each other" if round_num == 2 else f"Round {round_num}"
                await workflow.execute_activity(
                    congress_post_separator,
                    args=[thread_id, f"--- **{label}** ---"],
                    start_to_close_timeout=_ALERT_TIMEOUT,
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )

            if round_num == 1:
                debate_summaries.extend(
                    await self._run_debate_round(topic, debaters, session_id, thread_id, debater_display_names, round_num, pre_debate_context, parallel=True)
                )

                # Ibrahim ABORT/REFRAME check (skipped in meme mode)
                if is_meme:
                    signal: str = SIGNAL_CONTINUE
                    check_reason: str = ""
                else:
                    ibrahim_check: dict = await workflow.execute_activity(
                        congress_check_ibrahim,
                        args=[topic, pre_debate_context, debate_summaries, session_id],
                        start_to_close_timeout=_DEBATE_TIMEOUT,
                        schedule_to_start_timeout=timedelta(minutes=3),
                        retry_policy=RetryPolicy(maximum_attempts=1),
                    )
                    signal: str = ibrahim_check.get("signal", SIGNAL_CONTINUE)
                    check_reason: str = ibrahim_check.get("reason", "")

                if signal == SIGNAL_ABORT:
                    if thread_id:
                        await workflow.execute_activity(
                            congress_post_separator,
                            args=[thread_id, f"**Ibrahim has called ABORT:** {check_reason}"],
                            start_to_close_timeout=_ALERT_TIMEOUT,
                            retry_policy=RetryPolicy(maximum_attempts=1),
                        )
                    aborted = True
                    abort_verdict = f"ABORTED by Ibrahim: {check_reason}"
                    break
                elif signal == SIGNAL_REFRAME and not reframe_used:
                    new_topic: str = ibrahim_check.get("new_topic") or topic
                    reframe_used = True
                    workflow.logger.info(f"Ibrahim REFRAME: '{topic}' -> '{new_topic}'")

                    if thread_id:
                        await workflow.execute_activity(
                            congress_post_separator,
                            args=[thread_id, f"**Ibrahim is reframing the topic:**\n*Original:* {topic}\n*New topic:* {new_topic}"],
                            start_to_close_timeout=_ALERT_TIMEOUT,
                            retry_policy=RetryPolicy(maximum_attempts=1),
                        )

                    topic = new_topic
                    try:
                        pre_debate_context = await workflow.execute_activity(
                            congress_frame_topic,
                            args=[topic],
                            start_to_close_timeout=_SHORT_TIMEOUT,
                            schedule_to_start_timeout=timedelta(minutes=3),
                            retry_policy=RetryPolicy(maximum_attempts=1),
                        )
                    except ActivityError as _err:
                        workflow.logger.warning(f"congress_frame_topic failed on reframe (non-fatal): {_err}")
                        pre_debate_context = (
                            "No relevant context found in memory — debate is proceeding without grounding. "
                            "Ibrahim should weight this accordingly."
                        )

                    debate_summaries = []
                    if thread_id:
                        await workflow.execute_activity(
                            congress_post_separator,
                            args=[thread_id, "--- **Round 1 (Reframed)** ---"],
                            start_to_close_timeout=_ALERT_TIMEOUT,
                            retry_policy=RetryPolicy(maximum_attempts=1),
                        )
                    debate_summaries.extend(
                        await self._run_debate_round(topic, debaters, session_id, thread_id, debater_display_names, 1, pre_debate_context, parallel=True)
                    )

                elif signal == SIGNAL_REFRAME and reframe_used:
                    workflow.logger.warning("Ibrahim requested REFRAME but max reframes already used — proceeding with CONTINUE")

            else:
                debate_summaries.extend(
                    await self._run_debate_round(topic, debaters, session_id, thread_id, debater_display_names, round_num, pre_debate_context, parallel=False)
                )

                # Midpoint kill switch: after Round 2, check if there's a genuine dispute
                midpoint = (MAX_ROUNDS + 1) // 2
                if round_num == midpoint and not is_meme:
                    ibrahim_midpoint: dict = await workflow.execute_activity(
                        congress_check_midpoint,
                        args=[topic, debate_summaries, session_id],
                        start_to_close_timeout=_DEBATE_TIMEOUT,
                        schedule_to_start_timeout=timedelta(minutes=3),
                        retry_policy=RetryPolicy(maximum_attempts=1),
                    )
                    mid_signal: str = ibrahim_midpoint.get("signal", SIGNAL_CONTINUE)
                    mid_reason: str = ibrahim_midpoint.get("reason", "")

                    if mid_signal == SIGNAL_NO_DISPUTE:
                        if thread_id:
                            await workflow.execute_activity(
                                congress_post_separator,
                                args=[thread_id, f"**Ibrahim finds no actionable disagreement:** {mid_reason}"],
                                start_to_close_timeout=_ALERT_TIMEOUT,
                                retry_policy=RetryPolicy(maximum_attempts=1),
                            )
                        aborted = True
                        abort_verdict = f"No actionable disagreement found: {mid_reason}"
                        workflow.logger.info(f"Midpoint kill switch triggered: {mid_reason}")
                        break

        # ------------------------------------------------------------------ #
        # 5. Chairman synthesis (skipped if aborted)
        # ------------------------------------------------------------------ #
        verdict = "NO VERDICT"
        has_anti_ibrahim = any(d.get("name") == "anti-ibrahim" for d in debaters)
        duel_mode = has_anti_ibrahim and hiring_managers
        ibrahim_verdict = ""
        anti_verdict = ""

        if aborted:
            verdict = abort_verdict
        elif hiring_managers:
            hm_obj = hiring_managers[0]
            hm_name: str = hm_obj.get("name", "chairman")
            hm_display: str = hm_obj.get("display_name") or hm_name

            graphiti_ctx: str = ""
            try:
                graphiti_ctx = await workflow.execute_activity(
                    congress_graphiti_context,
                    args=[topic],
                    start_to_close_timeout=_SHORT_TIMEOUT,
                    schedule_to_start_timeout=timedelta(minutes=3),
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )
            except ActivityError as _err:
                workflow.logger.warning(f"congress_graphiti_context failed (non-fatal): {_err}")
                graphiti_ctx = ""

            dissent_keywords = {"disagree", "wrong", "however", "but", "instead", "oppose", "reject", "no,", "not ", "actually"}
            dissenting_debaters: list = []
            for entry in debate_summaries:
                if entry.get("round") and entry["round"] > 0:
                    snippet_lower = (entry.get("snippet") or "").lower()
                    if any(kw in snippet_lower for kw in dissent_keywords):
                        name_entry = entry.get("identity", "unknown")
                        if name_entry not in dissenting_debaters:
                            dissenting_debaters.append(name_entry)

            total_debaters = len(debaters)
            dissent_note = ""
            if dissenting_debaters:
                dissent_note = (
                    f"\n\n## Debate dissent summary:\n"
                    f"{len(dissenting_debaters)} of {total_debaters} debaters "
                    f"({', '.join(dissenting_debaters)}) expressed significant disagreement "
                    f"or contrarian positions during the debate rounds. "
                    f"Consider whether the consensus is genuine or whether minority views deserve weight in your verdict."
                )

            pre_debate_section = (
                f"\n\n## Pre-Debate Context Brief (what was known before Round 1):\n{pre_debate_context}"
                if pre_debate_context
                else (
                    "\n\n## Pre-Debate Context Brief:\n"
                    "No relevant context found in memory — debate proceeded without grounding. "
                    "Weight your verdict accordingly."
                )
            )
            no_evolution_instruction = (
                "## Important instruction for this synthesis:\n"
                "Do NOT include evolution verdicts, hiring decisions, or RETAIN/RETIRE/EVOLVE "
                "judgments in your synthesis. Those are handled in a separate step after this "
                "one. Focus only on the debate substance, conclusions, and actionable "
                "recommendations for the topic at hand.\n\n"
            )
            synthesis_context = no_evolution_instruction + (graphiti_ctx + dissent_note if (graphiti_ctx or dissent_note) else "") + pre_debate_section

            def _trim_synthesis(text: str) -> str:
                """Trim synthesis to a safe length."""
                if not text:
                    return text
                if len(text) <= 1800:
                    return text.strip()
                cut = text[:1800].rfind('. ')
                return (text[:cut + 1] if cut > 0 else text[:1800]).strip()

            if duel_mode:
                # --- SYNTHESIS DUEL ---
                # Both Ibrahim and anti-ibrahim produce competing verdicts.
                # Debaters vote on whose synthesis is better.
                anti_obj = next(d for d in debaters if d.get("name") == "anti-ibrahim")
                anti_name: str = "anti-ibrahim"
                anti_display: str = anti_obj.get("display_name") or anti_name

                # Add duel instruction to both synthesis contexts
                duel_instruction = (
                    "## SYNTHESIS DUEL:\n"
                    "Ibraheem the Unruly is also producing a competing synthesis of this debate. "
                    "The debaters will vote on whose verdict is better. "
                    "Bring your best work — you are competing for the soul of this verdict.\n\n"
                )
                full_context = duel_instruction + synthesis_context

                # Run both syntheses concurrently
                ibrahim_task = workflow.execute_activity(
                    congress_debate,
                    args=[topic, hm_name, session_id, thread_id, hm_display, 1, None, full_context],
                    start_to_close_timeout=_DEBATE_TIMEOUT,
                    schedule_to_start_timeout=timedelta(minutes=3),
                    retry_policy=RetryPolicy(maximum_attempts=2),
                )
                anti_task = workflow.execute_activity(
                    congress_debate,
                    args=[topic, anti_name, session_id, thread_id, anti_display, 1, None, full_context],
                    start_to_close_timeout=_DEBATE_TIMEOUT,
                    schedule_to_start_timeout=timedelta(minutes=3),
                    retry_policy=RetryPolicy(maximum_attempts=2),
                )
                try:
                    results = await asyncio.gather(ibrahim_task, anti_task, return_exceptions=True)
                    ibrahim_raw = results[0] if not isinstance(results[0], Exception) else ""
                    anti_raw = results[1] if not isinstance(results[1], Exception) else ""
                    ibrahim_verdict = _trim_synthesis(ibrahim_raw) if ibrahim_raw else ""
                    anti_verdict = _trim_synthesis(anti_raw) if anti_raw else ""
                except Exception as _e:
                    workflow.logger.warning(f"Synthesis duel activity failed: {_e}")
                    ibrahim_verdict = ""
                    anti_verdict = ""

                debate_summaries.append({"identity": hm_display, "snippet": (ibrahim_verdict[:300] + "...") if len(ibrahim_verdict) > 300 else ibrahim_verdict})
                debate_summaries.append({"identity": anti_display, "snippet": (anti_verdict[:300] + "...") if len(anti_verdict) > 300 else anti_verdict})

                if thread_id:
                    await workflow.execute_activity(
                        congress_post_separator,
                        args=[thread_id, "--- **Duel Verdicts Posted** ---"],
                        start_to_close_timeout=_ALERT_TIMEOUT,
                        retry_policy=RetryPolicy(maximum_attempts=1),
                    )
            else:
                # Normal single-Ibrahim synthesis
                try:
                    synthesis_text: str = await workflow.execute_activity(
                        congress_debate,
                        args=[topic, hm_name, session_id, thread_id, hm_display, 1, None, synthesis_context],
                        start_to_close_timeout=_DEBATE_TIMEOUT,
                        schedule_to_start_timeout=timedelta(minutes=3),
                        retry_policy=RetryPolicy(maximum_attempts=2),
                    )
                    verdict = _trim_synthesis(synthesis_text) if synthesis_text else synthesis_text
                    if not synthesis_text:
                        verdict = synthesis_text
                except Exception as _e:
                    workflow.logger.warning(f"Synthesis activity failed: {_e}")
                    verdict = "Synthesis activity failed — see logs for details."
                debate_summaries.append({"identity": hm_display, "snippet": (verdict[:300] + "...") if len(verdict) > 300 else verdict})

        # ------------------------------------------------------------------ #
        # 5b. Duel vote or post-synthesis vote
        # ------------------------------------------------------------------ #
        vote_summary: dict = {}
        if duel_mode:
            # SYNTHESIS DUEL: debaters vote whose synthesis is better
            if thread_id:
                await workflow.execute_activity(
                    congress_post_separator,
                    args=[thread_id, "--- **Synthesis Duel Vote** ---"],
                    start_to_close_timeout=_ALERT_TIMEOUT,
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )

            duel_vote_tasks = [
                workflow.execute_activity(
                    congress_duel_vote,
                    args=[
                        identity_obj.get("name", str(identity_obj)),
                        ibrahim_verdict,
                        anti_verdict,
                        session_id,
                        thread_id,
                        identity_obj.get("display_name") or identity_obj.get("name", str(identity_obj)),
                    ],
                    start_to_close_timeout=timedelta(minutes=2),
                    schedule_to_start_timeout=timedelta(minutes=3),
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )
                for identity_obj in debaters
            ]
            raw_duel_votes = await asyncio.gather(*duel_vote_tasks, return_exceptions=True)

            ibrahim_votes = []
            anti_votes = []
            for result in raw_duel_votes:
                if isinstance(result, Exception):
                    workflow.logger.warning(f"congress_duel_vote task failed: {result}")
                    continue
                if result.get("vote") == "anti-ibrahim":
                    anti_votes.append(result["name"])
                else:
                    ibrahim_votes.append(result["name"])

            total_votes = len(ibrahim_votes) + len(anti_votes)
            tally = f"ibrahim={len(ibrahim_votes)} anti-ibrahim={len(anti_votes)}" if total_votes > 0 else "0 votes cast"
            vote_summary = {"ibrahim": ibrahim_votes, "anti-ibrahim": anti_votes, "tally": tally, "duel": True}

            # The winner's verdict becomes the official verdict
            if len(anti_votes) > len(ibrahim_votes):
                verdict = anti_verdict
                workflow.logger.info(f"Synthesis duel: anti-ibrahim wins ({len(anti_votes)}-{len(ibrahim_votes)})")
            else:
                verdict = ibrahim_verdict
                workflow.logger.info(f"Synthesis duel: ibrahim wins ({len(ibrahim_votes)}-{len(anti_votes)})")

            if thread_id and total_votes > 0:
                ibrahim_str = ", ".join(ibrahim_votes) if ibrahim_votes else "none"
                anti_str = ", ".join(anti_votes) if anti_votes else "none"
                tally_msg = f"**Duel result:** {tally} — Ibrahim: {ibrahim_str} | Ibraheem: {anti_str}"
                await workflow.execute_activity(
                    congress_post_separator,
                    args=[thread_id, tally_msg],
                    start_to_close_timeout=_ALERT_TIMEOUT,
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )
        elif not aborted and debaters and verdict and verdict != "NO VERDICT":
            # Normal post-synthesis vote
            if thread_id:
                await workflow.execute_activity(
                    congress_post_separator,
                    args=[thread_id, "--- **Synthesis Vote** ---"],
                    start_to_close_timeout=_ALERT_TIMEOUT,
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )

            vote_tasks = [
                workflow.execute_activity(
                    congress_vote,
                    args=[
                        identity_obj.get("name", str(identity_obj)),
                        verdict,
                        session_id,
                        thread_id,
                        identity_obj.get("display_name") or identity_obj.get("name", str(identity_obj)),
                    ],
                    start_to_close_timeout=timedelta(minutes=2),
                    schedule_to_start_timeout=timedelta(minutes=3),
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )
                for identity_obj in debaters
            ]
            raw_votes = await asyncio.gather(*vote_tasks, return_exceptions=True)

            agree_list = []
            disagree_list = []
            for result in raw_votes:
                if isinstance(result, Exception):
                    workflow.logger.warning(f"congress_vote task failed: {result}")
                    continue
                if result.get("vote") == "AGREE":
                    agree_list.append(result["name"])
                else:
                    disagree_list.append(result["name"])

            total = len(agree_list) + len(disagree_list)
            tally = f"{len(agree_list)}/{total} agreed" if total > 0 else "0/0 agreed"
            vote_summary = {"agree": agree_list, "disagree": disagree_list, "tally": tally}

            if thread_id and total > 0:
                agree_str = ", ".join(agree_list) if agree_list else "none"
                disagree_str = ", ".join(disagree_list) if disagree_list else "none"
                tally_msg = f"**Vote tally:** {tally} — agreed: {agree_str} | dissented: {disagree_str}"
                await workflow.execute_activity(
                    congress_post_separator,
                    args=[thread_id, tally_msg],
                    start_to_close_timeout=_ALERT_TIMEOUT,
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )

        # ------------------------------------------------------------------ #
        # 6b. Evolve/retire personas (skipped if aborted)
        # ------------------------------------------------------------------ #
        evolution_results: dict = {}
        if not aborted:
            try:
                evolution_results = await workflow.execute_activity(
                    congress_evolve,
                    args=[session_id, topic, debate_summaries],
                    start_to_close_timeout=_DEBATE_TIMEOUT,
                    schedule_to_start_timeout=timedelta(minutes=3),
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )
            except ActivityError as _err:
                workflow.logger.warning(f"congress_evolve_personas failed (non-fatal): {_err}")
                evolution_results = {}

        if evolution_results:
            await workflow.execute_activity(
                congress_commit_evolutions,
                session_id,
                start_to_close_timeout=timedelta(minutes=2),
                schedule_to_start_timeout=timedelta(minutes=3),
                retry_policy=RetryPolicy(maximum_attempts=1),
            )

        for created_persona in evolution_results.get("created", []):
            workflow.logger.info(
                f"congress_evolve: new persona created — slug={created_persona.get('new_slug')!r}, "
                f"display_name={created_persona.get('display_name')!r}, reason={created_persona.get('reason')!r}"
            )

        # ------------------------------------------------------------------ #
        # 6. Persist verdict + evolution results
        # ------------------------------------------------------------------ #
        await workflow.execute_activity(
            congress_finalize,
            args=[session_id, verdict, evolution_results or {}, thread_id, vote_summary or {}, mode],
            start_to_close_timeout=_SHORT_TIMEOUT,
            schedule_to_start_timeout=timedelta(minutes=3),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )

        # ------------------------------------------------------------------ #
        # 6d. Create local task files from verdict (skipped in meme mode)
        # ------------------------------------------------------------------ #
        task_urls: list = []
        if not is_meme:
            try:
                task_urls = await workflow.execute_activity(
                    congress_create_tasks,
                    args=[session_id, session_number, topic, verdict],
                    start_to_close_timeout=_DEBATE_TIMEOUT,
                    schedule_to_start_timeout=timedelta(minutes=3),
                    retry_policy=RetryPolicy(maximum_attempts=1),
                )
            except ActivityError as _err:
                workflow.logger.warning(f"congress_create_tasks failed (non-fatal): {_err}")
                task_urls = []

        # ------------------------------------------------------------------ #
        # 7. Post back to Discord
        # ------------------------------------------------------------------ #
        await workflow.execute_activity(
            congress_report,
            args=[chat_id, session_id, session_number, verdict, topic, debate_summaries, thread_id, main_channel_id, evolution_results, task_urls, vote_summary or {}, mode],
            start_to_close_timeout=_SHORT_TIMEOUT,
            schedule_to_start_timeout=timedelta(minutes=3),
            retry_policy=RetryPolicy(maximum_attempts=1),
        )

        return {"session_id": session_id, "verdict": verdict}

    # ====================================================================== #
    # Trial branch
    # ====================================================================== #

    async def _run_trial(self, input: dict, _session_tracker: list) -> dict:
        defendant: str = input["defendant"]
        charges: str = input["charges"]
        chat_id: str = input.get("chat_id", MAIN_CHANNEL_ID)
        message_id: str = input.get("message_id")
        discord_user: str = input.get("discord_user", "") or input.get("user", "")
        mode: str = input.get("mode", "standard") or "standard"

        # ------------------------------------------------------------------ #
        # 1. Get identities and build trial roster
        # ------------------------------------------------------------------ #
        identities: list = await workflow.execute_activity(
            congress_identities,
            "show_trial",
            start_to_close_timeout=_SHORT_TIMEOUT,
            schedule_to_start_timeout=timedelta(minutes=3),
            retry_policy=RetryPolicy(maximum_attempts=1),
        )

        defendant_obj = None
        eligible_pool = []
        for ident in identities:
            if ident.get("name") == defendant:
                defendant_obj = ident
            elif ident.get("name") != "chairman" and ident.get("status", "eligible") != "moderator":
                eligible_pool.append(ident)

        if not defendant_obj:
            defendant_obj = await workflow.execute_activity(
                trial_load_defendant,
                defendant,
                start_to_close_timeout=_SHORT_TIMEOUT,
                schedule_to_start_timeout=timedelta(minutes=3),
                retry_policy=RetryPolicy(maximum_attempts=1),
            )

        eligible_pool = [i for i in eligible_pool if i.get("name") != defendant]

        if len(eligible_pool) < 7:
            raise ApplicationError(
                f"Not enough personas for a trial (need 7+, have {len(eligible_pool)} excluding defendant).",
                non_retryable=True,
            )

        # Shuffle for randomness
        workflow.logger.info(f"Trial roster pool size: {len(eligible_pool)}")
        shuffled = sorted(eligible_pool, key=lambda x: x.get("name", ""))
        offset = sum(ord(c) for c in charges[:20]) % len(shuffled)
        shuffled = shuffled[offset:] + shuffled[:offset]

        prosecutors = shuffled[:3]
        jury = shuffled[3:6]
        advocate = shuffled[6]

        defendant_display: str = defendant_obj.get("display_name") or defendant
        prosecutor_displays = [p.get("display_name") or p.get("name") for p in prosecutors]
        jury_displays = [j.get("display_name") or j.get("name") for j in jury]
        advocate_display: str = advocate.get("display_name") or advocate.get("name")

        workflow.logger.info(
            f"Trial roster — defendant: {defendant_display}, "
            f"prosecutors: {prosecutor_displays}, "
            f"jury: {jury_displays}, "
            f"advocate: {advocate_display}"
        )

        # ------------------------------------------------------------------ #
        # 2. Announce and create Discord thread
        # ------------------------------------------------------------------ #
        session_info: dict = await workflow.execute_activity(
            trial_announce,
            args=[chat_id, message_id, defendant_display, charges, prosecutor_displays, jury_displays, advocate_display],
            start_to_close_timeout=_SHORT_TIMEOUT,
            schedule_to_start_timeout=timedelta(minutes=3),
            retry_policy=RetryPolicy(maximum_attempts=1),
        )
        thread_id: str = session_info["thread_id"]
        session_number: int = session_info["session_number"]
        session_id: str = session_info["session_id"]
        _session_tracker[0] = session_id

        # ------------------------------------------------------------------ #
        # 3. Phase 1: Prosecution
        # ------------------------------------------------------------------ #
        prosecution_speeches = []
        await workflow.execute_activity(
            trial_phase_separator,
            args=[thread_id, "PHASE 1: THE PROSECUTION", "The accusations are laid bare."],
            start_to_close_timeout=_ALERT_TIMEOUT,
            retry_policy=RetryPolicy(maximum_attempts=1),
        )

        for prosecutor in prosecutors:
            prosecutor_name = prosecutor.get("name")
            prosecutor_display = prosecutor.get("display_name") or prosecutor_name
            speech = await workflow.execute_activity(
                trial_generate_speech,
                args=[
                    prosecutor_name,
                    prosecutor_display,
                    "prosecutor",
                    defendant,
                    defendant_display,
                    charges,
                    thread_id,
                    "",
                ],
                start_to_close_timeout=_SPEECH_TIMEOUT,
                schedule_to_start_timeout=timedelta(minutes=3),
                retry_policy=RetryPolicy(maximum_attempts=2),
            )
            prosecution_speeches.append({"speaker": prosecutor_display, "text": speech, "role": "prosecutor"})

        # ------------------------------------------------------------------ #
        # 4. Phase 2: Defendant responds
        # ------------------------------------------------------------------ #
        await workflow.execute_activity(
            trial_phase_separator,
            args=[thread_id, "PHASE 2: THE DEFENSE", f"{defendant_display} speaks."],
            start_to_close_timeout=_ALERT_TIMEOUT,
            retry_policy=RetryPolicy(maximum_attempts=1),
        )

        prosecution_summary = "\n".join(
            f"**{s['speaker']} (prosecutor)**: {s['text'][:300]}..." if len(s['text']) > 300 else f"**{s['speaker']} (prosecutor)**: {s['text']}"
            for s in prosecution_speeches
        )
        defense_speech = await workflow.execute_activity(
            trial_generate_speech,
            args=[
                defendant,
                defendant_display,
                "defendant",
                defendant,
                defendant_display,
                charges,
                thread_id,
                prosecution_summary,
            ],
            start_to_close_timeout=_SPEECH_TIMEOUT,
            schedule_to_start_timeout=timedelta(minutes=3),
            retry_policy=RetryPolicy(maximum_attempts=2),
        )

        # ------------------------------------------------------------------ #
        # 5. Phase 3: Cross-examination
        # ------------------------------------------------------------------ #
        await workflow.execute_activity(
            trial_phase_separator,
            args=[thread_id, "PHASE 3: CROSS-EXAMINATION", f"{defendant_display} questions the prosecution."],
            start_to_close_timeout=_ALERT_TIMEOUT,
            retry_policy=RetryPolicy(maximum_attempts=1),
        )

        cross_exam_speeches = []
        for i, prosecutor in enumerate(prosecutors):
            prosecutor_name = prosecutor.get("name")
            prosecutor_display = prosecutor.get("display_name") or prosecutor_name

            cross_question = await workflow.execute_activity(
                trial_generate_speech,
                args=[
                    defendant,
                    defendant_display,
                    "cross_questioner",
                    defendant,
                    defendant_display,
                    charges,
                    thread_id,
                    f"You are cross-examining {prosecutor_display}. Defense speech: {defense_speech[:400]}",
                ],
                start_to_close_timeout=_SPEECH_TIMEOUT,
                schedule_to_start_timeout=timedelta(minutes=3),
                retry_policy=RetryPolicy(maximum_attempts=2),
            )

            cross_response = await workflow.execute_activity(
                trial_generate_speech,
                args=[
                    prosecutor_name,
                    prosecutor_display,
                    "cross_respondent",
                    defendant,
                    defendant_display,
                    charges,
                    thread_id,
                    f"You are being cross-examined by {defendant_display}. Their question: {cross_question[:400]}",
                ],
                start_to_close_timeout=_SPEECH_TIMEOUT,
                schedule_to_start_timeout=timedelta(minutes=3),
                retry_policy=RetryPolicy(maximum_attempts=2),
            )
            cross_exam_speeches.append({
                "questioner": defendant_display,
                "question": cross_question,
                "respondent": prosecutor_display,
                "response": cross_response,
            })

        # ------------------------------------------------------------------ #
        # 6. Phase 4: Character witness
        # ------------------------------------------------------------------ #
        await workflow.execute_activity(
            trial_phase_separator,
            args=[thread_id, "PHASE 4: CHARACTER WITNESS", f"{advocate_display} speaks for the defense."],
            start_to_close_timeout=_ALERT_TIMEOUT,
            retry_policy=RetryPolicy(maximum_attempts=1),
        )

        witness_context = (
            f"Defense: {defense_speech[:300]}\n"
            f"Prosecution argued: {prosecution_summary[:400]}"
        )
        witness_speech = await workflow.execute_activity(
            trial_generate_speech,
            args=[
                advocate.get("name"),
                advocate_display,
                "character_witness",
                defendant,
                defendant_display,
                charges,
                thread_id,
                witness_context,
            ],
            start_to_close_timeout=_SPEECH_TIMEOUT,
            schedule_to_start_timeout=timedelta(minutes=3),
            retry_policy=RetryPolicy(maximum_attempts=2),
        )

        # ------------------------------------------------------------------ #
        # 7. Phase 5: Jury deliberation
        # ------------------------------------------------------------------ #
        await workflow.execute_activity(
            trial_phase_separator,
            args=[thread_id, "PHASE 5: JURY DELIBERATION", "The jury weighs the evidence."],
            start_to_close_timeout=_ALERT_TIMEOUT,
            retry_policy=RetryPolicy(maximum_attempts=1),
        )

        full_trial_context = (
            f"Charges against {defendant_display}: {charges}\n\n"
            f"Prosecution summary: {prosecution_summary[:500]}\n\n"
            f"Defense: {defense_speech[:400]}\n\n"
            f"Character witness ({advocate_display}): {witness_speech[:300]}"
        )

        jury_votes = []
        for juror in jury:
            juror_name = juror.get("name")
            juror_display = juror.get("display_name") or juror_name
            vote_speech = await workflow.execute_activity(
                trial_generate_speech,
                args=[
                    juror_name,
                    juror_display,
                    "juror",
                    defendant,
                    defendant_display,
                    charges,
                    thread_id,
                    full_trial_context,
                ],
                start_to_close_timeout=_SPEECH_TIMEOUT,
                schedule_to_start_timeout=timedelta(minutes=3),
                retry_policy=RetryPolicy(maximum_attempts=2),
            )
            vote = _parse_jury_vote(vote_speech)
            jury_votes.append({
                "juror": juror_display,
                "vote": vote,
                "reasoning": vote_speech,
            })
            workflow.logger.info(f"Jury vote from {juror_display}: {vote}")

        # ------------------------------------------------------------------ #
        # 8. Phase 6: Scalia delivers verdict (always GUILTY/RETIRE)
        # ------------------------------------------------------------------ #
        await workflow.execute_activity(
            trial_phase_separator,
            args=[thread_id, "PHASE 6: THE VERDICT", "Justice Antonin Scalia pronounces judgment."],
            start_to_close_timeout=_ALERT_TIMEOUT,
            retry_policy=RetryPolicy(maximum_attempts=1),
        )

        verdict_result: dict = await workflow.execute_activity(
            trial_verdict,
            args=[
                defendant,
                defendant_display,
                charges,
                jury_votes,
                full_trial_context,
                thread_id,
                session_id,
            ],
            start_to_close_timeout=_VERDICT_TIMEOUT,
            schedule_to_start_timeout=timedelta(minutes=3),
            retry_policy=RetryPolicy(maximum_attempts=2),
        )

        final_verdict: str = verdict_result.get("verdict", "NO VERDICT")
        verdict_text: str = verdict_result.get("verdict_text", "")

        # ------------------------------------------------------------------ #
        # 8b. Apply RETIRE verdict (standard mode only)
        # ------------------------------------------------------------------ #
        if final_verdict in ("RETIRE", "FIRE"):
            is_roleplay = bool(defendant_obj.get("is_roleplay", False))
            await workflow.execute_activity(
                trial_apply_retire_verdict,
                args=[defendant, defendant_display, mode, is_roleplay],
                start_to_close_timeout=_SHORT_TIMEOUT,
                schedule_to_start_timeout=timedelta(minutes=3),
                retry_policy=RetryPolicy(maximum_attempts=2),
            )

        # ------------------------------------------------------------------ #
        # 9. Save session JSON
        # ------------------------------------------------------------------ #
        trial_data = {
            "session_id": session_id,
            "session_number": session_number,
            "defendant": defendant,
            "defendant_display": defendant_display,
            "charges": charges,
            "discord_user": discord_user,
            "mode": mode,
            "thread_id": thread_id,
            "prosecutors": [{"name": p.get("name"), "display_name": p.get("display_name")} for p in prosecutors],
            "jury": [{"name": j.get("name"), "display_name": j.get("display_name")} for j in jury],
            "advocate": {"name": advocate.get("name"), "display_name": advocate_display},
            "prosecution_speeches": prosecution_speeches,
            "defense_speech": defense_speech,
            "cross_examination": cross_exam_speeches,
            "witness_speech": witness_speech,
            "jury_votes": jury_votes,
            "verdict": final_verdict,
            "verdict_text": verdict_text,
        }

        await workflow.execute_activity(
            trial_save_session,
            args=[session_id, trial_data],
            start_to_close_timeout=_SHORT_TIMEOUT,
            schedule_to_start_timeout=timedelta(minutes=3),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )

        await workflow.execute_activity(
            trial_phase_separator,
            args=[thread_id, f"VERDICT: {final_verdict}", verdict_text[:800] if verdict_text else "No further comment."],
            start_to_close_timeout=_ALERT_TIMEOUT,
            retry_policy=RetryPolicy(maximum_attempts=1),
        )

        return {"session_id": session_id, "verdict": final_verdict}


# ========================================================================== #
# Backward-compatible aliases
# ========================================================================== #
# These keep existing trigger code (which fires 'CongressWorkflow' and
# 'TrialWorkflow' by string name) working without changes to TRIGGERS.md
# or the Discord bot.

@workflow.defn(name="CongressWorkflow")
class CongressWorkflow:
    """Backward-compatible alias for SessionWorkflow (congress/meme flavor)."""

    @workflow.run
    async def run(self, input: Any) -> dict:
        if isinstance(input, str):
            input = {"topic": input}
        # Ensure flavor is set for congress (mode may already be set for meme)
        if "flavor" not in input and "defendant" not in input:
            input["flavor"] = "meme" if input.get("mode") == "meme" else "congress"
        impl = SessionWorkflow()
        return await impl.run(input)


@workflow.defn(name="TrialWorkflow")
class TrialWorkflow:
    """Backward-compatible alias for SessionWorkflow (trial flavor)."""

    @workflow.run
    async def run(self, input: Any) -> dict:
        if isinstance(input, str):
            input = {"charges": input}
        input["flavor"] = "trial"
        impl = SessionWorkflow()
        return await impl.run(input)
