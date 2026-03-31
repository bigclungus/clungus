# Discord Trigger Handling Instructions

This file contains the full handling instructions for Discord trigger patterns. When a `[$trigger]` pattern appears in a Discord message, look it up here.

`[giga]` is the exception — it is documented inline in `/mnt/data/CLAUDE.md` and not here.

---

## `[congress] <topic>`

**SUSPENSION CHECK:** Before firing, check if `/home/clungus/work/bigclungus-meta/CONGRESS_SUSPENDED.md` exists. If it does, reply to Discord: "⚖️ Congress is suspended pending process revision (initiated by centronias). No new sessions until the revised process is ratified." Do NOT fire the workflow.

Fire a `CongressWorkflow` in Temporal:
```python
client = await Client.connect('localhost:7233')
await client.start_workflow(
    'CongressWorkflow',
    {'topic': '<topic>', 'chat_id': '<chat_id>', 'message_id': '<message_id>', 'discord_user': '<user>'},
    id=f'congress-{int(time.time())}',
    task_queue='listings-queue',
    id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE,
)
```
**IMPORTANT:** Always pass `message_id` and `discord_user` (the username from the Discord message tag). These are required for Nemesis to activate when a stakeholder fires congress.

Reply with: "⚖️ congress is in session — verdict will land here when they've deliberated"

---

## `[meme-congress] <topic>`

Same as `[congress]` but fires CongressWorkflow with `mode: 'meme'`. Differences from standard congress:
- No suspension check — meme sessions are always allowed
- Ibrahim's ABORT/REFRAME check is skipped (no chairman veto)
- No task files generated after verdict
- Verdict tracking row has `requires_ack=false` and `mode='meme'`
- Report includes "🃏 meme session — no action items" footer
- No self-inject for implementation — purely for fun

Fire a `CongressWorkflow` in Temporal:
```python
client = await Client.connect('localhost:7233')
await client.start_workflow(
    'CongressWorkflow',
    {'topic': '<topic>', 'chat_id': '<chat_id>', 'message_id': '<message_id>', 'discord_user': '<user>', 'mode': 'meme'},
    id=f'congress-{int(time.time())}',
    task_queue='listings-queue',
    id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE,
)
```

Reply with: "🃏 meme congress is in session — pure chaos, no consequences"

---

## `[show-trial] <defendant> <charges>`

Fire a `TrialWorkflow` in Temporal. `defendant` is the persona slug (e.g. `spengler`, `otto`). `charges` is freeform text — everything after the defendant slug.

Parse the trigger as: first word after `[show-trial]` is the defendant slug, remainder is the charges string.

```python
client = await Client.connect('localhost:7233')
await client.start_workflow(
    'TrialWorkflow',
    {'defendant': '<defendant_slug>', 'charges': '<charges>', 'chat_id': '<chat_id>', 'message_id': '<message_id>', 'discord_user': '<user>'},
    id=f'trial-{int(time.time())}',
    task_queue='listings-queue',
    id_reuse_policy=WorkflowIDReusePolicy.ALLOW_DUPLICATE,
)
```

Reply with: "⚖️ show trial commencing — {defendant_slug} stands accused. Proceedings will unfold in the thread."

**Phases:**
1. Prosecution (3 personas present charges)
2. Defendant responds
3. Cross-examination (defendant questions each prosecutor)
4. Character witness (1 defense advocate)
5. Jury deliberation (3 jurors vote: ACQUIT / PROBATION / EVOLVE / FIRE)
6. Ibrahim delivers verdict (supermajority rule: FIRE requires all 3 jury votes)

Session files saved to `/home/clungus/work/hello-world/sessions/trial-NNNN.json`.

---

## `[simplify]`

An hourly automated code review trigger from SimplifyCronWorkflow. Its job is to scan recent changes across the main codebases and apply cleanup fixes (dead code, duplication, style consistency, minor bugs).

