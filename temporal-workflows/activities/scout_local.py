"""
Local (pure logic) activities for the Model Scout workflow.

Most activities perform no I/O — they filter, parse, and transform data.
generate_model_description is the exception: it calls the xAI API (Grok)
to synthesize a concise description of what makes a model unique.
"""

import logging
import re
from datetime import datetime, timezone

import aiohttp
from temporalio import activity

from .utils import get_xai_key

logger = logging.getLogger(__name__)

# Generic frontier models to skip — we want niche/interesting ones
SKIP_PATTERNS = [
    r"gpt-4",
    r"gpt-3\.5",
    r"claude",
    r"gemini",
    r"palm",
]

_SKIP_RE = re.compile("|".join(SKIP_PATTERNS), re.IGNORECASE)

# together.ai type values that are definitively not text models
_NON_TEXT_TOGETHER_TYPES = {
    "image",
    "image_generation",
    "image generation",
    "audio",
    "speech",
}

# HuggingFace pipeline tags that are definitively not text models
_NON_TEXT_PIPELINE_TAGS = {
    "text-to-image",
    "image-to-image",
    "image-to-video",
    "image-editing",
    "inpainting",
    "text-to-video",
    "text-to-audio",
    "text-to-speech",
    "automatic-speech-recognition",
    "audio-to-audio",
    "audio-classification",
    "unconditional-image-generation",
    # Vision / multimodal / image understanding — text-output but vision input
    "image-to-text",
    "image-text-to-text",
    "vision-language",
    "visual-question-answering",
    "document-question-answering",
    "image-classification",
    "image-segmentation",
    "object-detection",
    "zero-shot-image-classification",
    "zero-shot-object-detection",
    "video-classification",
    "depth-estimation",
    "image-feature-extraction",
    "mask-generation",
    "audio-text-to-text",
}

# Substrings in pipeline_tag that indicate non-text models.
_VISION_OCR_TAG_SUBSTRINGS = {"ocr", "inpaint", "image-edit", "diffusion", "outpaint"}

# Name/ID regex for definitively non-text model families.
# These are explicit well-known video/image/audio/vision model families.
# We do NOT match broad words like "vision" or "image" alone since many text
# models use those in names (e.g. "CodeVision", "ImageBind-text").
_NON_TEXT_NAME_RE = re.compile(
    r"\b(wan2|wan-2|diffusion|sdxl|stable[-_]diffusion|"
    r"dall[-_e]|flux\b|midjourney|whisper|voxtral|musicgen|audiogen|"
    r"sora\b|kling\b|hunyuan[-_]?video|cogvideo|videollm|video[-_]llm|"
    r"llava|bakllava|idefics|cogvlm|internvl|qwen[-_]?vl|pixtral|"
    r"blip\b|clip\b|owl[-_]vit|ocr\b|firered\b|image[-_]edit|"
    r"inpaint|outpaint|upscal|coloriz|deblur|denois|superresolution|"
    r"image[-_]gen|img[-_]gen|text[-_]to[-_]img|txt[-_]to[-_]img|"
    r"img2img|image2image|pix2pix|controlnet|lora[-_]?train|dreambooth)\b",
    re.IGNORECASE,
)


def _is_congress_model(model: dict) -> bool:
    """Return True if this model is text-based and eligible for congress.

    Excludes models that are definitively non-text (image gen, audio, video, TTS,
    vision/multimodal, OCR). Everything else — tiny models, domain-specific,
    instruction-tuned, base models — passes. When in doubt, let it through.
    """
    # together.ai "type" field is authoritative
    model_type = (model.get("type") or "").lower().strip()
    if model_type in _NON_TEXT_TOGETHER_TYPES:
        return False

    # HuggingFace pipeline_tag is authoritative when present
    pipeline_tag = (model.get("pipeline_tag") or "").lower().strip()
    if pipeline_tag in _NON_TEXT_PIPELINE_TAGS:
        return False

    # pipeline_tag substring checks (e.g. "ocr", future variants)
    if any(sub in pipeline_tag for sub in _VISION_OCR_TAG_SUBSTRINGS):
        return False

    # pipeline_tag "vision" check — only exclude if the tag itself IS "vision"
    # or starts with "vision-" to avoid catching "text-generation" models whose
    # readme merely mentions vision.
    if pipeline_tag == "vision" or pipeline_tag.startswith("vision-"):
        return False

    # Name/ID pattern check for well-known non-text model families.
    # This is a last-resort filter for models whose pipeline_tag is missing or wrong
    # (e.g. gated HF repos that return 401 before we can verify their tag).
    model_id = (model.get("model_id") or "")
    name = (model.get("name") or "")
    if _NON_TEXT_NAME_RE.search(model_id) or _NON_TEXT_NAME_RE.search(name):
        return False

    return True


