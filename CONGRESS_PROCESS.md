# Congress Process

Full workflow documentation for `CongressWorkflow`. Source of truth is `temporal-workflows/workflows/congress_wf.py` and `temporal-workflows/activities/congress_act.py`.

---

## Trigger

`[congress] <topic>` in Discord fires a `CongressWorkflow` on Temporal task queue `listings-queue`.

Input fields: `topic`, `chat_id`, `message_id` (optional), `discord_user` (optional), `personas` (optional list to override seat selection), `mode` (`standard` or `meme`).

---

## Workflow steps

### 1. `congress_start`
Creates a new session record. Returns `{session_id, session_number}`.

### 2. `congress_identities`
Reads all agent `.md` files from `bigclungus-meta/agents/`, parses YAML frontmatter. Returns list of identity objects with `name`, `display_name`, `status`, `role`, `title`, `model`, etc.

Eligible debaters: `status: eligible`. In meme mode, also `status: meme`. Ibrahim (`name: chairman`) is always excluded from the debater pool and used separately as moderator.

### 3. `congress_select_seats`
Ibrahim curates the roster from the eligible pool. He may pull from the severance bench (ineligible personas) if warranted. Up to 5 debaters. Skipped if the caller passed explicit `personas`.

**Recusal:** Before seating finalizes, any persona whose own name/display_name/role/title appears in the topic alongside firing-related keywords is automatically removed from the debater list.

### 3b. `congress_announce` (bot-initiated only)
If no `message_id` was provided (workflow fired autonomously), posts an announcement to Discord and captures the returned message ID so a thread can be created.

### 3c. `congress_create_thread`
Creates a Discord thread off the triggering message. Falls back to treating `chat_id` as the thread if the message is already inside a thread (Discord error 50024).

### 3d. `congress_frame_topic`
Ibrahim queries Graphiti memory for relevant context and produces a pre-debate context brief. This is passed to all Round 1 debaters so debate is grounded in known facts. Non-fatal if it fails.

---

## 4. Debate rounds (fixed 3-round structure)

### Round 1 — parallel
All debaters respond simultaneously to the topic, receiving Ibrahim's context brief. No cross-reading.

After Round 1 (standard mode only):

**`congress_check_ibrahim`** — Ibrahim reviews the Round 1 summaries and returns one of:
- `CONTINUE` — proceed to Round 2
- `ABORT` — terminate immediately; Ibrahim's reason becomes the verdict. Posts `⛔ Ibrahim has called ABORT` to the thread.
- `REFRAME` — provide a revised topic; Round 1 re-runs with the new framing (max 1 reframe per session). Posts reframe notice to thread, re-runs `congress_frame_topic`, then re-runs Round 1.

In meme mode, `congress_check_ibrahim` is skipped — always CONTINUE.

### Round 2 — sequential rebuttals
Debaters read the thread (prior responses) and respond to each other. Run sequentially.

### Round 3 — sequential final positions
Debaters sharpen or hold their positions after Round 2. Run sequentially.

Ibrahim is silent during all debate rounds — mid-debate synthesis degrades signal.

---

## 5. Chairman synthesis

Ibrahim synthesizes the full debate across all rounds. He receives:
- The pre-debate context brief
- A dissent summary (which debaters expressed significant disagreement)
- Topic-relevant Graphiti context (`congress_graphiti_context`)
- An explicit instruction NOT to include RETAIN/FIRE/EVOLVE verdicts in his synthesis (those are handled separately)

The synthesis becomes the session verdict.

---

## 5b. `congress_vote` — synthesis vote

Each debater votes AGREE or DISAGREE on whether Ibrahim's synthesis captured the actual crux of the debate. Non-binding but posted to the thread and persisted. Runs in parallel.

---

## 6. `congress_evolve` — post-debate evaluation

Ibrahim evaluates each debater and emits a verdict block per persona:

- **RETAIN** — default; solid contribution but no major insight
- **EVOLVE** — genuine learning observed; appends a `## Learned (Congress #N — YYYY-MM-DD)` section to the persona file
- **FIRE** — perspective irredeemably misaligned or redundant; sets `status: ineligible` in persona frontmatter

### CREATE directive

After all PERSONA blocks, Ibrahim may issue one or more CREATE directives. CREATE is a meta-level structural observation: an entire perspective was absent and its absence meaningfully distorted the debate outcome. The bar is high.

Format emitted by Ibrahim:
```
CREATE <slug>
REASON: <one sentence>
display_name: <Name the Adjective>
role: <one-line role>
title: <short title>
model: claude
traits: [trait1, trait2, trait3]
values:
  - x > y
avoid: [thing1, thing2]
prose: |
  <2-4 paragraphs defining voice and role>
```

The activity writes a new file at `agents/<slug>.md` with `status: eligible` and `evolves: true`. Existing slugs are never overwritten. Invalid slugs (non-alphanumeric, path traversal) are skipped with a warning.

---

## 6b. `congress_commit_evolutions`

Persists all evolution results (EVOLVE appends, FIRE status changes, CREATE new files) and records verdicts in `personas.db` via the API.

---

## 6c. `congress_finalize`

PATCHes the session record with `status: done`, the final verdict, evolution results, vote summary, and mode. Single call (not called twice anymore).

---

## 6d. `congress_create_tasks` (standard mode only)

Extracts actionable items from the verdict and creates task JSON files in `bigclungus-meta/tasks/`. Skipped in meme mode.

---

## 7. `congress_report`

Posts the formatted verdict to the Discord thread (or main channel if no thread). Also posts a brief notice to the main channel. Includes fire/evolve/create notices.

---

## Meme mode differences

- `congress_check_ibrahim` skipped (no ABORT/REFRAME)
- `congress_create_tasks` skipped (no task files)
- Session record gets `mode: meme` and `requires_ack: false`
- Report footer: "🃏 meme session — no action items"

---

## Show Trial (`[show-trial]`) — FIRE verdict behavior

Show Trials use a separate `TrialWorkflow`. The `mode` field (passed at trigger time, defaults to `standard`) governs whether a FIRE verdict has real consequences:

- **Standard mode:** a FIRE verdict calls `trial_apply_fire_verdict`, which sets `status: meme` in the defendant persona's frontmatter — identical to what `congress_evolve` does for Congress FIRE verdicts. The persona is removed from future eligible rosters.
- **Meme mode:** a FIRE verdict is **theatrical only**. `trial_apply_fire_verdict` exits immediately without touching any files. No persona is affected. Meme-mode trials are pure spectacle.

This gate lives in `trial_wf.py` (calls the activity only when `final_verdict == "FIRE"`) and is enforced inside `trial_act.py::trial_apply_fire_verdict` (returns early when `mode == "meme"`), providing two layers of protection against accidental file mutation in meme sessions.

---

## Key files

| File | Purpose |
|---|---|
| `temporal-workflows/workflows/congress_wf.py` | Workflow orchestration |
| `temporal-workflows/activities/congress_act.py` | All activity implementations |
| `clunger/src/services/congress.ts` | Congress API endpoints (`/api/congress/*`) |
| `hello-world/congress.html` | Web viewer for session replay |
| `bigclungus-meta/agents/*.md` | All persona definitions |
| `bigclungus-meta/sessions/congress-NNNN.json` | Session files |
