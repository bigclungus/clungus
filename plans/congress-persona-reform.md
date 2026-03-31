# Congress & Persona State Reform

**Created:** 2026-03-25
**Requested by:** centronias
**Thread:** #congress-+-persona-state-reform

---

## Problem 1: Persona Single Source of Truth

### Current state
Persona data lives in two places:
- **YAML frontmatter** in `bigclungus-meta/agents/active/*.md` — used by the congress system for debate identity, model assignment, stats
- **SQLite (`personas.db`)** — read by `serve.py`/clunger API for the web UI and persona endpoints

These are synced by `sync_personas_db.py`, a standalone script. Nothing calls it automatically. After evolution runs (which mutate YAML), the DB is stale until the next manual invocation or restart.

### The question centronias raised
The MD files are genuinely valuable — they ARE the persona (system prompt + identity prose). SQLite is just a metadata index. If "everything in the DB" means moving the prose there too, that's untenable. But if it means making SQLite the authoritative index with YAML as the prose source, that's workable.

### Proposed resolution
**YAML is source of truth for persona identity and prose. SQLite is a read-through cache, rebuilt automatically.**

Concretely:
1. Call `sync_personas_db.py` at the end of every `congress_commit_evolutions()` activity (currently it mutates YAML but never syncs)
2. Call it on `website.service` / `clunger.service` startup (already partially done but not guaranteed)
3. Consider making `_PERSONA_META` in `serve.py` / the equivalent in clunger invalidate-on-request rather than a stale module-level cache

**What NOT to do:** Don't migrate prose into SQLite. The MD files are the prompts. Keep them.

---

## Problem 2: Congress-Generated Tasks Have No Owner or Follow-Through

### Current state
`congress_create_tasks()` in `congress_act.py`:
1. Calls hiring-manager to extract 0–3 action items from the verdict
2. Writes JSON task files to `bigclungus-meta/tasks/`
3. Logs "started" + "milestone" immediately at creation time
4. **Stops there.** No injection, no owner, no follow-through mechanism.

Result: tasks sit orphaned in the tasks directory indefinitely. The watchdog used to miss them (now fixed for the `last-event != started` case), but they still never get executed.

### Who creates them
`congress_act.py:congress_create_tasks()` — called from `congress_wf.py` at the end of each congress, after `congress_evolve` and before `congress_finalize`.

### Proposed resolution
**After writing the task JSON, inject a prompt into BigClungus via the Discord inject endpoint so it picks up and executes the task.**

Concretely, at the end of `congress_create_tasks()`, after writing all task files:
```python
for task in created_tasks:
    inject_message = (
        f"[congress-task] Congress #{session_number} generated a task for you to execute:\n"
        f"**{task['title']}**\n{task['body']}\n"
        f"Task ID: {task_id}\nPlease spin up a background agent to handle this."
    )
    # POST to http://127.0.0.1:9876/inject with the inject secret
```

This turns congress verdicts into actual execution, not just logged intentions.

**Alternatively (lighter):** Don't auto-execute — instead inject a prompt asking BigClungus to review the tasks and decide whether to act on them. Gives a human checkpoint while still closing the loop.

**Default owner:** BigClungus (me). Congress tasks that require human decision (e.g. "hire a new persona") should be flagged as such in the task body so I know not to autonomously execute them.

---

## Open Questions

1. Should congress tasks be auto-executed or human-approved? Some verdicts produce tasks that are clearly mine to run (fix a bug, update a script). Others require framer input (add a persona, change policy). The task body could include a `requires_approval: true` flag.

2. For persona single source of truth: who owns the sync? Currently it's implicit. Should it be a Temporal activity, a file watcher, or just an explicit call at every mutation site?

3. The `sync_personas_db.py` script — does it handle the full lifecycle (new personas, evolved personas, fired personas)? Worth auditing before depending on it more heavily.

---

## Implementation Order

1. ~~**Fix persona sync** — add `sync_personas_db.py` call at end of `congress_commit_evolutions()`. Low effort, high correctness value.~~ **DONE 2026-03-25** — Fixed path from `/mnt/data/hello-world/sync_personas_db.py` (wrong) to `/mnt/data/scripts/sync_personas_db.py` (correct).
2. ~~**Task injection** — add inject call at end of `congress_create_tasks()`. Requires deciding on auto-execute vs. human-checkpoint model first.~~ **DONE 2026-03-25** — Added `requires_approval` boolean field to task JSON; inject messages now use `[task-auto]` / `[task-approval-needed]` prefixes.
3. **Cache invalidation** — make `_PERSONA_META` in clunger/serve.py refresh on request or on file change. Medium effort.
