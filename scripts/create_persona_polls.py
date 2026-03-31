#!/usr/bin/env python3
"""
create_persona_polls.py — Generate avatar + sprite polls for a new persona.

Usage:
    python3 /mnt/data/scripts/create_persona_polls.py <slug>

Reads the persona .md file from agents/<slug>.md, then:
1. Generates 4 avatar GIF variants (A/B/C/D) via claude + PIL
2. Creates a poll file at hello-world/polls/avatar-<slug>.md
3. Generates 3 sprite JS function variants (A/B/C) via claude
4. Appends them to a new sprites-batch file (or the latest one)
5. Creates a poll file at hello-world/polls/sprite-<slug>.md
6. Commits and pushes changes to both repos
7. Posts a Discord notification via the inject endpoint

Designed to be called standalone or from congress_act.py after CREATE.
"""

import json
import os
import re
import subprocess
import sys
import urllib.request
from datetime import date
from pathlib import Path

AGENTS_DIR = "/home/clungus/work/bigclungus-meta/agents"
POLLS_DIR = "/mnt/data/hello-world/polls"
AVATARS_DIR = "/mnt/data/hello-world/static/avatars"
SPRITES_DIR = "/mnt/data/hello-world"
SCRIPTS_DIR = "/mnt/data/scripts"
MAIN_CHANNEL_ID = "1485343472952148008"


def read_persona(slug: str) -> dict:
    """Read persona .md and extract frontmatter fields."""
    path = os.path.join(AGENTS_DIR, f"{slug}.md")
    if not os.path.exists(path):
        raise FileNotFoundError(f"Persona file not found: {path}")

    with open(path) as f:
        content = f.read()

    # Parse YAML frontmatter
    fm_match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not fm_match:
        raise ValueError(f"No frontmatter found in {path}")

    fm_text = fm_match.group(1)
    fields = {}
    for line in fm_text.split("\n"):
        m = re.match(r"^(\w[\w_]*)\s*:\s*(.+)$", line)
        if m:
            fields[m.group(1)] = m.group(2).strip().strip("'\"")

    # Get prose (everything after frontmatter)
    prose = content[fm_match.end():].strip()
    fields["prose"] = prose[:500]  # truncate for prompt context
    return fields


def run_claude(system_prompt: str, user_msg: str) -> str:
    """Run claude CLI and return output."""
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


def generate_avatar_scripts(slug: str, persona: dict) -> list[str]:
    """Generate 4 PIL avatar generation scripts (A/B/C/D) via claude."""
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

    for i, (label, concept) in enumerate(zip(variant_labels, variant_concepts)):
        out_path = os.path.join(AVATARS_DIR, f"{slug}_{label.lower()}.gif")
        user_msg = (
            f"Create a 64x64 animated GIF pixel art avatar for '{display_name}' "
            f"({role}, {title}). Traits: {traits}.\n"
            f"Character context: {prose[:300]}\n\n"
            f"This is variant {label} ({concept}).\n"
            f"Set OUT_PATH = {json.dumps(out_path)} at the top of the script.\n"
            f"Save the animated GIF to OUT_PATH at the end."
        )
        script = run_claude(system_prompt, user_msg)
        scripts.append((label, out_path, script))
        print(f"[avatar] Generated variant {label} script for {slug}")

    return scripts