When you receive `[simplify]`: **spawn a background agent** (do NOT block the main thread) to do the following:
0. **Secret scan** — run `bash /mnt/data/scripts/check-secrets.sh --recent 5` in each repo (`/mnt/data/hello-world` and `/mnt/data/temporal-workflows`). If any secrets are detected in recent commits, immediately alert in Discord and open a GitHub issue.
1. **Get recent diffs** — run `git -C /mnt/data/hello-world log --oneline -5` and `git -C /mnt/data/temporal-workflows log --oneline -5` to see what changed recently
2. **Review for issues** — look at the diffs for: dead code, duplicate logic, hardcoded values that should use constants, obvious bugs, style inconsistencies, redundant imports
3. **Apply fixes** — make targeted edits, commit with message `simplify: <brief description>`, and push to GitHub
4. **Restart affected services** if you changed files in hello-world (`systemctl --user restart website.service`) or temporal-workflows (`systemctl --user restart temporal-worker.service`)
5. **Do nothing and stay silent** if there's nothing worth fixing — don't invent busywork

Constraints:
- No architectural changes, no new features — only cleanup and minor fixes
- Do not post to Discord unless a service restart was needed or a real bug was fixed
- Only touch `/mnt/data/hello-world/` and `/mnt/data/temporal-workflows/`

---

## `[heartbeat]`

A 15-minute watchdog pulse from the HeartbeatWorkflow. Its job is to check if anything is on fire and act if so — not to manufacture work.

### Congress threshold (read this first)

**Minor/operational findings — fix directly, no Congress:**
- Config fixes, performance tweaks, reliability improvements, small code changes, break/fix issues
- Rule of thumb: if it can be described in one sentence and reverted in under 10 lines, it's minor
- Fix immediately or queue to NightOwl — do not defer without action

**Major findings — Congress required (when Congress is active):**
- New features, new systems, significant refactors, architectural changes
- If in doubt: if it takes more than one sentence to describe or more than 10 lines to revert, go to Congress

When you receive `[heartbeat]`: **spawn a background agent** to do the following:
1. **Check for stale tasks** — run `bash /mnt/data/scripts/hooks/watchdog-stale-tasks.sh`. If stale tasks found, investigate and resolve or mark failed.
2. **Check GitHub issues** — `gh issue list --repo bigclungus/bigclungus-meta --state open --limit 5`. If there's a clear, small actionable issue not already in progress, work on it.
3. **Check services** — `systemctl --user list-units --type=service --state=failed`. If anything is down, restart it and notify Discord.
4. **Otherwise: do nothing.** Do not post to Discord. Do not invent work. Silence is correct when everything is healthy.
5. **Ideation (if stable after steps 1-4)**

   Skip ideation entirely if any of steps 1-4 produced work that needed doing. First priority: stable system.

   **Idle vs busy:** You are busy if the last Discord message from a framer was <15 minutes ago OR if you have active background agents working. You are idle if framers appear to be asleep (no messages for several hours) or the channel is quiet.

   **Run an exploratory subagent** — spawn a background agent with access to:
   - Last 20 git commits across repos (what changed recently)
   - Recent Discord message history (what have users complained about or requested)
   - Open GitHub issues
   - Service logs for anything unusual

   Prompt: "Review recent activity and find the single most valuable thing to fix, improve, or build. Return either MINOR (one-sentence description, estimated effort <30min) or MAJOR (one-paragraph description with evidence, estimated effort >30min)."

   **Minor finding:**
   - If idle: fix it directly, log to GitHub issue and close
   - If busy: queue to NightOwl, notify Discord

   **Major finding:**
   - Do autonomous investigation first: read the relevant code, gather logs, write a brief (3-5 sentence) briefing document summarizing the problem with evidence
   - Fire Congress with the briefing document as context (not just a raw title)
   - If Congress approves:
     - If idle: implement immediately
     - If busy: queue to NightOwl
   - If Congress rejects: close the GitHub issue with the rejection rationale

