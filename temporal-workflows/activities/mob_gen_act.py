"""
Activities for the MobGenerationWorkflow.

- select_entities_from_graph: pull high-connectivity entities from FalkorDB
- check_mob_cache: look up already-generated stats in clungiverse.db
- generate_mob_stats: call OpenAI to produce RPG stats for an entity
- generate_mob_sprite: call OpenAI to produce a JS canvas sprite function for a mob
"""

import asyncio
import json
import random
import re
import sqlite3
from pathlib import Path

import falkordb as _falkordb
import openai
from temporalio import activity

from .constants import BASE_DIR, FALKORDB_HOST, FALKORDB_PORT, HELLO_WORLD_DIR, SCRIPTS_DIR
from .utils import get_openai_key

_falkordb_client = _falkordb.FalkorDB(
    host=FALKORDB_HOST,
    port=FALKORDB_PORT,
)

CLUNGIVERSE_DB = Path(BASE_DIR) / "commons-server/db/commons.db"
MOB_SPRITES_JS = Path(HELLO_WORLD_DIR) / "static/clungiverse/mob-sprites.js"
MOB_IMAGES_DIR = Path(HELLO_WORLD_DIR) / "static/mob-images"
RENDER_SPRITE_SCRIPT = SCRIPTS_DIR / "render-mob-sprite.js"

_OPENAI_MODEL = "gpt-4o-mini"
_openai_client: openai.AsyncOpenAI | None = None


def _get_openai_client() -> openai.AsyncOpenAI:
    """Return a cached AsyncOpenAI client, creating it on first call.

    Raises RuntimeError if OPENAI_API_KEY is not set.
    """
    global _openai_client
    if _openai_client is None:
        api_key = get_openai_key()
        _openai_client = openai.AsyncOpenAI(api_key=api_key)
    return _openai_client


async def _run_llm(prompt: str, label: str) -> str:
    """Call OpenAI chat completions API with the given prompt and return stripped text.

    Uses gpt-4o-mini. Raises RuntimeError on API error or empty response.
    """
    client = _get_openai_client()

    response = await client.chat.completions.create(
        model=_OPENAI_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
    )

    if not response.choices:
        raise RuntimeError(f"OpenAI returned no choices for '{label}'")

    raw = (response.choices[0].message.content or "").strip()
    if not raw:
        raise RuntimeError(f"OpenAI returned empty content for '{label}'")

    # Strip markdown fences if present
    if raw.startswith("```"):
        lines = raw.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw = "\n".join(lines).strip()

    return raw


# Entities that are metadata artifacts, not real game-worthy names
ENTITY_BLOCKLIST = {
    "personality traits",
    "interests",
    "tone",
    "recurring topics",
    "communication style",
    "state",
    "tired",
    "content",
    "summary",
    "messages",
}

MOB_STAT_PROMPT = """\
You are a game designer for a roguelike dungeon crawler. Given an entity name and optional summary from a knowledge graph, generate RPG mob stats.

Entity name: {name}
Entity summary: {summary}

Generate a JSON object with these fields:
- "entity_name": the original entity name exactly as given
- "display_name": a creative mob name derived from the entity (2-4 words, title case)
- "behavior": one of "melee_chase", "ranged_pattern", or "slow_charge"
- "base_hp": integer 20-200
- "base_atk": integer 5-50
- "base_def": integer 0-30
- "base_spd": integer 1-20
- "flavor_text": one sentence of dark/humorous flavor text (under 120 chars)
- "attack_pattern": a JSON object describing the attack, with keys "type" (string) and "cooldown_ms" (integer 500-3000)

Stats should feel thematically appropriate to the entity. Obscure or abstract entities make weird, interesting mobs. Real people or places make themed variants.

Respond with ONLY the JSON object, no markdown fences, no explanation."""


@activity.defn
async def select_entities_from_graph(count: int, exclude_names: list[str]) -> list[dict]:
    """Select random high-connectivity entities from the FalkorDB knowledge graph."""
    activity.logger.info("Selecting %d entities from graph (excluding %d)", count, len(exclude_names))

    graph = _falkordb_client.select_graph("discord_history")
    result = graph.query(
        "MATCH (n:Entity)-[r]-() "
        "WITH n, count(r) AS edges "
        "ORDER BY edges DESC "
        "RETURN n.name AS name, n.summary AS summary, edges"
    )

    all_entities = []
    for row in result.result_set:
        name = row[0]
        summary = row[1] or ""
        edges = row[2]
        all_entities.append({"name": name, "summary": summary, "edges": edges})

    if not all_entities:
        activity.logger.warning("No entities found in graph")
        return []

    # Take top 50% by edge count
    cutoff = len(all_entities) // 2
    top_half = all_entities[:max(cutoff, 1)]

    # Filter: name length >= 3, not in blocklist, not in exclude list
    exclude_set = {n.lower() for n in exclude_names}
    eligible = [
        e for e in top_half
        if len(e["name"]) >= 3
        and e["name"].lower() not in ENTITY_BLOCKLIST
        and e["name"].lower() not in exclude_set
    ]

    if not eligible:
        activity.logger.warning("No eligible entities after filtering (had %d total)", len(all_entities))
        return []

    selected_count = min(count, len(eligible))
    selected = random.sample(eligible, selected_count)

    activity.logger.info("Selected %d entities (from %d eligible, %d total)", len(selected), len(eligible), len(all_entities))
    return [{"name": e["name"], "summary": e["summary"]} for e in selected]


