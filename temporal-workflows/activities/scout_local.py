"""
Local (pure logic) activities for the Model Scout workflow.

These activities perform no I/O — they filter, parse, and transform data.
"""

import logging
import re
from datetime import datetime, timezone

from temporalio import activity

logger = logging.getLogger(__name__)

# Models below this param count are skipped (too small to be interesting)
MIN_PARAMS = 1_000_000_000  # 1B
# Models above this are skipped (too expensive for together.ai budget)
MAX_PARAMS = 180_000_000_000  # 180B

# Generic frontier models to skip — we want niche/interesting ones
SKIP_PATTERNS = [
    r"gpt-4",
    r"gpt-3\.5",
    r"claude",
    r"gemini",
    r"palm",
]

_SKIP_RE = re.compile("|".join(SKIP_PATTERNS), re.IGNORECASE)

# HuggingFace pipeline tags that indicate non-text-to-text models
_MULTIMODAL_PIPELINE_TAGS = {
    "text-to-image",
    "image-to-text",
    "image-to-image",
    "image-to-video",
    "text-to-video",
    "text-to-audio",
    "text-to-speech",
    "automatic-speech-recognition",
    "audio-to-audio",
    "audio-classification",
    "audio-text-to-text",
    "visual-question-answering",
    "image-classification",
    "image-segmentation",
    "object-detection",
    "video-classification",
    "depth-estimation",
    "image-feature-extraction",
    "mask-generation",
    "zero-shot-image-classification",
    "zero-shot-object-detection",
    "unconditional-image-generation",
}

# Name/ID patterns that indicate multimodal or non-text models
_MULTIMODAL_NAME_PATTERNS = re.compile(
    r"\b(vision|visual|vl\b|vlm|tts|stt|asr|image|img|audio|speech|voice|"
    r"diffusion|sdxl|stable[-_]diffusion|whisper|voxtral|musicgen|audiogen|"
    r"dalle|dall-e|flux|midjourney|clip|owl|blip|llava|bakllava|idefics|"
    r"cogvlm|internvl|qwen[-_]?vl|pixtral|video[-_]?llm|videollm)\b",
    re.IGNORECASE,
)

# together.ai model type values that indicate non-text models
_MULTIMODAL_TOGETHER_TYPES = {
    "image",
    "image_generation",
    "image generation",
    "audio",
    "speech",
    "embedding",
    "rerank",
    "moderation",
}


def _is_text_only(model: dict) -> bool:
    """Return True if this model appears to be a text-to-text (language) model.

    Checks pipeline_tag, tags list, model type field, and name/ID patterns.
    When in doubt, allows the model through — false positives are better than
    discarding real text models.
    """
    # Pipeline tag is the most reliable signal for HuggingFace models
    pipeline_tag = (model.get("pipeline_tag") or "").lower().strip()
    if pipeline_tag:
        if pipeline_tag in _MULTIMODAL_PIPELINE_TAGS:
            return False
        # Explicitly text: allow through immediately
        if pipeline_tag in {"text-generation", "text2text-generation", "conversational",
                             "question-answering", "summarization", "translation",
                             "fill-mask", "token-classification", "text-classification",
                             "feature-extraction", "sentence-similarity"}:
            return True

    # together.ai has a "type" field
    model_type = (model.get("type") or "").lower().strip()
    if model_type and model_type in _MULTIMODAL_TOGETHER_TYPES:
        return False

    # Check HuggingFace tags list for multimodal indicators
    tags = [t.lower() for t in (model.get("tags") or [])]
    for tag in tags:
        if tag in _MULTIMODAL_PIPELINE_TAGS:
            return False
        if tag in {"multimodal", "vision", "image-text-to-text"}:
            return False

    # Name/ID pattern matching as a last resort
    name = model.get("name", "")
    model_id = model.get("model_id", "")
    if _MULTIMODAL_NAME_PATTERNS.search(name) or _MULTIMODAL_NAME_PATTERNS.search(model_id):
        return False

    return True


@activity.defn
async def filter_candidates(raw_models: list[dict], known_ids: list[str] | set[str]) -> dict | None:
    """Filter raw model list and pick the single best unseen candidate.

    Each model dict should have at minimum:
      - model_id: str (unique identifier)
      - name: str
      - source: str ("huggingface" or "together")
      - params: int | None (parameter count)
      - description: str | None

    Args:
        raw_models: list of model dicts from API sources
        known_ids: set of model_id values already in the database

    Returns the best candidate dict, or None if nothing qualifies.
    """
    candidates = []
    for model in raw_models:
        model_id = model.get("model_id", "")
        name = model.get("name", "")
        params = model.get("params")

        # Skip if already scouted
        if model_id in known_ids:
            continue

        # Skip generic frontier models
        if _SKIP_RE.search(name) or _SKIP_RE.search(model_id):
            continue

        # Skip non-text-to-text models (vision, image gen, audio, TTS, etc.)
        if not _is_text_only(model):
            logger.debug("Skipping non-text model: %s (pipeline_tag=%s, type=%s)",
                         model_id, model.get("pipeline_tag"), model.get("type"))
            continue

        # Filter by param count (if available)
        if params is not None:
            if params < MIN_PARAMS or params > MAX_PARAMS:
                continue

        candidates.append(model)

    if not candidates:
        return None

    # Prefer models with known param counts; among those, prefer mid-range (7B-70B)
    def score(m: dict) -> float:
        p = m.get("params")
        if p is None:
            return 0.0
        # Sweet spot: 7B-70B gets highest score
        if 7_000_000_000 <= p <= 70_000_000_000:
            return 2.0
        return 1.0

    candidates.sort(key=score, reverse=True)
    return candidates[0]


