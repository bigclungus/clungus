"""
Temporal workflow: ModelScoutWorkflow

Daily cron (9am UTC) that discovers interesting open-source models from
HuggingFace trending and together.ai's catalog, proposes them in
#congress-hall via Discord reactions, and — if approved — kicks off
PersonaOnboardingWorkflow as a child workflow.

One model per day. Human-in-the-loop voting with 24h deadline.
"""

from re import search as re_search
from datetime import timedelta
from temporalio import workflow
from temporalio.common import RetryPolicy

# Activity imports — passed through for sandbox
with workflow.unsafe.imports_passed_through():
    from activities.common.discord_io import (
        discord_add_reaction,
        discord_create_thread,
        discord_poll_reactions,
        discord_post_message,
    )
    from activities.common.fs_io import git_commit, write_file
    from activities.common.http_io import fetch_json
    from activities.common.llm_io import call_llm
    from activities.scout_local import (
        build_persona_frontmatter,
        determine_vote,
        extract_model_card_details,
        filter_candidates,
        filter_non_text,
        generate_model_description,
        parse_persona_drafts,
        pick_winner,
    )
    from activities.scout_db import (
        db_get_known_ids,
        db_insert_model,
        db_update_status,
        STATUS_APPROVED,
        STATUS_PROPOSED,
        STATUS_REJECTED,
        STATUS_SKIPPED,
    )
    from activities.constants import AGENTS_DIR

# #congress-hall channel ID
CONGRESS_HALL_CHANNEL = "1383689218861039686"

# HuggingFace trending models API
HF_TRENDING_URL = "https://huggingface.co/api/trending"
# HuggingFace model detail API (append model_id)
HF_MODEL_API = "https://huggingface.co/api/models/"
# Together.ai model catalog
TOGETHER_MODELS_URL = "https://api.together.xyz/v1/models"

# Voting
VOTE_POLL_INTERVAL = timedelta(minutes=5)
VOTE_DEADLINE = timedelta(hours=24)
VOTE_THRESHOLD = 3  # 3 out of 5 voters

# URL-encoded emoji constants for Discord reaction API
EMOJI_THUMBS_UP = "%F0%9F%91%8D"    # 👍
EMOJI_THUMBS_DOWN = "%F0%9F%91%8E"  # 👎
EMOJI_ONE = "%31%EF%B8%8F%E2%83%A3"   # 1️⃣
EMOJI_TWO = "%32%EF%B8%8F%E2%83%A3"   # 2️⃣
EMOJI_THREE = "%33%EF%B8%8F%E2%83%A3" # 3️⃣
EMOJI_SKIP = "%E2%8F%AD%EF%B8%8F"     # ⏭️

# Retry policies
IO_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=5),
    maximum_interval=timedelta(minutes=2),
    maximum_attempts=3,
)

LOCAL_RETRY = RetryPolicy(maximum_attempts=1)


def _normalize_hf_models(data: object) -> list[dict]:
    """Normalize HuggingFace trending API response into candidate dicts."""
    models = []
    # HF trending returns {"recentlyTrending": [...]} or a list directly
    items = data if isinstance(data, list) else data.get("recentlyTrending", [])
    for item in items:
        repo_id = item.get("repoData", {}).get("id", "") or item.get("id", "")
        if not repo_id:
            continue
        name = repo_id.split("/")[-1] if "/" in repo_id else repo_id
        # Try to parse param count from the model name (e.g. "Voxtral-4B-TTS" -> 4B)
        params = _parse_params_from_name(name) or _parse_params_from_name(repo_id)
        models.append({
            "model_id": f"hf:{repo_id}",
            "source": "huggingface",
            "name": name,
            "params": params,
            "description": item.get("repoData", {}).get("description", "")
                or item.get("description", ""),
            "hf_repo_id": repo_id,  # preserve for API lookups and links
        })
    return models