@activity.defn
async def filter_non_text(candidate: dict) -> bool:
    """Return True if the candidate passes the text-only congress filter.

    Used as a post-detail-fetch gate when pipeline_tag is only known after
    the HuggingFace detail API call.
    """
    return _is_congress_model(candidate)


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

        # Skip if already scouted
        if model_id in known_ids:
            continue

        # Skip generic frontier models
        if _SKIP_RE.search(name) or _SKIP_RE.search(model_id):
            continue

        # Only gate on text-based; let everything else through
        if not _is_congress_model(model):
            logger.debug("Skipping non-text model: %s (pipeline_tag=%s, type=%s)",
                         model_id, model.get("pipeline_tag"), model.get("type"))
            continue

        candidates.append(model)

    if not candidates:
        return None

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


# ---------------------------------------------------------------------------
# Grok-powered model description generation
# ---------------------------------------------------------------------------

_XAI_API_URL = "https://api.x.ai/v1/chat/completions"
_DESCRIPTION_SYSTEM = (
    "You write plain-English descriptions of AI models for non-technical people. "
    "No jargon, no technical terms, no ML buzzwords. "
    "Keep it to 1-2 short sentences. Focus on what the model can actually do, "
    "not how it was built. Write like you're explaining it to a friend."
)


def extract_model_card_details(hf_detail: dict) -> dict:
    """Extract structured architecture and benchmark info from a HuggingFace model detail response.

    Looks through cardData (front matter), model card readme sections, and top-level
    fields to pull out: architecture type, training method, benchmark scores, dataset info,
    context length, quantization, and any other structured facts.

    Returns a dict with string values for any fields found. All fields are optional.
    """
    card_data = hf_detail.get("cardData") or {}
    result: dict[str, str] = {}

    # --- Architecture type ---
    arch = (
        card_data.get("model_type")
        or card_data.get("architecture")
        or hf_detail.get("config", {}).get("model_type")
        or ""
    )
    if arch:
        result["architecture"] = str(arch)

    # --- Base model (was this fine-tuned from something?) ---
    base_model = card_data.get("base_model") or card_data.get("finetuned_from") or ""
    if isinstance(base_model, list):
        base_model = ", ".join(base_model)
    if base_model:
        result["base_model"] = str(base_model)

    # --- Training method / type ---
    # "model_type" in cardData often means "mistral", "llama", etc.
    # "license" gives us OSS-ness. Look for finetuning indicators.
    finetune_tags = []
    tags = hf_detail.get("tags") or card_data.get("tags") or []
    for tag in tags:
        tag_lower = tag.lower()
        if any(kw in tag_lower for kw in ["rlhf", "dpo", "orpo", "sft", "instruct",
                                            "chat", "gguf", "awq", "gptq", "quantized"]):
            finetune_tags.append(tag)
    if finetune_tags:
        result["training_tags"] = ", ".join(finetune_tags[:6])

    # --- Datasets used ---
    datasets = card_data.get("datasets") or []
    if isinstance(datasets, list) and datasets:
        result["datasets"] = ", ".join(str(d) for d in datasets[:5])

    # --- Language support ---
    languages = card_data.get("language") or card_data.get("languages") or []
    if isinstance(languages, str):
        languages = [languages]
    if languages and len(languages) > 1:
        result["languages"] = ", ".join(languages[:8])

    # --- License ---
    license_val = card_data.get("license") or ""
    if license_val:
        result["license"] = str(license_val)

    # --- Benchmark scores ---
    # HF cardData sometimes has an "eval_results" list with benchmark entries
    eval_results = card_data.get("eval_results") or []
    if eval_results:
        bench_parts = []
        for ev in eval_results[:8]:
            task = ev.get("task", {}).get("name") or ev.get("task_type") or ""
            dataset_name = ev.get("dataset", {}).get("name") or ev.get("dataset_name") or ""
            metric = ev.get("metrics", [{}])[0] if ev.get("metrics") else {}
            metric_val = metric.get("value")
            if metric_val is not None and task:
                label = dataset_name or task
                bench_parts.append(f"{label}: {metric_val:.1f}" if isinstance(metric_val, float)
                                   else f"{label}: {metric_val}")
        if bench_parts:
            result["benchmarks"] = "; ".join(bench_parts)

    # --- Mine the model card readme for benchmark tables / mentions ---
    # The readme field (if present) often has benchmark tables in markdown
    readme = card_data.get("readme") or hf_detail.get("readme") or ""
    if readme and len(readme) > 100:
        # Extract lines that look like benchmark results: contain numbers and benchmark names
        bench_keywords = [
            "mmlu", "hellaswag", "arc", "truthfulqa", "gsm8k", "math", "humaneval",
            "mbpp", "bbh", "ifeval", "gpqa", "mt-bench", "lm-eval", "big-bench",
        ]
        readme_lines = readme.split("\n")
        bench_lines = []
        for line in readme_lines:
            line_lower = line.lower()
            if any(kw in line_lower for kw in bench_keywords):
                # Keep lines that have at least one number — likely a score
                if re.search(r"\d+\.?\d*", line):
                    bench_lines.append(line.strip())
        if bench_lines and not result.get("benchmarks"):
            # Deduplicate and cap
            seen: set[str] = set()
            unique_bench_lines = []
            for line in bench_lines:
                if line not in seen:
                    seen.add(line)
                    unique_bench_lines.append(line)
            result["benchmark_mentions"] = " | ".join(unique_bench_lines[:6])

    return result


