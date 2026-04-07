"""
Persona polls activity — generate avatar GIFs + sprite JS for a new persona,
create poll files, commit to git, and notify Discord.

Called from CongressWorkflow after a CREATE directive, or triggered manually.
"""
import json
import os
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

from temporalio import activity

from .inject_act import _do_inject
from .constants import AGENTS_DIR, MAIN_CHANNEL_ID, SCRIPTS_DIR

POLLS_DIR = "/mnt/data/hello-world/polls"
AVATARS_DIR = "/mnt/data/hello-world/static/avatars"
SPRITES_DIR = "/mnt/data/hello-world"


def _read_persona(slug: str) -> dict:
    """Read persona .md and extract frontmatter fields + first 500 chars of prose."""
    path = os.path.join(AGENTS_DIR, f"{slug}.md")
    if not os.path.exists(path):
        raise FileNotFoundError(f"Persona file not found: {path}")

    with open(path) as f:
        content = f.read()

    fm_match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not fm_match:
        raise ValueError(f"No frontmatter found in {path}")

    fm_text = fm_match.group(1)
    fields: dict = {}
    for line in fm_text.split("\n"):
        m = re.match(r"^(\w[\w_]*)\s*:\s*(.+)$", line)
        if m:
            fields[m.group(1)] = m.group(2).strip().strip("'\"")

    prose = content[fm_match.end():].strip()
    fields["prose"] = prose[:500]
    return fields


def _run_claude(system_prompt: str, user_msg: str) -> str:
    """Run claude CLI and return output. Raises on failure or empty output."""
    proc = subprocess.run(
        ["claude", "-p", system_prompt, "--output-format", "text"],
        input=user_msg,
        capture_output=True,
        text=True,
        timeout=300,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"claude failed (exit {proc.returncode}): {proc.stderr[:500]}")
    output = proc.stdout.strip()
    if not output:
        raise RuntimeError(f"claude returned empty output. stderr: {proc.stderr[:500]}")
    return output


def _generate_avatar_scripts(slug: str, persona: dict) -> list[tuple[str, str, str]]:
    """Generate 4 PIL avatar generation scripts (A/B/C/D) via claude.

    Returns list of (label, out_path, script_code).
    """
    display_name = persona.get("display_name", slug.replace("-", " ").title())
    role = persona.get("role", "Debater")
    title = persona.get("title", "Persona")
    traits = persona.get("traits", "[]")
    prose = persona.get("prose", "")

    system_prompt = (
        "You are a pixel art avatar generator. You write Python scripts using PIL (Pillow) "
        "that create 64x64 animated GIF avatars. Each script must:\n"
        "- Use only PIL (Image, ImageDraw, math). No external assets.\n"
        "- Create an 8-10 frame animated GIF at 130ms/frame.\n"
        "- Output to a specific path passed as the output variable.\n"
        "- Have a dark background, isometric-style bust, and a subtle animation loop.\n"
        "- Be a complete, runnable Python script.\n"
        "- Start with: from PIL import Image, ImageDraw\\nimport math\n"
        "- End with saving to OUT_PATH variable (defined at top of script).\n"
        "- Each variant must look distinctly different from the others.\n\n"
        "Output ONLY the Python code. No markdown fences, no explanations."
    )

    scripts = []
    variant_labels = ["A", "B", "C", "D"]
    variant_concepts = [
        "primary/iconic look",
        "alternative angle or outfit",
        "stylized/artistic interpretation",
        "action pose or signature gesture",
    ]

    for label, concept in zip(variant_labels, variant_concepts):
        out_path = os.path.join(AVATARS_DIR, f"{slug}_{label.lower()}.gif")
        user_msg = (
            f"Create a 64x64 animated GIF pixel art avatar for '{display_name}' "
            f"({role}, {title}). Traits: {traits}.\n"
            f"Character context: {prose[:300]}\n\n"
            f"This is variant {label} ({concept}).\n"
            f"Set OUT_PATH = {json.dumps(out_path)} at the top of the script.\n"
            f"Save the animated GIF to OUT_PATH at the end."
        )
        script = _run_claude(system_prompt, user_msg)
        scripts.append((label, out_path, script))
        activity.logger.info("Generated avatar variant %s script for %s", label, slug)

    return scripts