@activity.defn
async def check_mob_cache(entity_names: list[str]) -> dict:
    """Check clungiverse.db for already-generated mob stats.

    Returns a dict keyed by entity_name with full stat dicts as values.
    Returns empty dict if the mob_cache table doesn't exist yet.
    """
    if not CLUNGIVERSE_DB.exists():
        activity.logger.info("clungiverse.db not found, no cache")
        return {}

    conn = sqlite3.connect(str(CLUNGIVERSE_DB))
    conn.row_factory = sqlite3.Row
    try:
        # Check if mob_cache table exists
        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='mob_cache'"
        ).fetchone()
        if not tables:
            activity.logger.info("mob_cache table does not exist yet, no cache")
            return {}

        placeholders = ",".join("?" for _ in entity_names)
        rows = conn.execute(
            f"SELECT * FROM mob_cache WHERE entity_name IN ({placeholders})",
            entity_names,
        ).fetchall()

        result = {}
        for row in rows:
            d = dict(row)
            result[d["entity_name"]] = d

        activity.logger.info("Cache hit: %d / %d entities", len(result), len(entity_names))
        return result
    finally:
        conn.close()


@activity.defn
async def generate_mob_stats(entity_name: str, entity_summary: str) -> dict:
    """Call OpenAI to generate RPG mob stats for an entity."""
    activity.logger.info("Generating mob stats for: %s", entity_name)

    prompt = MOB_STAT_PROMPT.format(name=entity_name, summary=entity_summary or "No description available")
    raw = await _run_llm(prompt, entity_name)

    try:
        stats = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Failed to parse LLM response for '{entity_name}': {exc}\nRaw: {raw[:500]}")

    # Validate required fields
    required = ["entity_name", "display_name", "behavior", "base_hp", "base_atk", "base_def", "base_spd", "flavor_text"]
    missing = [f for f in required if f not in stats]
    if missing:
        raise RuntimeError(f"Missing fields in generated stats for '{entity_name}': {missing}")

    # Validate behavior type
    valid_behaviors = {"melee_chase", "ranged_pattern", "slow_charge"}
    if stats["behavior"] not in valid_behaviors:
        activity.logger.warning("Invalid behavior '%s' for '%s', defaulting to melee_chase", stats["behavior"], entity_name)
        stats["behavior"] = "melee_chase"

    # Clamp stat ranges
    stats["base_hp"] = max(20, min(200, int(stats["base_hp"])))
    stats["base_atk"] = max(5, min(50, int(stats["base_atk"])))
    stats["base_def"] = max(0, min(30, int(stats["base_def"])))
    stats["base_spd"] = max(1, min(20, int(stats["base_spd"])))

    # Ensure entity_name matches what we asked for
    stats["entity_name"] = entity_name

    # Ensure attack_pattern is a dict
    if "attack_pattern" not in stats or not isinstance(stats.get("attack_pattern"), dict):
        stats["attack_pattern"] = {"type": "basic", "cooldown_ms": 1000}

    activity.logger.info("Generated stats for '%s': HP=%d ATK=%d DEF=%d SPD=%d behavior=%s",
                         entity_name, stats["base_hp"], stats["base_atk"], stats["base_def"],
                         stats["base_spd"], stats["behavior"])
    return stats