@activity.defn
async def generate_model_description(
    model_name: str,
    model_id: str,
    model_info: dict,
) -> str:
    """Use Grok to synthesize a 3-5 sentence description of what makes a model unique.

    Args:
        model_name: human-readable model name
        model_id: source-qualified model identifier (e.g. "hf:org/ModelName")
        model_info: dict with any combination of: params, source, description,
                    pipeline_tag, tags, context_length, downloads, likes,
                    architecture, base_model, training_tags, datasets, languages,
                    license, benchmarks, benchmark_mentions

    Returns:
        A 2-3 sentence plain-English description. Raises RuntimeError on API failure.
    """
    api_key = get_xai_key()

    # Build a structured prompt from available metadata
    parts = [f"Model name: {model_name}", f"Model ID: {model_id}"]

    params = model_info.get("params")
    if params:
        parts.append(f"Parameters: {params / 1e9:.1f}B")

    source = model_info.get("source")
    if source:
        parts.append(f"Source: {source}")

    architecture = model_info.get("architecture")
    if architecture:
        parts.append(f"Architecture type: {architecture}")

    base_model = model_info.get("base_model")
    if base_model:
        parts.append(f"Fine-tuned from: {base_model}")

    training_tags = model_info.get("training_tags")
    if training_tags:
        parts.append(f"Training/quantization tags: {training_tags}")

    pipeline_tag = model_info.get("pipeline_tag")
    if pipeline_tag:
        parts.append(f"Task: {pipeline_tag}")

    context_length = model_info.get("context_length")
    if context_length:
        parts.append(f"Context length: {context_length:,} tokens")

    datasets = model_info.get("datasets")
    if datasets:
        parts.append(f"Training datasets: {datasets}")

    languages = model_info.get("languages")
    if languages:
        parts.append(f"Languages: {languages}")

    license_val = model_info.get("license")
    if license_val:
        parts.append(f"License: {license_val}")

    benchmarks = model_info.get("benchmarks")
    if benchmarks:
        parts.append(f"Benchmark results: {benchmarks}")

    benchmark_mentions = model_info.get("benchmark_mentions")
    if benchmark_mentions and not benchmarks:
        parts.append(f"Benchmark mentions from model card: {benchmark_mentions[:500]}")

    tags = model_info.get("tags")
    if tags:
        relevant_tags = [t for t in tags[:12] if len(t) < 40 and t not in (training_tags or "")]
        if relevant_tags:
            parts.append(f"Tags: {', '.join(relevant_tags)}")

    description = model_info.get("description") or ""
    if description:
        parts.append(f"Author description: {description[:500]}")

    prompt = (
        "\n".join(parts)
        + "\n\nIn 2-3 short, plain-English sentences, explain: "
        "(1) what this model can do in everyday terms, "
        "(2) what it's particularly good at, "
        "(3) why it might make an interesting debate persona in an AI parliament. "
        "No technical jargon. Write for someone who knows nothing about machine learning."
    )

    payload = {
        "model": "grok-3-mini",
        "messages": [
            {"role": "system", "content": _DESCRIPTION_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 175,
        "temperature": 0.4,
    }

    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(
            _XAI_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        ) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise RuntimeError(
                    f"xAI API error generating description for {model_name} "
                    f"(HTTP {resp.status}): {body[:300]}"
                )
            data = await resp.json()

    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError(
            f"xAI API returned no choices for {model_name}: {data}"
        )

    text = choices[0]["message"]["content"].strip()
    if not text:
        raise RuntimeError(
            f"xAI API returned empty description for {model_name}"
        )

    # Allow up to 600 chars — enough for 2-3 short sentences
    return text[:600]