def _execute_avatar_scripts(scripts: list[tuple[str, str, str]]) -> list[str]:
    """Execute each avatar generation script and return paths of generated files."""
    generated = []
    for label, out_path, script in scripts:
        script_path = os.path.join(SCRIPTS_DIR, f"_gen_{os.path.basename(out_path).replace('.gif', '')}.py")
        with open(script_path, "w") as f:
            f.write(script)

        proc = subprocess.run(
            [sys.executable, script_path],
            capture_output=True,
            text=True,
            timeout=60,
        )
        try:
            os.unlink(script_path)
        except OSError:
            pass

        if proc.returncode != 0:
            activity.logger.warning("avatar variant %s script failed: %s", label, proc.stderr[:300])
            continue

        if os.path.exists(out_path):
            generated.append(out_path)
            activity.logger.info("Generated avatar: %s", out_path)
        else:
            activity.logger.warning("avatar variant %s script ran but %s not created", label, out_path)

    return generated


def _generate_sprites(slug: str, persona: dict) -> str:
    """Generate 3 sprite JS function variants (A/B/C) via claude. Returns JS code."""
    display_name = persona.get("display_name", slug.replace("-", " ").title())
    role = persona.get("role", "Debater")
    title = persona.get("title", "Persona")
    traits = persona.get("traits", "[]")
    prose = persona.get("prose", "")
    js_slug = slug.replace("-", "_")

    system_prompt = (
        "You are a pixel art sprite generator for a browser canvas game. "
        "Write 3 drawSprite functions (variants A, B, C) for a character.\n\n"
        "Rules:\n"
        f"- Functions must be named exactly: drawSprite_{js_slug}_A, drawSprite_{js_slug}_B, drawSprite_{js_slug}_C\n"
        f"- Signature: function drawSprite_{js_slug}_X(ctx, cx, cy)\n"
        "- Use only ctx.fillStyle and ctx.fillRect. No other canvas API calls.\n"
        "- cx, cy = center-bottom (feet). Body height ~40px, width ~20px centered on cx.\n"
        "- Each variant must look distinctly different from the others.\n"
        "- Include a short comment above each function describing the visual concept.\n"
        "- Output ONLY the 3 JavaScript functions, no markdown fences, no explanations."
    )

    user_msg = (
        f"Create 3 pixel art sprite variants for '{display_name}' "
        f"({role}, {title}). Traits: {traits}.\n"
        f"Character context: {prose[:300]}\n\n"
        f"Each variant should capture a different visual interpretation of this character."
    )

    output = _run_claude(system_prompt, user_msg)
    output = re.sub(r"^```(?:javascript|js)?\s*\n", "", output)
    output = re.sub(r"\n```\s*$", "", output)

    for variant in ["A", "B", "C"]:
        fn_name = f"drawSprite_{js_slug}_{variant}"
        if fn_name not in output:
            raise RuntimeError(f"Generated sprite code missing {fn_name}")

    activity.logger.info("Generated 3 sprite variants for %s", slug)
    return output


def _write_sprite_batch(slug: str, sprite_code: str) -> str:
    """Write sprite functions to a batch file. Returns the batch filename."""
    js_slug = slug.replace("-", "_")

    for batch in sorted(Path(SPRITES_DIR).glob("sprites-batch*.js")):
        with open(batch) as f:
            if f"drawSprite_{js_slug}_A" in f.read():
                activity.logger.warning("%s sprites already exist in %s, skipping write", slug, batch.name)
                return batch.name

    batch_files = sorted(Path(SPRITES_DIR).glob("sprites-batch*.js"))
    if batch_files:
        latest = batch_files[-1]
        with open(latest) as f:
            lines = f.readlines()
        if len(lines) < 600:
            with open(latest, "a") as f:
                f.write(f"\n\n// --- {slug.upper()} sprites (auto-generated) ---\n\n")
                f.write(sprite_code)
                f.write("\n")
            activity.logger.info("Appended sprites to %s", latest.name)
            return latest.name
        else:
            num = int(re.search(r"batch(\d+)", latest.name).group(1)) + 1
            new_name = f"sprites-batch{num}.js"
    else:
        new_name = "sprites-batch1.js"

    new_path = os.path.join(SPRITES_DIR, new_name)
    with open(new_path, "w") as f:
        f.write(f"// {new_name} -- Auto-generated sprite variants\n")
        f.write(f"// Format: drawSprite_<name>_<variant>(ctx, cx, cy)\n\n")
        f.write(sprite_code)
        f.write("\n")

    activity.logger.info("Created sprite batch file %s", new_name)
    _update_html_script_refs(new_name)
    return new_name