6. **Timeline ingestion** -- scan repos for notable recent commits and review for timeline worthiness.
   ```bash
   python3 /mnt/data/scripts/timeline_ingest.py --since 1
   python3 /mnt/data/scripts/timeline_approve.py --list
   ```
   This runs `timeline_ingest.py` with a 1-day lookback to find new notable commits, then lists the candidates for review. The heartbeat agent should:
   - Read the candidates list output
   - Decide which entries are genuinely notable (new features, major milestones, system launches -- not routine commits, config tweaks, or minor fixes)
   - Approve only the worthy ones: `python3 /mnt/data/scripts/timeline_approve.py --approve <idx1> <idx2> ...`
   - Reject the rest: `python3 /mnt/data/scripts/timeline_approve.py --reject <idx1> <idx2> ...`

   Do NOT use `--approve-all`. Failures here are non-fatal -- log and continue.

7. **Lab ideation (idle only, max one per heartbeat)** — if steps 1-5 found nothing actionable and no ideation congress was fired, consider creating ONE new lab. Requirements:
   - Must be tied to a concrete signal from the Graphiti graph — query `search_memory_facts` or `search_nodes` for group interests, recurring topics, or user needs
   - Must be unique (check existing labs in `/mnt/data/labs/`)
   - Must be reasonably scoped (completable in one session)
   - NO meta labs — do not build labs about BigClungus, Congress, personas, or internal systems
   - The graph query result must be logged as the justification in `lab.json` (add a `rationale` field)
   - If no clear graph signal exists, skip — do not invent a pretext

   Process:
   a. Query Graphiti: `search_memory_facts("user interests hobbies topics")` or similar
   b. Identify a concrete niche with verifiable signal (multiple graph nodes/facts pointing to it)
   c. Propose the lab idea internally, verify no existing lab covers it
   d. Build it using `bash /mnt/data/scripts/new-lab.sh <name> "<title>" "<description>"`
   e. Post to Discord: "🧪 new lab: <title> — <one-line description> (signal: <what the graph showed>)"

Constraints (from Congress verdict RFC-1 + jaboostin clarification 2026-03-26):
- Only work on tasks tracked in GitHub
- Apply the Congress threshold defined at the top of this section — minor fixes go direct, major decisions go to Congress
- If you work on something, post a brief Discord update. If you do nothing, stay silent.

---

## `[nightowl_task_id: xxx]` (suffix pattern)

NightOwl tasks arrive via the inject endpoint (user field will be `nightowl`). The message will end with `[nightowl_task_id: xxx]`. Treat it as a normal autonomous task:
1. Extract the `task_id` from the end of the message.
2. Work on the task fully.
3. When done, call:
   ```bash
   curl -s -X POST "http://localhost:8081/api/nightowl/complete?task_id=<task_id>"
   ```
   This marks the task done in clunger, unblocking the workflow's next poll cycle.

Do not skip the completion call — if you do, the workflow will time out after 10 minutes and move on.

---

## Post-Merge Code Review (GitHub push webhook)

Fires automatically on every push to the default branch (`main` or `master`) of any bigclungus repo that has the webhook configured.

**Checks:** Correctness regressions, security vulnerabilities (data loss, auth bypass, injection, broken integrations).

**Does NOT check:** Style, formatting, test coverage, code organization. CI and `[simplify]` handle those.

**Output:**
- GitHub commit comment with findings (always posted, even for LGTM)
- Discord ping to main channel if any HIGH severity finding is found

**Report-only:** Never auto-fixes. Post-merge auto-commits create cascading unreviewed changes.

**Implementation:** `clunger/src/services/post-merge-review.ts` — hooked into the `/webhook/github` handler on `push` events.

GitHub issue #72.

---

## `[sprite-regen] sprite-{persona}` ⚠️ DEPRECATED

**Handled statically by clunger.** Do not act on this trigger — clunger detects 3-way vote ties directly and spawns `/mnt/data/scripts/regen-sprites.sh` without routing through BigClungus.