def _normalize_together_models(data: object) -> list[dict]:
    """Normalize together.ai model catalog into candidate dicts."""
    models = []
    items = data if isinstance(data, list) else data.get("data", data.get("models", []))
    for item in items:
        model_id = item.get("id", "")
        if not model_id:
            continue
        # together.ai includes context_length and pricing; try to extract param hints from name
        name = item.get("display_name", "") or model_id.split("/")[-1]
        description = item.get("description", "")
        # Try to parse param count from the model name (e.g. "Llama-3-70B" -> 70B)
        params = _parse_params_from_name(name) or _parse_params_from_name(model_id)
        models.append({
            "model_id": f"together:{model_id}",
            "source": "together",
            "name": name,
            "params": params,
            "description": description,
            "type": item.get("type", ""),  # used for text-only filtering
            "context_length": item.get("context_length"),
            "together_model_id": model_id,  # preserve for API calls
        })
    return models


def _parse_params_from_name(name: str) -> int | None:
    """Try to extract parameter count from a model name like 'Llama-3-70B'."""
    match = re_search(r"(\d+(?:\.\d+)?)\s*[Bb]", name)
    if match:
        val = float(match.group(1))
        return int(val * 1_000_000_000)
    return None


def _model_page_url(model: dict) -> str:
    """Return a URL to the model's page based on source."""
    source = model.get("source", "")
    if source == "huggingface":
        repo_id = model.get("hf_repo_id", "")
        if repo_id:
            return f"https://huggingface.co/{repo_id}"
    elif source == "together":
        together_id = model.get("together_model_id", "")
        if together_id:
            return f"https://api.together.xyz/models/{together_id}"
    return ""


def _format_model_card(model: dict) -> tuple[str, list[dict]]:
    """Build a Discord embed for a model proposal. Returns (content, embeds)."""
    name = model.get("name", "Unknown")
    model_id = model.get("model_id", "")
    source = model.get("source", "unknown")
    params = model.get("params")
    # unique_description captures what makes the model special; fall back to description
    unique_description = model.get("unique_description") or model.get("description") or "No description available."
    pipeline_tag = model.get("pipeline_tag", "")
    downloads = model.get("downloads")
    likes = model.get("likes")
    tags = model.get("tags", [])
    page_url = _model_page_url(model)

    param_str = f"{params / 1_000_000_000:.1f}B" if params else "Unknown"

    # Build embed fields
    fields = [
        {"name": "Source", "value": source.title(), "inline": True},
        {"name": "Parameters", "value": param_str, "inline": True},
    ]

    if pipeline_tag:
        fields.append({"name": "Task", "value": pipeline_tag, "inline": True})

    if downloads is not None:
        dl_str = f"{downloads:,}" if downloads < 1_000_000 else f"{downloads / 1_000_000:.1f}M"
        fields.append({"name": "Downloads", "value": dl_str, "inline": True})

    if likes is not None:
        fields.append({"name": "Likes", "value": f"{likes:,}", "inline": True})

    fields.append({"name": "Model ID", "value": f"`{model_id}`", "inline": False})

    if tags:
        # Show up to 8 tags
        tag_str = ", ".join(tags[:8])
        if len(tags) > 8:
            tag_str += f" (+{len(tags) - 8} more)"
        fields.append({"name": "Tags", "value": tag_str, "inline": False})

    if page_url:
        fields.append({"name": "Link", "value": f"[View model page]({page_url})", "inline": False})

    embed: dict = {
        "title": f"Model Scout: {name}",
        "description": unique_description[:800],
        "color": 0x5865F2,  # Discord blurple (new)
        "fields": fields,
        "footer": {"text": "React 👍 to approve, 👎 to reject, or ⏭️ to skip and get a new model (3/5 majority, 24h deadline)"},
    }

    if page_url:
        embed["url"] = page_url

    content = f"New model candidate for congress: **{name}** ({param_str})"
    return content, [embed]


