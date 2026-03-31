# Persona Design Doc

## What is a Persona?

A persona is a congress debater — an AI character with a fixed perspective, voice, and set of values. Each persona is defined by a Markdown file in this directory. The YAML frontmatter configures how the congress system treats them; the prose body is the system prompt fed to the model during a congress debate.

Personas can be selected for congress sessions, earn verdicts, evolve over time, or be retired.

---

## Canonical YAML Frontmatter Fields

```yaml
---
status: eligible           # required — see Status Values below
name: critic               # required — slug used as file name and DB key
display_name: Pippi the Pitiless  # required — shown in UI and discord
role: Code and Work Reviewer      # required — short descriptor of what this persona does
model: gemini              # required — model alias or full model ID (see Model Aliases)
sex: female                # optional — used for pronoun display (male/female/nonbinary)
title: Perfectionist       # optional — one-word or short title shown under name in UI
avatar_url: /static/avatars/critic.gif  # optional — path or URL to avatar image
evolves: true              # optional — whether this persona receives ## Learned sections (default: true)
congress: true             # optional — whether this persona is selectable for congress (default: true)
hidden: false              # optional — if true, excluded from public UI listings (default: false)
label: "[critic]"          # optional — trigger label for direct invocation (e.g. [critic] question)
traits: [perfectionist, unsparing, direct]  # optional — character trait tags (informational)
---
```

### Field Descriptions

| Field | Required | Description |
|---|---|---|
| `status` | yes | Eligibility for congress — see Status Values |
| `name` | yes | Slug matching the filename (no extension). Used as DB key and API id. |
| `display_name` | yes | Full display name shown in UI and Discord thread headers |
| `role` | yes | Short role description (1 line). Shown in the personas table. |
| `model` | yes | Model alias or full model ID. See Model Aliases below. |
| `sex` | no | `male`, `female`, or `nonbinary`. Used for display. |
| `title` | no | One-word persona title (e.g. "Perfectionist", "Moderator"). Shown in congress circle. |
| `avatar_url` | no | Path or URL to avatar image. If omitted, falls back to emoji. |
| `evolves` | no | `true` (default) — persona can receive `## Learned` sections. Set `false` for personas that must never change (e.g. chairman). |
| `congress` | no | `true` (default) — persona is selectable for congress. Set `false` for support personas not meant to debate. |
| `hidden` | no | `false` (default) — if `true`, persona is excluded from public listings. |
| `label` | no | Discord trigger label for direct invocation (e.g. `[critic]`). Used by the `[persona-name] <question>` dispatch pattern. |
| `traits` | no | Array of character trait keywords (informational, not used programmatically). |

---

## Status Values

| Value | Meaning |
|---|---|
| `eligible` | Active persona. Can be selected for any congress session (standard or meme). Subject to evolution verdicts (EVOLVE/RETAIN/RETIRE). |
| `meme` | Retired persona. Available in meme congress and show trials. Excluded from standard congress seat selection. Can be reinstated by changing status back to `eligible`. |
| `moderator` | Special status for the chairman only. Always present in every congress; moderates and synthesizes; never evolves; never subject to RETIRE verdict. |

**Note:** Legacy values `active` and `fired` exist in the DB for historical records. The UI normalizes `fired`/`retired` and `ineligible` → `meme`, `active` → `eligible`.

---

## Model Aliases

The congress system maps short aliases at inference time. All Claude models use the CLI with short names (`haiku`, `opus`, `sonnet`):

| Alias | Resolves to |
|---|---|
| `claude` | haiku (default Claude, via CLI) |
| `haiku` | haiku (via CLI) |
| `opus` | opus (via CLI) |
| `sonnet` | sonnet (via CLI) |
| `gemini` | gemini-2.5-flash |
| `grok` | grok-3-mini |
| Full model ID | Used as-is |

---

## How Evolution Works

After each congress session, the chairman (Ibrahim) issues evolution verdicts for each debater:

- **RETAIN** — no change. Persona is working as intended.
- **EVOLVE** — persona learned something. A `## Learned (YYYY-MM-DD)` section is appended to the end of the prose body in the MD file. The persona retains this learning in future sessions.
- **RETIRE** — persona is retired. `status` is set to `meme` in the frontmatter. They are removed from standard congress selections but remain available for meme congress and show trials.

Evolution verdicts and learned sections are stored both in the persona's MD file and in the session JSON under the `evolution` key.

Personas with `evolves: false` are never given EVOLVE or RETIRE verdicts by the chairman.

### Reinstatement

A retired (meme) persona can be reinstated by:
1. Changing `status: meme` back to `status: eligible` in their MD file
2. Resyncing the DB (or using the Personas tab in the congress UI)