def _update_html_script_refs(new_batch_name: str) -> None:
    """Add a script tag for the new batch file to HTML files that reference sprites."""
    html_files = [
        os.path.join(SPRITES_DIR, "sprites-vote.html"),
        os.path.join(SPRITES_DIR, "grazing.html"),
        os.path.join(SPRITES_DIR, "refinery.html"),
    ]
    tag = f'  <script src="/{new_batch_name}"></script>'

    for html_path in html_files:
        if not os.path.exists(html_path):
            continue
        with open(html_path) as f:
            content = f.read()
        if new_batch_name in content:
            continue
        pattern = r'(  <script src="/sprites-batch\d+\.js"></script>)'
        matches = list(re.finditer(pattern, content))
        if matches:
            last_match = matches[-1]
            insert_pos = last_match.end()
            content = content[:insert_pos] + "\n" + tag + content[insert_pos:]
            with open(html_path, "w") as f:
                f.write(content)
            activity.logger.info("Added %s script tag to %s", new_batch_name, os.path.basename(html_path))


def _create_avatar_poll(slug: str, persona: dict) -> str:
    """Create avatar poll markdown file. Returns poll file path."""
    display_name = persona.get("display_name", slug.replace("-", " ").title())
    poll_id = f"avatar-{slug}"
    poll_path = os.path.join(POLLS_DIR, f"{poll_id}.md")

    if os.path.exists(poll_path):
        activity.logger.info("Avatar poll already exists: %s", poll_path)
        return poll_path

    labels = ["A", "B", "C", "D"]
    options_yaml = "\n".join(f"  {l}: Variant {l}" for l in labels)

    content = (
        f"---\n"
        f"poll_id: {poll_id}\n"
        f'title: "{display_name} Congress Avatar"\n'
        f"status: open\n"
        f"winner: null\n"
        f"quorum: 3\n"
        f"options:\n"
        f"{options_yaml}\n"
        f"created_at: {date.today().isoformat()}\n"
        f"---\n"
        f"\n"
        f"Vote on the congress avatar for {display_name}. "
        f"Four animated GIF options are available ({slug}_a through {slug}_d).\n"
    )

    Path(POLLS_DIR).mkdir(parents=True, exist_ok=True)
    with open(poll_path, "w") as f:
        f.write(content)

    activity.logger.info("Created avatar poll: %s", poll_path)
    return poll_path


def _create_sprite_poll(slug: str, persona: dict, sprite_code: str) -> str:
    """Create sprite poll markdown file. Returns poll file path."""
    display_name = persona.get("display_name", slug.replace("-", " ").title())
    poll_id = f"sprite-{slug}"
    poll_path = os.path.join(POLLS_DIR, f"{poll_id}.md")

    if os.path.exists(poll_path):
        activity.logger.info("Sprite poll already exists: %s", poll_path)
        return poll_path

    js_slug = slug.replace("-", "_")
    descs: dict[str, str] = {}
    for variant in ["A", "B", "C"]:
        fn_pattern = rf"//\s*(.+?)\n\s*function drawSprite_{re.escape(js_slug)}_{variant}"
        m2 = re.search(fn_pattern, sprite_code)
        if m2:
            descs[variant] = m2.group(1).strip()
        else:
            descs[variant] = f"Variant {variant}"

    options_yaml = "\n".join(f"  {v}: {descs[v]}" for v in ["A", "B", "C"])

    content = (
        f"---\n"
        f"poll_id: {poll_id}\n"
        f'title: "{display_name} Commons Sprite"\n'
        f"status: open\n"
        f"winner: null\n"
        f"quorum: 3\n"
        f"options:\n"
        f"{options_yaml}\n"
        f"created_at: {date.today().isoformat()}\n"
        f"---\n"
        f"\n"
        f"Vote on the commons sprite for {display_name}.\n"
    )

    Path(POLLS_DIR).mkdir(parents=True, exist_ok=True)
    with open(poll_path, "w") as f:
        f.write(content)

    activity.logger.info("Created sprite poll: %s", poll_path)
    return poll_path