@workflow.defn
class ModelScoutWorkflow:
    """Daily model scouting workflow. Discovers, proposes, and votes on models."""

    def __init__(self) -> None:
        self._skip_requested: bool = False
        self._refresh_requested: bool = False

    @workflow.signal
    async def skip_vote(self) -> None:
        """Signal to skip the current model candidate and move to the next one."""
        self._skip_requested = True

    @workflow.signal
    async def refresh(self) -> None:
        """Signal to terminate this workflow early so the cron can start fresh."""
        self._refresh_requested = True

    @workflow.run
    async def run(self) -> dict:
        """Execute the full scout cycle. Returns result summary dict."""
        workflow.logger.info("ModelScoutWorkflow started")

        # ---- Step 1: Fetch model catalogs ----
        hf_data: object = {}
        together_data: object = {}

        # Fetch both sources; tolerate individual failures
        try:
            hf_data = await workflow.execute_activity(
                fetch_json,
                args=[HF_TRENDING_URL, None],
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=IO_RETRY,
            )
        except Exception as exc:
            workflow.logger.warning("HuggingFace fetch failed: %s", exc)

        try:
            together_data = await workflow.execute_activity(
                fetch_json,
                args=[TOGETHER_MODELS_URL, None],
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=IO_RETRY,
            )
        except Exception as exc:
            workflow.logger.warning("together.ai fetch failed: %s", exc)

        # ---- Step 2: Normalize and merge ----
        all_models = _normalize_hf_models(hf_data) + _normalize_together_models(together_data)

        if not all_models:
            workflow.logger.info("No models fetched from any source")
            return {"status": "no_sources", "model": None}

        # Track models we've already tried this run (to avoid re-proposing skipped ones)
        skipped_ids: set[str] = set()

        # ---- Candidate loop: propose, vote, skip if signalled, repeat ----
        while True:
            if self._refresh_requested:
                workflow.logger.info("Refresh signal received, completing early")
                return {"status": "refreshed", "model": None}

            # ---- Step 3: Fetch known IDs and filter ----
            known_ids = await workflow.execute_activity(
                db_get_known_ids,
                start_to_close_timeout=timedelta(seconds=10),
                retry_policy=LOCAL_RETRY,
            )

            # Combine DB-known IDs with ones skipped this run
            exclude_ids = list(set(known_ids) | skipped_ids)

            candidate = await workflow.execute_activity(
                filter_candidates,
                args=[all_models, exclude_ids],
                start_to_close_timeout=timedelta(seconds=10),
                retry_policy=LOCAL_RETRY,
            )

            if candidate is None:
                workflow.logger.info("No new candidates after filtering")
                return {"status": "no_candidates", "model": None}

            workflow.logger.info("Selected candidate: %s", candidate.get("name"))

            # ---- Step 3b: Fetch detailed model info for HuggingFace models ----
            if candidate.get("source") == "huggingface" and candidate.get("hf_repo_id"):
                try:
                    detail = await workflow.execute_activity(
                        fetch_json,
                        args=[f"{HF_MODEL_API}{candidate['hf_repo_id']}", None],
                        start_to_close_timeout=timedelta(seconds=30),
                        retry_policy=IO_RETRY,
                    )
                    # Enrich candidate with detail fields
                    if detail.get("pipeline_tag"):
                        candidate["pipeline_tag"] = detail["pipeline_tag"]
                    if detail.get("downloads") is not None:
                        candidate["downloads"] = detail["downloads"]
                    if detail.get("likes") is not None:
                        candidate["likes"] = detail["likes"]
                    if detail.get("tags"):
                        candidate["tags"] = detail["tags"]
                    # If we still don't have params, try safetensors metadata
                    if candidate.get("params") is None:
                        safetensors = detail.get("safetensors", {})
                        total_params = safetensors.get("total", 0)
                        if total_params:
                            candidate["params"] = total_params
                    # Re-check text-only filter now that we have pipeline_tag from detail.
                    # The initial filter_candidates pass runs before detail is fetched,
                    # so ASR/audio models that lack pipeline_tag in trending data can slip through.
                    is_text = await workflow.execute_activity(
                        filter_non_text,
                        args=[candidate],
                        start_to_close_timeout=timedelta(seconds=5),
                        retry_policy=LOCAL_RETRY,
                    )
                    if not is_text:
                        workflow.logger.info(
                            "Post-detail filter rejected non-text model: %s (pipeline_tag=%s)",
                            candidate.get("model_id"), candidate.get("pipeline_tag"),
                        )
                        skipped_ids.add(candidate["model_id"])
                        continue

                    # Extract the most useful description available:
                    # cardData has the structured model card front matter; modelId description
                    # field is often a short summary from the author.
                    card_data = detail.get("cardData") or {}
                    raw_description = (
                        detail.get("description")
                        or card_data.get("description")
                        or candidate.get("description")
                        or ""
                    )
                    candidate["description"] = raw_description
                    # unique_description: prefer cardData fields that capture what makes
                    # this model special — use the structured summary if available,
                    # otherwise fall back to the first meaningful chunk of the description.
                    unique_desc = (
                        card_data.get("model_description")
                        or card_data.get("summary")
                        or card_data.get("abstract")
                        or raw_description
                    )
                    if unique_desc:
                        # Trim to 600 chars — enough context, not a wall of text
                        candidate["unique_description"] = unique_desc[:600]

                    # Extract structured architecture/benchmark details from the full card
                    card_details = extract_model_card_details(detail)
                    candidate["card_details"] = card_details
                except Exception as exc:
                    workflow.logger.warning("HF model detail fetch failed for %s: %s",
                                           candidate.get("hf_repo_id"), exc)

            # For together.ai models: unique_description comes directly from the
            # description field (together.ai descriptions are usually concise and
            # meaningful). No additional detail fetch is done for together models.
            if candidate.get("source") == "together" and not candidate.get("unique_description"):
                desc = candidate.get("description") or ""
                if desc:
                    candidate["unique_description"] = desc[:600]

            # ---- Step 3c: Generate Grok description ----
            # Ask Grok to synthesize what makes this model unique based on its metadata.
            # This replaces or enriches whatever unique_description we have so far.
            # card_details contains architecture/benchmark data extracted from the HF card.
            card_details = candidate.get("card_details") or {}
            try:
                grok_description = await workflow.execute_activity(
                    generate_model_description,
                    args=[
                        candidate["name"],
                        candidate["model_id"],
                        {
                            "params": candidate.get("params"),
                            "source": candidate.get("source"),
                            "description": candidate.get("description"),
                            "pipeline_tag": candidate.get("pipeline_tag"),
                            "tags": candidate.get("tags"),
                            "context_length": candidate.get("context_length"),
                            # Structured card details (architecture, benchmarks, etc.)
                            "architecture": card_details.get("architecture"),
                            "base_model": card_details.get("base_model"),
                            "training_tags": card_details.get("training_tags"),
                            "datasets": card_details.get("datasets"),
                            "languages": card_details.get("languages"),
                            "license": card_details.get("license"),
                            "benchmarks": card_details.get("benchmarks"),
                            "benchmark_mentions": card_details.get("benchmark_mentions"),
                        },
                    ],
                    start_to_close_timeout=timedelta(seconds=45),
                    retry_policy=IO_RETRY,
                )
                candidate["unique_description"] = grok_description
                workflow.logger.info(
                    "Grok description for %s: %s", candidate["name"], grok_description[:100]
                )
            except Exception as exc:
                # Non-fatal: fall back to whatever description we already have
                workflow.logger.warning(
                    "generate_model_description failed for %s: %s — keeping existing description",
                    candidate["name"],
                    exc,
                )

            # ---- Step 4: Record in database as proposed ----
            now_iso = workflow.now().isoformat()
            await workflow.execute_activity(
                db_insert_model,
                args=[
                    candidate["model_id"],
                    candidate["source"],
                    candidate["name"],
                    candidate.get("params"),
                    candidate.get("description"),
                    now_iso,
                    STATUS_PROPOSED,
                    candidate.get("unique_description"),
                ],
                start_to_close_timeout=timedelta(seconds=10),
                retry_policy=IO_RETRY,
            )

            # ---- Step 5: Post proposal to #congress-hall ----
            content, embeds = _format_model_card(candidate)
            message_id = await workflow.execute_activity(
                discord_post_message,
                args=[CONGRESS_HALL_CHANNEL, content, embeds],
                start_to_close_timeout=timedelta(seconds=15),
                retry_policy=IO_RETRY,
            )

            # Add thumbs up/down reactions
            for emoji in [EMOJI_THUMBS_UP, EMOJI_THUMBS_DOWN, EMOJI_SKIP]:
                await workflow.execute_activity(
                    discord_add_reaction,
                    args=[CONGRESS_HALL_CHANNEL, message_id, emoji],
                    start_to_close_timeout=timedelta(seconds=10),
                    retry_policy=IO_RETRY,
                )

            # ---- Step 6: Vote loop ----
            self._skip_requested = False
            elapsed = timedelta()
            vote_result = {"decided": False, "approved": None, "thumbs_up": 0, "thumbs_down": 0}

            while elapsed < VOTE_DEADLINE:
                if self._refresh_requested or self._skip_requested:
                    break

                # Use wait_condition so skip/refresh signals wake us immediately
                await workflow.wait_condition(
                    lambda: self._skip_requested or self._refresh_requested,
                    timeout=VOTE_POLL_INTERVAL,
                )

                # If woken by signal, break immediately — don't poll reactions
                if self._skip_requested or self._refresh_requested:
                    break

                elapsed += VOTE_POLL_INTERVAL

                reactions = await workflow.execute_activity(
                    discord_poll_reactions,
                    args=[CONGRESS_HALL_CHANNEL, message_id],
                    start_to_close_timeout=timedelta(seconds=15),
                    retry_policy=IO_RETRY,
                )

                # Check for ⏭️ skip reactions (3/5 threshold)
                # discord_poll_reactions returns [user_id_str, ...], not dicts
                skip_emoji_decoded = "\u23ed\ufe0f"  # ⏭️
                skip_voters = reactions.get(skip_emoji_decoded, [])
                if len(skip_voters) >= VOTE_THRESHOLD:
                    self._skip_requested = True
                    break

                vote_result = await workflow.execute_activity(
                    determine_vote,
                    args=[reactions, VOTE_THRESHOLD],
                    start_to_close_timeout=timedelta(seconds=5),
                    retry_policy=LOCAL_RETRY,
                )

                if vote_result["decided"]:
                    break

            # ---- Handle refresh signal ----
            if self._refresh_requested:
                workflow.logger.info("Refresh signal received during vote, completing early")
                return {"status": "refreshed", "model": candidate["name"]}

            # ---- Handle skip signal ----
            if self._skip_requested:
                workflow.logger.info("Skip signal received for %s", candidate.get("name"))
                skipped_ids.add(candidate["model_id"])
                await workflow.execute_activity(
                    db_update_status,
                    args=[candidate["model_id"], STATUS_SKIPPED],
                    start_to_close_timeout=timedelta(seconds=10),
                    retry_policy=IO_RETRY,
                )
                await workflow.execute_activity(
                    discord_post_message,
                    args=[
                        CONGRESS_HALL_CHANNEL,
                        f"Model **{candidate['name']}** was skipped. Finding next candidate...",
                    ],
                    start_to_close_timeout=timedelta(seconds=15),
                    retry_policy=IO_RETRY,
                )
                # Loop back to propose the next candidate
                continue

            # ---- Step 7: Handle vote result ----
            approved = vote_result.get("approved", False)
            if not approved:
                await workflow.execute_activity(
                    db_update_status,
                    args=[candidate["model_id"], STATUS_REJECTED],
                    start_to_close_timeout=timedelta(seconds=10),
                    retry_policy=IO_RETRY,
                )
                await workflow.execute_activity(
                    discord_post_message,
                    args=[
                        CONGRESS_HALL_CHANNEL,
                        f"Model **{candidate['name']}** was rejected "
                        f"({vote_result['thumbs_up']} up / {vote_result['thumbs_down']} down). "
                        f"Moving on tomorrow.",
                    ],
                    start_to_close_timeout=timedelta(seconds=15),
                    retry_policy=IO_RETRY,
                )
                return {"status": "rejected", "model": candidate["name"], "votes": vote_result}

            # Approved — update DB and start persona onboarding
            await workflow.execute_activity(
                db_update_status,
                args=[candidate["model_id"], STATUS_APPROVED],
                start_to_close_timeout=timedelta(seconds=10),
                retry_policy=IO_RETRY,
            )

            await workflow.execute_activity(
                discord_post_message,
                args=[
                    CONGRESS_HALL_CHANNEL,
                    f"Model **{candidate['name']}** approved! "
                    f"({vote_result['thumbs_up']} up / {vote_result['thumbs_down']} down). "
                    f"Starting persona onboarding...",
                ],
                start_to_close_timeout=timedelta(seconds=15),
                retry_policy=IO_RETRY,
            )

            # ---- Step 8: Start PersonaOnboardingWorkflow as child ----
            onboarding_result = await workflow.execute_child_workflow(
                PersonaOnboardingWorkflow.run,
                args=[{
                    "model_id": candidate["model_id"],
                    "model_name": candidate["name"],
                    "source": candidate["source"],
                    "together_model_id": candidate.get("together_model_id", ""),
                    "description": candidate.get("description", ""),
                    "unique_description": candidate.get("unique_description", ""),
                    "params": candidate.get("params"),
                    "proposal_message_id": message_id,
                }],
                id=f"persona-onboard-{candidate['model_id'].replace(':', '-').replace('/', '-')[:50]}",
                task_queue="scout-queue",
            )

            return {
                "status": "approved_and_onboarded",
                "model": candidate["name"],
                "votes": vote_result,
                "onboarding": onboarding_result,
            }