The bar for reinstatement is high: there must be a **concrete demonstrated gap** — a specific congress where their lens would have changed the outcome and no active persona could cover it. Nostalgia and slow news cycles are not sufficient. See the Congressional Reform Rationale section below for the full process.

---

## Congressional Reform Rationale

This section documents *why* certain design decisions were made, not just what they are. Future maintainers and personas reading this file should understand the reasoning behind the system's current shape.

### Status vocabulary: eligible / meme / moderator

The original system used `active`, `fired`, and `severance` as status values. These were replaced, and then `ineligible` was further renamed to `meme`:

1. **Semantic clarity.** `meme` captures the actual role of retired personas: they're legends, characters, available for meme proceedings and show trials, but not standard deliberation.
2. **Unified bucket.** Previously `ineligible` was a dead end. `meme` is an active status — personas with this status participate in meme congress and show trials.

### "Fire" became "retire"

The FIRE verdict label has been fully replaced by RETIRE across the codebase. Retiring a persona means their perspective is no longer serving the congress, not that they failed or were punished. The word "retire" better fits the model — a retired perspective can return if the gap it fills becomes real again. Legacy session JSON files may still contain `"fired"` keys; all readers accept both `retired` and `fired` for backward compatibility.

### Ibrahim's evolution preference ordering

When issuing post-congress evolution verdicts, Ibrahim applies this preference order:

**EVOLVE > RETAIN > FIRE/RETIRE**

The reasoning: a congress where everyone simply did their job and no one learned anything is a less valuable session than one where at least one perspective was sharpened. Ibrahim is biased toward finding the learning in each session. FIRE/RETIRE is the last resort — used only when a persona is actively harming deliberation quality, not merely failing to shine.

### RETAIN is the silent default

If Ibrahim issues no verdict annotation for a persona, the system treats it as RETAIN. No `## Learned` section is appended, no status changes. This keeps session records clean: explicit annotations only appear when something actually changed. The absence of an annotation is itself meaningful data (the persona held their ground, no correction needed).

### Voting system

After Ibrahim synthesizes the debate, each debater casts a vote on the synthesis:

- **AGREE** or **DISAGREE** — no abstentions permitted.
- One sentence of rationale is required with every vote.
- The rationale must be substantive, not performative ("I agree because this seems right" is not acceptable).

The no-abstention rule is intentional: forcing a position prevents personas from hedging and surfaces genuine disagreement. A congress where everyone abstains has produced nothing. A one-sentence rationale requirement keeps votes grounded — it prevents lazy agreement and forces dissenting personas to articulate the specific point of departure.

### Reinstatement policy

Fired (meme) personas stay retired until there is a **demonstrated gap** — a concrete congress where their specific lens would have changed the outcome and no active persona could fill it.

The bar is deliberately high:
- Nostalgia is not sufficient.
- A slow news cycle with nothing interesting to debate is not sufficient.
- The test is: *can you name the argument only they can make?* If not, they stay on the bench.

**Process when the bar is met:**
1. A congress occurs where the gap is concretely felt.
2. Ibrahim decides reinstatement after that congress.
3. The reinstated persona gets one probationary session.
4. A RETAIN or FIRE verdict is issued at the end of the probationary session — no rolling amnesty.

---

## How to Create a New Persona

### Via the UI (recommended)

1. Go to `clung.us/congress` and click the **Personas** tab
2. Click **+ New Persona**
3. Fill in all required fields: slug, display name, model, role
4. Write the system prompt in the text area — this is the full persona body (no frontmatter)
5. Click **Save**

The system creates both the DB entry and the MD file.

### Via the file system

1. Create `/home/clungus/work/bigclungus-meta/agents/<slug>.md` with the YAML frontmatter and prose body:

```markdown
---
status: eligible
name: skeptic
display_name: Vera the Skeptic
role: Systematic doubt and assumption-testing
model: claude
sex: female
title: Skeptic
avatar_url: /static/avatars/skeptic.gif
evolves: true
congress: true
label: "[skeptic]"
traits: [questioning, rigorous, precise]
---
Your system prompt prose here. Write in first person. Define the persona's prior, their
conflict mandate, and the specific lens they bring to debates.
```

2. Add the persona to the DB via the PATCH endpoint or via the Personas tab UI (Edit on any existing persona to see the API shape, or POST to `/api/personas`).

3. Commit and push: `git add agents/<slug>.md && git commit -m "feat: add <slug> persona" && git push`

### Notes

- The slug (filename and `name` field) must be lowercase, hyphen-separated, unique.
- The system prompt body should NOT contain YAML frontmatter — only prose and markdown.
- `## Learned (...)` sections are appended automatically by the evolution system; do not write them manually unless bootstrapping.
- If you set `congress: false`, the persona will exist in the system but won't be selected for debates. Useful for support or experimental personas.