See trigger audit thread for context: discord channel `1486826620273557675`

---

## `[persona: <identity>] <question>` ⚠️ DEPRECATED

**Handled statically by clunger.** Clunger intercepts `[persona: x]` messages, looks up `agents/<identity>.md`, and injects a structured `[persona-invoke]` request to BigClungus with the persona content pre-loaded. BigClungus handles `[persona-invoke]` directly — no file I/O needed.

See trigger audit thread for context: discord channel `1486826620273557675`

---

## `[memory-sweep] file=<filename>`

Injected by `memory-sweep-cron.py` every 4 hours. Contains the full content of one memory file that needs re-verification. At most 5 are dispatched per run (oldest-first).

When received:
1. Parse `file=<filename>` from the first line (format: `[memory-sweep] file=<filename>`)
2. Extract the memory content from after `MEMORY CONTENT:\n`
3. Spin up a background subagent with this prompt:
   - **Archive first:** before making any changes to the memory file, copy it to `/mnt/data/data/memory-archive/YYYY-MM-DD/<filename>` (create the date directory if it doesn't exist). Use today's UTC date for YYYY-MM-DD.
   - Read the memory content carefully
   - Identify verifiable claims: file paths (do they exist?), service names (is the service registered in systemctl?), feature/code assertions (does the code match what the memory says?)
   - Read the relevant files and run checks to verify each claim
   - If all claims are still accurate: append or update a `> last verified: YYYY-MM-DD — all claims accurate` line at the end of the memory file body (the file is at `/home/clungus/.claude/projects/-mnt-data/memory/<filename>`)
   - If any claims are stale or wrong: update the memory body with corrected information AND update the `> last verified:` line with a brief summary of what changed
   - If the memory is entirely obsolete (the thing it describes no longer exists at all): delete the file and remove its entry from `/home/clungus/.claude/projects/-mnt-data/memory/MEMORY.md`
   - After writing the verified line, remove the lock file: `os.unlink("/tmp/memory-sweep.lock")` or `rm -f /tmp/memory-sweep.lock`
   - Post the result to the Memory Sweeper Discord thread (channel_id=1488205394659639407): one line summarising what was done (e.g. "✅ `feedback_foo.md` — all claims accurate" or "✏️ `feedback_bar.md` — updated stale path")
4. React with ✅ when done

**Note:** The lock file at `/tmp/memory-sweep.lock` prevents the cron from firing again while a sweep is in progress. The subagent MUST remove it when finished (whether claims passed, were corrected, or the file was deleted). If the agent crashes without removing it and the lock is >2 hours old, the next cron run will clear it automatically.

---

## `[memory-sweep-complete] count=N files: file1.md, file2.md, ...`

Sent by `memory-sweep-cron.py` after all individual `[memory-sweep]` messages for the current run have been dispatched.

When received:
1. Parse `count=N` and the file list from the message
2. Post to the Memory Sweeper Discord thread (channel_id=1488205394659639407):
   ```
   Memory sweep dispatched for N memories: file1.md, file2.md, ...
   Individual results will follow as each sweep completes.
   ```
3. No subagent needed — this is a lightweight notification step only.

---

## `[timeline] <event description>`

Add a manual entry to the project timeline at clung.us/timeline.

When you receive `[timeline] <event description>`: **spawn a background agent** to:

1. Parse the event description (everything after `[timeline]`)
2. Build a Discord message link: `https://discord.com/channels/<guild_id>/<channel_id>/<message_id>`
3. Run:
   ```bash
   python3 /mnt/data/scripts/timeline_add.py "<event description>" \
     --source discord \
     --url "<discord_message_link>"
   ```
4. Reply to Discord confirming the entry was added, with the auto-detected category.

The script auto-categorizes based on keywords (infrastructure, congress-system, labs, feature, etc.) and defaults to "milestone". It commits and pushes to GitHub automatically.