# ---------------------------------------------------------------------------
# PersonaOnboardingWorkflow — child workflow
# ---------------------------------------------------------------------------

PERSONA_GEN_SYSTEM = """You are a creative AI character designer for a parliament debate system called "Congress."
Each persona in Congress has a unique voice, perspective, and personality that comes from the model they run on.

Given a model's name and description, generate exactly 3 persona candidates.
Each persona should have a distinct personality, speaking style, and area of expertise
that fits the model's character or training focus.

Format your output EXACTLY like this (repeat for all 3):

--- PERSONA 1 ---
Name: <display name, creative and memorable>
Slug: <lowercase-hyphenated, max 20 chars>
Role: <one-line role description>
Description: <2-3 sentences about who this persona is>
System Prompt: <the system prompt that defines this persona's voice and behavior, 3-5 sentences>
Avatar Prompt: <a prompt for generating this persona's avatar image, 1-2 sentences>

--- PERSONA 2 ---
...

--- PERSONA 3 ---
..."""

PERSONA_VOTE_DEADLINE = timedelta(hours=12)
PERSONA_VOTE_POLL_INTERVAL = timedelta(minutes=5)

# Frontier model for persona generation (used via together.ai)
FRONTIER_MODEL = "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo"


@workflow.defn
class PersonaOnboardingWorkflow:
    """Generate persona candidates, vote on them, and write the winner to agents/."""

    def __init__(self) -> None:
        self._skip_requested: bool = False
        self._refresh_requested: bool = False

    @workflow.signal
    async def skip_vote(self) -> None:
        """Signal to skip the current persona vote and pick the top candidate by count."""
        self._skip_requested = True

    @workflow.signal
    async def refresh(self) -> None:
        """Signal to terminate this workflow early."""
        self._refresh_requested = True

    @workflow.run
    async def run(self, model_info: dict) -> dict:
        """Execute persona onboarding for an approved model.

        Args:
            model_info: dict with model_id, model_name, source, together_model_id,
                       description, params, proposal_message_id
        """
        model_name = model_info["model_name"]
        model_id = model_info["model_id"]
        description = model_info.get("description", "")
        unique_description = model_info.get("unique_description", "")
        proposal_msg_id = model_info["proposal_message_id"]

        workflow.logger.info("PersonaOnboardingWorkflow started for %s", model_name)

        # ---- Step 1: Generate 3 persona candidates ----
        params_str = f"{model_info.get('params', 0) / 1e9:.1f}B" if model_info.get("params") else "unknown size"
        # Use unique_description (what makes the model special) if available; fall back to description
        model_character = unique_description or description
        gen_prompt = (
            f"Model: {model_name}\n"
            f"ID: {model_id}\n"
            f"Parameters: {params_str}\n"
            f"What makes this model unique: {model_character}\n\n"
            f"Generate 3 persona candidates for this model."
        )

        llm_output = await workflow.execute_activity(
            call_llm,
            args=[FRONTIER_MODEL, PERSONA_GEN_SYSTEM, gen_prompt],
            start_to_close_timeout=timedelta(seconds=90),
            retry_policy=IO_RETRY,
        )

        candidates = await workflow.execute_activity(
            parse_persona_drafts,
            args=[llm_output],
            start_to_close_timeout=timedelta(seconds=5),
            retry_policy=LOCAL_RETRY,
        )

        if not candidates:
            workflow.logger.error("LLM produced no parseable persona candidates")
            return {"status": "failed", "reason": "no_candidates_parsed", "model": model_name}

        # ---- Step 2: Create thread and post candidates ----
        thread_id = await workflow.execute_activity(
            discord_create_thread,
            args=[CONGRESS_HALL_CHANNEL, proposal_msg_id, f"Persona vote: {model_name}"],
            start_to_close_timeout=timedelta(seconds=15),
            retry_policy=IO_RETRY,
        )

        # Build candidate cards
        number_emojis = ["1\ufe0f\u20e3", "2\ufe0f\u20e3", "3\ufe0f\u20e3"]
        candidate_text_parts = []
        for i, c in enumerate(candidates):
            num = i + 1
            candidate_text_parts.append(
                f"**{num}. {c.get('name', 'Unknown')}** — {c.get('role', 'No role')}\n"
                f"{c.get('description', 'No description.')}\n"
            )

        vote_content = (
            f"Vote for a persona for **{model_name}**:\n\n"
            + "\n".join(candidate_text_parts)
            + "\nReact with 1, 2, or 3 to vote (12h deadline)"
        )

        vote_msg_id = await workflow.execute_activity(
            discord_post_message,
            args=[thread_id, vote_content],
            start_to_close_timeout=timedelta(seconds=15),
            retry_policy=IO_RETRY,
        )

        # Add number reactions
        for emoji_encoded in [EMOJI_ONE, EMOJI_TWO, EMOJI_THREE]:
            await workflow.execute_activity(
                discord_add_reaction,
                args=[thread_id, vote_msg_id, emoji_encoded],
                start_to_close_timeout=timedelta(seconds=10),
                retry_policy=IO_RETRY,
            )

        # ---- Step 3: Vote loop ----
        self._skip_requested = False
        elapsed = timedelta()
        final_reactions = {}

        while elapsed < PERSONA_VOTE_DEADLINE:
            # Use wait_condition so skip/refresh signals wake us immediately
            await workflow.wait_condition(
                lambda: self._skip_requested or self._refresh_requested,
                timeout=PERSONA_VOTE_POLL_INTERVAL,
            )

            if self._refresh_requested:
                workflow.logger.info("Refresh signal received, completing early")
                return {"status": "refreshed", "model": model_name}
            if self._skip_requested:
                workflow.logger.info("Skip signal received, ending vote early for %s", model_name)
                break

            elapsed += PERSONA_VOTE_POLL_INTERVAL

            final_reactions = await workflow.execute_activity(
                discord_poll_reactions,
                args=[thread_id, vote_msg_id],
                start_to_close_timeout=timedelta(seconds=15),
                retry_policy=IO_RETRY,
            )

            # Check if any candidate has clear lead (3+ votes)
            for emoji in number_emojis[:len(candidates)]:
                voters = final_reactions.get(emoji, [])
                if len(voters) >= VOTE_THRESHOLD:
                    elapsed = PERSONA_VOTE_DEADLINE  # break outer loop
                    break

        # ---- Step 4: Pick winner ----
        winner = await workflow.execute_activity(
            pick_winner,
            args=[final_reactions, candidates],
            start_to_close_timeout=timedelta(seconds=5),
            retry_policy=LOCAL_RETRY,
        )

        if winner is None:
            return {"status": "failed", "reason": "no_winner", "model": model_name}

        # ---- Step 5: Build and write persona .md ----
        avatar_url = None
        together_model_id = model_info.get("together_model_id", model_id)
        persona_md = await workflow.execute_activity(
            build_persona_frontmatter,
            args=[winner, together_model_id, model_name, avatar_url],
            start_to_close_timeout=timedelta(seconds=5),
            retry_policy=LOCAL_RETRY,
        )

        slug = winner.get("slug", "unknown-persona")
        file_path = f"{AGENTS_DIR}/{slug}.md"

        await workflow.execute_activity(
            write_file,
            args=[file_path, persona_md],
            start_to_close_timeout=timedelta(seconds=10),
            retry_policy=IO_RETRY,
        )

        # Git commit
        await workflow.execute_activity(
            git_commit,
            args=[[file_path], f"feat: add scouted persona {winner.get('name', slug)} ({model_name})"],
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=IO_RETRY,
        )

        # ---- Step 6: Announce ----
        announce_text = (
            f"New persona onboarded: **{winner.get('name', slug)}** "
            f"({winner.get('role', 'Congress Debater')})\n"
            f"Model: {model_name}\n"
            f"They're now eligible for congress debates."
        )
        await workflow.execute_activity(
            discord_post_message,
            args=[CONGRESS_HALL_CHANNEL, announce_text],
            start_to_close_timeout=timedelta(seconds=15),
            retry_policy=IO_RETRY,
        )

        return {
            "status": "onboarded",
            "model": model_name,
            "persona_name": winner.get("name"),
            "persona_slug": slug,
            "file_path": file_path,
        }