@activity.defn
async def save_mob_stats(stats: dict) -> None:
    """Persist generated mob stats into the commons-server mob_cache DB.

    Inserts or replaces the row so subsequent runs can cache-hit it.
    The activity is idempotent (INSERT OR REPLACE).
    """
    entity_name = stats["entity_name"]
    activity.logger.info("Saving mob stats for: %s", entity_name)

    conn = sqlite3.connect(str(CLUNGIVERSE_DB))
    try:
        budget_cost = stats.get("budget_cost", 5)

        conn.execute(
            """INSERT OR REPLACE INTO mob_cache
               (entity_name, display_name, behavior, hp, atk, def, spd,
                budget_cost, flavor_text, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
            (
                entity_name,
                stats["display_name"],
                stats["behavior"],
                stats["base_hp"],
                stats["base_atk"],
                stats["base_def"],
                stats["base_spd"],
                budget_cost,
                stats.get("flavor_text"),
            ),
        )
        conn.commit()
        activity.logger.info("Saved mob stats for: %s (display: %s)", entity_name, stats["display_name"])
    except Exception as exc:
        raise RuntimeError(f"Failed to save mob stats for '{entity_name}': {exc}") from exc
    finally:
        conn.close()


def _slugify(name: str) -> str:
    """Convert a display name to a JS-safe function name suffix.

    "Cave Rat" -> "cave_rat"
    "Centronias the Void Walker" -> "centronias_the_void_walker"
    """
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "_", slug)
    slug = slug.strip("_")
    return slug


@activity.defn
async def generate_mob_sprite(entity_name: str, display_name: str, description: str) -> str:
    """Call OpenAI to generate a JS canvas sprite function for a mob.

    The function is named drawSprite_<slug> where slug is derived from display_name.
    It is appended (or replaced if already present) in mob-sprites.js.

    Returns the generated JS function body as a string.
    """
    activity.logger.info("Generating sprite for mob: %s (%s)", display_name, entity_name)

    slug = _slugify(display_name)
    fn_name = f"drawSprite_{slug}"

    system_prompt = (
        f"Generate exactly one JavaScript function: `function {fn_name}(ctx, cx, cy)`. "
        "Rules: "
        "only ctx.fillStyle and ctx.fillRect — no other canvas API calls. "
        "Character ~40px tall centered on cx/cy (cy = center, not feet). "
        "Width ~20px. "
        f"Visually represents the mob '{display_name}': {description}. "
        "Include a short comment above the function (// <display_name>: <visual concept>). "
        f"After the closing brace, add one line: `window.{fn_name} = {fn_name};` "
        "Output ONLY the comment, function, and window registration line — no markdown fences, no explanation."
    )

    raw = await _run_llm(system_prompt, f"sprite:{display_name}")

    # Validate the function is present
    if fn_name not in raw:
        raise RuntimeError(
            f"Generated output for '{display_name}' does not contain expected function '{fn_name}'. "
            f"Raw output: {raw[:300]}"
        )

    # Write or replace in mob-sprites.js
    MOB_SPRITES_JS.parent.mkdir(parents=True, exist_ok=True)

    existing = MOB_SPRITES_JS.read_text(encoding="utf-8") if MOB_SPRITES_JS.exists() else ""

    # Replace if function already exists, otherwise append
    pattern = re.compile(
        r"(?m)(^//[^\n]*\n)?^function " + re.escape(fn_name) + r"\(ctx, cx, cy\).*?^}",
        re.DOTALL | re.MULTILINE,
    )
    if pattern.search(existing):
        new_content = pattern.sub(raw, existing, count=1)
    else:
        separator = "\n\n" if existing.strip() else ""
        new_content = existing + separator + raw + "\n"

    MOB_SPRITES_JS.write_text(new_content, encoding="utf-8")

    activity.logger.info("Wrote sprite function '%s' to mob-sprites.js", fn_name)

    # Render the JS function to a PNG image for use as a static asset
    await _render_sprite_png(slug, raw, display_name)

    return raw


async def _render_sprite_png(slug: str, js_code: str, display_name: str) -> None:
    """Render a sprite JS function to a 64x64 PNG via the render-mob-sprite.js script.

    Saves to MOB_IMAGES_DIR/<slug>.png. Logs a warning on failure rather than raising,
    since the PNG is a non-critical enhancement — the JS function is the source of truth.
    """
    if not RENDER_SPRITE_SCRIPT.exists():
        activity.logger.warning("render-mob-sprite.js not found at %s, skipping PNG render", RENDER_SPRITE_SCRIPT)
        return

    MOB_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    output_path = MOB_IMAGES_DIR / f"{slug}.png"

    try:
        proc = await asyncio.create_subprocess_exec(
            "node",
            str(RENDER_SPRITE_SCRIPT),
            slug,
            str(output_path),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(input=js_code.encode("utf-8")), timeout=30)

        if proc.returncode != 0:
            err = stderr.decode("utf-8", errors="replace").strip()
            activity.logger.warning("PNG render failed for '%s' (slug=%s): %s", display_name, slug, err)
        else:
            activity.logger.info("Rendered PNG sprite for '%s' -> %s", display_name, output_path)
    except asyncio.TimeoutError:
        activity.logger.warning("PNG render timed out for '%s' (slug=%s)", display_name, slug)
    except Exception as exc:  # noqa: BLE001
        activity.logger.warning("PNG render error for '%s' (slug=%s): %s", display_name, slug, exc)