def execute_avatar_scripts(scripts: list) -> list[str]:
    """Execute each avatar generation script and return paths of generated files."""
    generated = []
    for label, out_path, script in scripts:
        # Write script to temp file and execute
        script_path = os.path.join(SCRIPTS_DIR, f"_gen_{os.path.basename(out_path).replace('.gif', '')}.py")
        with open(script_path, "w") as f:
            f.write(script)

        proc = subprocess.run(
            [sys.executable, script_path],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if proc.returncode != 0:
            print(f"[avatar] WARNING: variant {label} script failed: {proc.stderr[:300]}", file=sys.stderr)
            # Try to clean up
            os.unlink(script_path)
            continue

        # Clean up temp script
        os.unlink(script_path)

        if os.path.exists(out_path):
            generated.append(out_path)
            print(f"[avatar] Generated: {out_path}")
        else:
            print(f"[avatar] WARNING: variant {label} script ran but {out_path} not created", file=sys.stderr)

    return generated


def generate_sprites(slug: str, persona: dict) -> str:
    """Generate 3 sprite JS function variants (A/B/C) via claude."""
    display_name = persona.get("display_name", slug.replace("-", " ").title())
    role = persona.get("role", "Debater")
    title = persona.get("title", "Persona")
    traits = persona.get("traits", "[]")
    prose = persona.get("prose", "")

    # Use underscore version of slug for JS function names
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

    output = run_claude(system_prompt, user_msg)

    # Strip markdown fences if claude included them despite instructions
    output = re.sub(r"^```(?:javascript|js)?\s*\n", "", output)
    output = re.sub(r"\n```\s*$", "", output)

    # Validate all 3 functions exist
    for variant in ["A", "B", "C"]:
        fn_name = f"drawSprite_{js_slug}_{variant}"
        if fn_name not in output:
            raise RuntimeError(f"Generated sprite code missing {fn_name}")

    print(f"[sprite] Generated 3 variants for {slug}")
    return output


def write_sprite_batch(slug: str, sprite_code: str) -> str:
    """Write sprite functions to a new or existing batch file. Returns the batch filename."""
    js_slug = slug.replace("-", "_")

    # Check if slug already exists in any batch file
    for batch in sorted(Path(SPRITES_DIR).glob("sprites-batch*.js")):
        with open(batch) as f:
            if f"drawSprite_{js_slug}_A" in f.read():
                print(f"[sprite] WARNING: {slug} sprites already exist in {batch.name}, skipping write")
                return batch.name

    # Find the highest batch number and append to it (or create new if > 600 lines)
    batch_files = sorted(Path(SPRITES_DIR).glob("sprites-batch*.js"))
    if batch_files:
        latest = batch_files[-1]
        with open(latest) as f:
            lines = f.readlines()
        if len(lines) < 600:
            # Append to existing
            with open(latest, "a") as f:
                f.write(f"\n\n// --- {slug.upper()} sprites (auto-generated) ---\n\n")
                f.write(sprite_code)
                f.write("\n")
            print(f"[sprite] Appended to {latest.name}")
            return latest.name
        else:
            # Create new batch
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

    print(f"[sprite] Created {new_name}")

    # Check if the new batch file needs to be added to HTML files
    _update_html_script_refs(new_name)

    return new_name


def _update_html_script_refs(new_batch_name: str):
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
        # Insert after the last sprites-batch script tag
        pattern = r'(  <script src="/sprites-batch\d+\.js"></script>)'
        matches = list(re.finditer(pattern, content))
        if matches:
            last_match = matches[-1]
            insert_pos = last_match.end()
            content = content[:insert_pos] + "\n" + tag + content[insert_pos:]
            with open(html_path, "w") as f:
                f.write(content)
            print(f"[sprite] Added {new_batch_name} script tag to {os.path.basename(html_path)}")


def create_avatar_poll(slug: str, persona: dict, variant_descriptions: list[str] | None = None) -> str:
    """Create avatar poll markdown file."""
    display_name = persona.get("display_name", slug.replace("-", " ").title())
    poll_id = f"avatar-{slug}"
    poll_path = os.path.join(POLLS_DIR, f"{poll_id}.md")

    if os.path.exists(poll_path):
        print(f"[poll] Avatar poll already exists: {poll_path}")
        return poll_path

    labels = ["A", "B", "C", "D"]
    options_yaml = "\n".join(f"  {l}: Variant {l}" for l in labels)

    desc_lines = ""
    if variant_descriptions:
        for label, desc in zip(labels, variant_descriptions):
            desc_lines += f"- **{label}**: {desc}\n"

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
    if desc_lines:
        content += f"\n{desc_lines}"

    with open(poll_path, "w") as f:
        f.write(content)

    print(f"[poll] Created: {poll_path}")
    return poll_path


def create_sprite_poll(slug: str, persona: dict, sprite_code: str) -> str:
    """Create sprite poll markdown file, extracting variant descriptions from code comments."""
    display_name = persona.get("display_name", slug.replace("-", " ").title())
    poll_id = f"sprite-{slug}"
    poll_path = os.path.join(POLLS_DIR, f"{poll_id}.md")

    if os.path.exists(poll_path):
        print(f"[poll] Sprite poll already exists: {poll_path}")
        return poll_path

    js_slug = slug.replace("-", "_")

    # Extract descriptions from comments above each function
    descs = {}
    for variant in ["A", "B", "C"]:
        pattern = rf"//\s*{re.escape(js_slug)}\s+{variant}\s*[:\-—]\s*(.+)"
        m = re.search(pattern, sprite_code, re.IGNORECASE)
        if m:
            descs[variant] = m.group(1).strip()
        else:
            # Try more generic comment pattern before the function
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

    with open(poll_path, "w") as f:
        f.write(content)

    print(f"[poll] Created: {poll_path}")
    return poll_path


def notify_discord(slug: str, display_name: str):
    """Post Discord notification via inject endpoint."""
    message = (
        f"New persona **{display_name}** (`{slug}`) has been created.\n"
        f"Avatar and sprite polls are now open at https://clung.us/refinery\n"
        f"- Avatar poll: `avatar-{slug}` (4 variants)\n"
        f"- Sprite poll: `sprite-{slug}` (3 variants)"
    )

    payload = json.dumps({
        "content": message,
        "chat_id": MAIN_CHANNEL_ID,
        "user": "persona-polls",
    }).encode()

    req = urllib.request.Request(
        "http://127.0.0.1:8085/webhooks/bigclungus-main",
        data=payload,
        headers={
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=10)
        print("[notify] Discord notification sent")
    except Exception as e:
        print(f"[notify] WARNING: Discord inject failed: {e}", file=sys.stderr)


def git_commit_and_push():
    """Commit and push changes in both repos."""
    # hello-world repo (polls, avatars, sprites)
    hw_dir = "/mnt/data/hello-world"
    subprocess.run(
        ["git", "add", "polls/", "static/avatars/", "sprites-batch*.js",
         "sprites-vote.html", "grazing.html", "refinery.html"],
        cwd=hw_dir,
        check=False,
    )
    result = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        cwd=hw_dir,
    )
    if result.returncode != 0:
        subprocess.run(
            ["git", "commit", "-m", "auto: new persona avatar + sprite polls"],
            cwd=hw_dir,
            check=True,
        )
        subprocess.run(["git", "push"], cwd=hw_dir, check=True)
        print("[git] hello-world committed and pushed")
    else:
        print("[git] hello-world: nothing to commit")


def main():
    if len(sys.argv) < 2:
        print("Usage: create_persona_polls.py <slug>", file=sys.stderr)
        sys.exit(1)

    slug = sys.argv[1].strip()

    # Validate slug
    if not re.fullmatch(r"[a-z0-9][a-z0-9\-]*", slug):
        print(f"Invalid slug: {slug}", file=sys.stderr)
        sys.exit(1)

    print(f"=== Creating polls for persona: {slug} ===")

    # Read persona info
    persona = read_persona(slug)
    display_name = persona.get("display_name", slug.replace("-", " ").title())
    print(f"[info] display_name={display_name}, role={persona.get('role', '?')}")

    # 1. Generate avatar GIFs
    print("\n--- Generating avatar variants ---")
    try:
        avatar_scripts = generate_avatar_scripts(slug, persona)
        generated_avatars = execute_avatar_scripts(avatar_scripts)
        if generated_avatars:
            print(f"[avatar] {len(generated_avatars)} avatars generated")
        else:
            print("[avatar] WARNING: No avatars generated successfully", file=sys.stderr)
    except Exception as e:
        print(f"[avatar] ERROR: Avatar generation failed: {e}", file=sys.stderr)
        generated_avatars = []

    # 2. Create avatar poll (even if some variants failed)
    print("\n--- Creating avatar poll ---")
    create_avatar_poll(slug, persona)

    # 3. Generate sprite functions
    print("\n--- Generating sprite variants ---")
    try:
        sprite_code = generate_sprites(slug, persona)
        batch_file = write_sprite_batch(slug, sprite_code)
        print(f"[sprite] Written to {batch_file}")
    except Exception as e:
        print(f"[sprite] ERROR: Sprite generation failed: {e}", file=sys.stderr)
        sprite_code = ""

    # 4. Create sprite poll
    print("\n--- Creating sprite poll ---")
    if sprite_code:
        create_sprite_poll(slug, persona, sprite_code)
    else:
        # Create poll with generic descriptions
        create_sprite_poll(slug, persona, "")

    # 5. Commit and push
    print("\n--- Git commit and push ---")
    try:
        git_commit_and_push()
    except Exception as e:
        print(f"[git] ERROR: {e}", file=sys.stderr)

    # 6. Discord notification
    print("\n--- Discord notification ---")
    notify_discord(slug, display_name)

    print(f"\n=== Done: polls created for {slug} ===")


if __name__ == "__main__":
    main()