@activity.defn
async def determine_vote(reactions: dict, threshold: int = 3) -> dict:
    """Count thumbs up/down and check if majority is reached.

    Args:
        reactions: {emoji_name: [user_id, ...]} from discord_poll_reactions
        threshold: votes needed for majority (default 3 out of 5 voters)

    Returns:
        {
            "thumbs_up": int,
            "thumbs_down": int,
            "decided": bool,
            "approved": bool | None,  # None if not yet decided
        }
    """
    up_voters = reactions.get("\U0001f44d", [])
    down_voters = reactions.get("\U0001f44e", [])

    thumbs_up = len(up_voters)
    thumbs_down = len(down_voters)

    decided = False
    approved = None

    if thumbs_up >= threshold:
        decided = True
        approved = True
    elif thumbs_down >= threshold:
        decided = True
        approved = False

    return {
        "thumbs_up": thumbs_up,
        "thumbs_down": thumbs_down,
        "decided": decided,
        "approved": approved,
    }


@activity.defn
async def parse_persona_drafts(llm_output: str) -> list[dict]:
    """Extract 3 persona candidates from LLM output.

    Expects the LLM to produce output with markers like:
    --- PERSONA 1 ---
    Name: ...
    Slug: ...
    Role: ...
    Description: ...
    System Prompt: ...
    Avatar Prompt: ...

    Returns list of dicts with keys: name, slug, role, description, system_prompt, avatar_prompt
    """
    personas = []
    # Split on persona markers
    sections = re.split(r"---\s*PERSONA\s*\d+\s*---", llm_output, flags=re.IGNORECASE)

    for section in sections:
        section = section.strip()
        if not section:
            continue

        persona: dict[str, str] = {}
        # Extract fields
        for field in ["Name", "Slug", "Role", "Description", "System Prompt", "Avatar Prompt"]:
            pattern = rf"(?:^|\n)\s*{field}\s*:\s*(.+?)(?=\n\s*(?:Name|Slug|Role|Description|System Prompt|Avatar Prompt)\s*:|$)"
            match = re.search(pattern, section, re.DOTALL | re.IGNORECASE)
            if match:
                value = match.group(1).strip()
                key = field.lower().replace(" ", "_")
                persona[key] = value

        if persona.get("name") and persona.get("slug"):
            personas.append(persona)

    return personas[:3]


@activity.defn
async def pick_winner(reactions: dict, candidates: list[dict]) -> dict | None:
    """Select the highest-voted persona candidate from numbered reactions.

    Reactions should contain 1, 2, 3 keycap emojis mapped to user lists.
    Returns the winning candidate dict, or the first candidate if no votes.
    """
    number_emojis = ["1\ufe0f\u20e3", "2\ufe0f\u20e3", "3\ufe0f\u20e3"]
    if not candidates:
        return None

    vote_counts = []
    for i, emoji in enumerate(number_emojis[:len(candidates)]):
        voters = reactions.get(emoji, [])
        vote_counts.append(len(voters))

    # Pick highest; tie goes to first
    max_votes = max(vote_counts) if vote_counts else 0
    if max_votes == 0:
        # No votes — default to first candidate
        return candidates[0]

    winner_idx = vote_counts.index(max_votes)
    return candidates[winner_idx]


@activity.defn
async def build_persona_frontmatter(
    winner: dict, model_id: str, model_name: str, avatar_url: str | None = None
) -> str:
    """Assemble the full .md content for agents/ directory.

    Args:
        winner: persona dict with name, slug, role, description, system_prompt
        model_id: together.ai model identifier
        model_name: human-readable model name
        avatar_url: URL or path to avatar image (None if not generated)

    Returns:
        Full markdown content ready to write to agents/<slug>.md
    """
    slug = winner.get("slug", "unknown")
    name = winner.get("name", "Unknown Persona")
    role = winner.get("role", "Congress Debater")
    description = winner.get("description", "")
    system_prompt = winner.get("system_prompt", "")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    lines = [
        "---",
        f"display_name: \"{name}\"",
        f"role: \"{role}\"",
        f"model: \"together/{model_id}\"",
        "status: eligible",
        "evolves: true",
        f"scouted: \"{today}\"",
        f"scouted_model_name: \"{model_name}\"",
    ]
    if avatar_url:
        lines.append(f"avatar: \"{avatar_url}\"")
    lines.append("---")
    lines.append("")
    lines.append(f"# {name}")
    lines.append("")
    if description:
        lines.append(description)
        lines.append("")
    if system_prompt:
        lines.append("## System Prompt")
        lines.append("")
        lines.append(system_prompt)
        lines.append("")

    return "\n".join(lines)