def _git_commit_and_push() -> None:
    """Commit and push hello-world changes (polls, avatars, sprites)."""
    subprocess.run(
        ["git", "add", "polls/", "static/avatars/", "sprites-batch*.js",
         "sprites-vote.html", "grazing.html", "refinery.html"],
        cwd=SPRITES_DIR,
        check=False,
        timeout=30,
    )
    result = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=hw_dir, timeout=10)
    if result.returncode != 0:
        subprocess.run(
            ["git", "commit", "-m", "auto: new persona avatar + sprite polls"],
            cwd=SPRITES_DIR,
            check=True,
            timeout=30,
        )
        subprocess.run(["git", "push"], cwd=hw_dir, check=True, timeout=60)
        activity.logger.info("hello-world committed and pushed")
    else:
        activity.logger.info("hello-world: nothing to commit")


@activity.defn
async def run_create_persona_polls(slug: str) -> str:
    """Generate avatar GIFs + sprites for a persona and create vote polls.

    Args:
        slug: The persona slug (e.g. "otto-the-engineer")
    """
    if not re.fullmatch(r"[a-z0-9][a-z0-9\-]*", slug):
        raise ValueError(f"Invalid slug: {slug}")

    activity.logger.info("=== Creating polls for persona: %s ===", slug)

    persona = _read_persona(slug)
    display_name = persona.get("display_name", slug.replace("-", " ").title())
    activity.logger.info("display_name=%s, role=%s", display_name, persona.get("role", "?"))

    # 1. Generate avatar GIFs
    activity.logger.info("--- Generating avatar variants ---")
    try:
        avatar_scripts = _generate_avatar_scripts(slug, persona)
        generated_avatars = _execute_avatar_scripts(avatar_scripts)
        activity.logger.info("%d avatars generated", len(generated_avatars))
    except Exception as e:
        activity.logger.warning("Avatar generation failed: %s", e)
        generated_avatars = []

    # 2. Create avatar poll
    _create_avatar_poll(slug, persona)

    # 3. Generate sprite functions
    activity.logger.info("--- Generating sprite variants ---")
    sprite_code = ""
    try:
        sprite_code = _generate_sprites(slug, persona)
        batch_file = _write_sprite_batch(slug, sprite_code)
        activity.logger.info("Sprites written to %s", batch_file)
    except Exception as e:
        activity.logger.warning("Sprite generation failed: %s", e)

    # 4. Create sprite poll
    _create_sprite_poll(slug, persona, sprite_code)

    # 5. Commit and push
    try:
        _git_commit_and_push()
    except Exception as e:
        activity.logger.warning("git commit/push failed: %s", e)

    # 6. Discord notification
    message = (
        f"New persona **{display_name}** (`{slug}`) has been created.\n"
        f"Avatar and sprite polls are now open at https://clung.us/refinery\n"
        f"- Avatar poll: `avatar-{slug}` (4 variants)\n"
        f"- Sprite poll: `sprite-{slug}` (3 variants)"
    )
    await _do_inject(message, MAIN_CHANNEL_ID, user="persona-polls")

    summary = f"Polls created for {slug}: {len(generated_avatars)} avatars generated, sprites {'OK' if sprite_code else 'FAILED'}."
    activity.logger.info(summary)
    return summary
