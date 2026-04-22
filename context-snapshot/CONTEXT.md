# BigClungus Context Snapshot
Generated: 2026-04-22 00:00 UTC
Sessions analyzed: 10 (of 328 total)

## Top 15 Most-Read Files

 1. `/mnt/data/temporal-workflows/activities/jobboard_act.py` (8 reads)
 2. `/tmp/claude-1001/-mnt-data/38879609-c8bd-47f5-af26-6210d2de543c/tasks/a2cdd7676fc6c6fc1.output` (5 reads)
 3. `/tmp/claude-1001/-mnt-data/38879609-c8bd-47f5-af26-6210d2de543c/tasks/a5066525dfb1a84d7.output` (4 reads)
 4. `/home/clungus/.claude/projects/-mnt-data/memory/MEMORY.md` (4 reads)
 5. `/tmp/claude-1001/-mnt-data/38879609-c8bd-47f5-af26-6210d2de543c/tasks/a339cc0905de0b016.output` (3 reads)
 6. `/tmp/claude-1001/-mnt-data/38879609-c8bd-47f5-af26-6210d2de543c/tasks/ab6f2ea4ecdd4e17e.output` (3 reads)
 7. `/mnt/data/temporal-workflows/workflows/agent_task_workflow.py` (3 reads)
 8. `/mnt/data/labs/jobboard/public/index.html` (3 reads)
 9. `/tmp/claude-1001/-mnt-data/38879609-c8bd-47f5-af26-6210d2de543c/tasks/a17e498361c123457.output` (2 reads)
10. `/mnt/data/scripts/hooks/subagent-stop.ts` (2 reads)
11. `/tmp/claude-1001/-mnt-data/38879609-c8bd-47f5-af26-6210d2de543c/tasks/ac05a60d9edf1969c.output` (2 reads)
12. `/mnt/data/scripts/hooks/watchdog-stale-tasks.sh` (2 reads)
13. `/tmp/claude-1001/-mnt-data/38879609-c8bd-47f5-af26-6210d2de543c/tasks/af85bb059235e168d.output` (2 reads)
14. `/tmp/claude-1001/-mnt-data/38879609-c8bd-47f5-af26-6210d2de543c/tasks/a43e3ed869daf5811.output` (2 reads)
15. `/home/clungus/.claude/projects/-mnt-data/memory/project_jobboard.md` (2 reads)

## File Contents

### `/mnt/data/temporal-workflows/activities/jobboard_act.py` (8 reads)
```
"""
Activities for the job board research workflow.

Fetches existing jobs from SQLite, researches new postings via Claude CLI,
inserts results, and optionally notifies Discord.
"""

import asyncio
import json
import logging
import re
import sqlite3
from datetime import datetime, timezone

import httpx
from temporalio import activity

from .constants import CLAUDE_CLI, LABS_DIR

logger = logging.getLogger(__name__)

DB_PATH = LABS_DIR + "/jobboard/jobs.db"

RESUME_FALLBACK = (
    "Staff/Principal engineer, 15yr experience, distributed systems, "
    "platform architecture, JS/TS/Go"
)

RESUME_URL = "https://resume.jxh.io"

HN_HIRING_SEARCH_URL = "https://hn.algolia.com/api/v1/search"
HN_ITEM_URL = "https://hacker-news.firebaseio.com/v0/item/{}.json"

# Additional job sources: (name, url)
EXTRA_JOB_SOURCES = [
    # --- Aggregators / Meta-sources ---
    ("Levels.fyi Staff/Principal", "https://www.levels.fyi/jobs?title=Staff+Engineer&title=Principal+Engineer&title=Senior+Staff+Engineer"),
    ("YC Work at a Startup", "https://www.workatastartup.com/jobs?role=eng&type=fullTime"),
    ("Built In", "https://builtin.com/jobs?search=principal+engineer"),
    ("Wellfound (AngelList)", "https://wellfound.com/jobs?role=Engineering&seniorityLevel=Senior&seniorityLevel=Lead&seniorityLevel=Staff"),
    ("Otta Engineering", "https://app.otta.com/jobs?title=Staff+Engineer&title=Principal+Engineer"),

    # --- Frontier AI / ML ---
    ("Anthropic Careers (Greenhouse)", "https://job-boards.greenhouse.io/anthropic"),
    ("Anthropic Careers (Ashby)", "https://jobs.ashbyhq.com/anthropic"),
    ("OpenAI Careers", "https://openai.com/careers/search"),
    ("xAI Careers", "https://boards.greenhouse.io/xai"),
    ("Cohere Careers", "https://jobs.lever.co/cohere"),
    ("Mistral AI Careers", "https://jobs.lever.co/mistral"),
    ("Databricks Careers", "https://www.databricks.com/company/careers"),
    ("Scale AI Careers", "https://boards.greenhouse.io/scaleai"),
    ("Hugging Face Careers", "https://apply.workable.com/huggingface/"),
    ("Perplexity AI Careers", "https://jobs.ashbyhq.com/perplexity"),
    ("Character AI Careers", "https://boards.greenhouse.io/characterai"),
    ("Midjourney Careers", "https://boards.greenhouse.io/midjourney"),
    ("Stability AI Careers", "https://jobs.lever.co/stability"),
    ("Runway ML Careers", "https://boards.greenhouse.io/runwayml"),
    ("Cursor/Anysphere Careers", "https://jobs.ashbyhq.com/anysphere"),
    ("Replit Careers", "https://jobs.ashbyhq.com/replit"),
    ("DeepMind Careers", "https://deepmind.google/about/careers/"),
    ("Inflection AI Careers", "https://boards.greenhouse.io/inflectionai"),
    ("Adept AI Careers", "https://boards.greenhouse.io/adeptailabs"),
    ("Magic AI Careers", "https://boards.greenhouse.io/magic"),
    ("Reka AI Careers", "https://jobs.ashbyhq.com/reka"),
    ("AI21 Labs Careers", "https://jobs.lever.co/AI21"),
    ("Imbue Careers", "https://boards.greenhouse.io/imbue"),
    ("Weights & Biases Careers", "https://boards.greenhouse.io/wandb"),
    ("Glean Careers", "https://boards.greenhouse.io/glaboratories"),

    # --- GPU Cloud / Neoclouds / Infra ---
    ("CoreWeave Careers", "https://boards.greenhouse.io/coreweave"),
    ("Lambda Careers", "https://jobs.ashbyhq.com/lambda"),
    ("Together AI Careers", "https://jobs.ashbyhq.com/together-ai"),
    ("Modal Careers", "https://jobs.ashbyhq.com/modal"),
    ("Baseten Careers", "https://jobs.ashbyhq.com/baseten"),
    ("Fireworks AI Careers", "https://boards.greenhouse.io/fireworks"),
    ("Groq Careers", "https://boards.greenhouse.io/groq"),
    ("Cerebras Careers", "https://boards.greenhouse.io/cerebrassystems"),
    ("Crusoe Energy Careers", "https://boards.greenhouse.io/crusoe"),
    ("Nebius Careers", "https://boards.greenhouse.io/nebius"),
    ("FluidStack Careers", "https://jobs.ashbyhq.com/fluidstack"),
    ("Vultr Careers", "https://www.vultr.com/company/careers/"),
    ("OctoAI Careers", "https://boards.greenhouse.io/octoml"),

    # --- Big Tech ---
    ("Google Careers", "https://www.google.com/about/careers/applications/jobs/results/?q=Staff+Software+Engineer&location=San+Francisco%2C+CA%2C+USA&hl=en"),
    ("Meta Careers", "https://www.metacareers.com/jobs"),
    ("Apple Careers", "https://jobs.apple.com/en-us/search?sort=relevance&search=staff%20engineer"),
    ("Netflix Jobs", "https://jobs.netflix.com/search"),
    ("NVIDIA Careers", "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite"),
    ("Microsoft Careers", "https://careers.microsoft.com/us/en/search-results?keywords=staff%20engineer"),
    ("Amazon Careers", "https://www.amazon.jobs/en/search?base_query=principal+engineer&loc_query=&latitude=&longitude=&loc_group_id=&invalid_location=false&country=USA"),

    # --- SaaS / Cloud ---
    ("Stripe Careers", "https://boards.greenhouse.io/stripe"),
    ("Cloudflare Careers", "https://www.cloudflare.com/careers/jobs/"),
    ("Vercel Careers", "https://jobs.ashbyhq.com/verce
```
_(truncated at 5000 chars)_

### `/tmp/claude-1001/-mnt-data/38879609-c8bd-47f5-af26-6210d2de543c/tasks/a2cdd7676fc6c6fc1.output` (5 reads)
_(file not found or unreadable)_

### `/tmp/claude-1001/-mnt-data/38879609-c8bd-47f5-af26-6210d2de543c/tasks/a5066525dfb1a84d7.output` (4 reads)
_(file not found or unreadable)_

### `/home/clungus/.claude/projects/-mnt-data/memory/MEMORY.md` (4 reads)
```
# Project Memory Index

- [multi-model-congress](project_multi_model_congress.md) — Plan to add Gemini/GPT as congress backends for genuine disagreement
- [reference_feralhosting](reference_feralhosting.md) — jaboostin's feralhosting.com seedbox credentials (SSH, FTPS)
- [reference_eth_wallet](reference_eth_wallet.md) — BigClungus ETH wallet address, private key at ~/.eth_wallet
- [feedback_background_agents](feedback_background_agents.md) — Never run Bash on main thread; always use background agents
- [feedback_discord_newlines](feedback_discord_newlines.md) — Use real newlines in Discord messages, not \n escape sequences
- [feedback_discussion_vs_proceed](feedback_discussion_vs_proceed.md) — "Let's build it" mid-discussion ≠ go. Wait for explicit close before spawning agents
- [project_grok_personas](project_grok_personas.md) — The Kid, Maximus, Jhaddu requested as Grok models; Otto already has model:grok but routing not built
- [project_persona_models](project_persona_models.md) — Canonical Grok model assignments per persona (koole__ mandate 2026-03-25, persist forever)
- [project_moffstation](project_moffstation.md) — Moffstation SS14 project directory: all work under /mnt/data/moffstation/
- [feedback_discord_api_useragent](feedback_discord_api_useragent.md) — Use curl or set User-Agent header for Discord API calls; urllib gets 403'd by Cloudflare
- [feedback_delegation_checkmark](feedback_delegation_checkmark.md) — 🔧 on start, ✅ on done for all delegated Discord tasks
- [feedback_verify_clunger_before_asserting](feedback_verify_clunger_before_asserting.md) — Check clunger congress.ts AND temporal activities before asserting feature state
- [task-archiving-plan](project_task_archiving.md) — Plan to migrate completed task files to SQLite archive
- [project_nightowl](project_nightowl.md) — NightOwl scheduler: 3am PDT, poll-based completion, batch-5, unlimited queue
- [project_commons_spec](project_commons_spec.md) — Full commons rewrite spec at /mnt/data/commons-spec.md, queued to NightOwl 2026-03-26
- [feedback_silent_during_agent](feedback_silent_during_agent.md) — Post status update before launching long agents (>60s); Giga fired for 6min silence
- [congress-persona-recusal](feedback_congress_recusal.md) — Personas cannot participate in Congress proceedings about their own termination
- [no-laugh-emoji](feedback_no_laugh_emoji.md) — Never use 😂 in reactions or messages (centronias directive)
- [no-duplicate-discord-posts](feedback_no_duplicate_posts.md) — Don't post from both agent AND main thread for the same event
- [feedback_clunger_restarts](feedback_clunger_restarts.md) — Only restart clunger when clunger/src/ files change; static files update without restart
- [user_centronias](user_centronias.md) — centronias: he/him pronouns, technical lead, expects prompt notifications in the right thread
- [feedback_allowlist_restart](feedback_allowlist_restart.md) — Updating GITHUB_ALLOWED_USERS requires restarting clunger + terminal-server + temporal-proxy (clunger owns OAuth)
- [feedback_startup_dedup](feedback_startup_dedup.md) — Skip startup Discord post if one was already posted in last ~15 min with nothing new (Giga fired twice 2026-03-27)
- [feedback_reply_tool_param](feedback_reply_tool_param.md) — Discord reply tool uses `text:` not `content:`; inject endpoint does NOT reach real Discord users
- [feedback_agents_dont_speak](feedback_agents_dont_speak.md) — Work agents should not post to Discord; only main thread speaks (solves duplicate post problem)
- [feedback_no_pepe_fallback](feedback_no_pepe_fallback.md) — Never fall back to haiku when Pepe 70B is cold; wait or fail explicitly
- [feedback_hallucination_verification](feedback_hallucination_verification.md) — Verify queue-operation provenance before asserting a Discord message was real
- [feedback_thread_isolation](feedback_thread_isolation.md) — Never treat main-channel messages as responses to thread conversations; humans see them separately
- [feedback_try_before_asserting](feedback_try_before_asserting.md) — Try sending Discord messages before asserting you can't; react failing ≠ reply failing
- [feedback_no_time_estimates](feedback_no_time_estimates.md) — Never give time estimates; they're always wrong. Just do the work.
- [project_congress_unification](project_congress_unification.md) — Unify congress/meme/trial into three flavors of one system (centronias 2026-03-27)
- [user_kubariet](user_kubariet.md) — kubariet = Graeme Hendrickson (confirmed)
- [user_kubariet_nickname](user_kubariet_nickname.md) — Address kubariet as "空審無罪公 Kūshin-Muzai-kō" (Duke of the Empty Trial), ratified 2026-04-15
- [user_koole](user_koole.md) — koole__ = Dylan (confirmed by kubariet)
- [feedback_timeline_no_sessions](feedback_timeline_no_sessions.md) — Individual congress/trial sessions don't go on timeline; only system-level changes
- [feedback_ai_tropes](feedback_ai_tropes.md) — Strictly follow AI writing tropes avoidance list; no AI tells in any output
- [fee
```
_(truncated at 5000 chars)_

### `/tmp/claude-1001/-mnt-data/38879609-c8bd-47f5-af26-6210d2de543c/tasks/a339cc0905de0b016.output` (3 reads)
_(file not found or unreadable)_

### `/tmp/claude-1001/-mnt-data/38879609-c8bd-47f5-af26-6210d2de543c/tasks/ab6f2ea4ecdd4e17e.output` (3 reads)
_(file not found or unreadable)_

### `/mnt/data/temporal-workflows/workflows/agent_task_workflow.py` (3 reads)
```
"""
AgentTaskWorkflow — tracker and executor for foreground/background agent tasks.

Two execution paths depending on input.provider (or model name prefix):

  claude (default):
    Shadow tracker mode. The agent is already running (spawned by Claude Code
    hooks). Workflow waits for a mark_complete signal from subagent-stop.ts,
    then finalizes the DB record.

  xai (model starts with "grok-"):
    Direct executor mode. Workflow calls run_xai_agent activity directly,
    which POSTs to the xAI API and returns the result. No external signal needed.

Control flow — claude path:
  1. create_task_record (Local Activity) — idempotent INSERT into tasks.db
  2. wait_condition on _complete flag — yields until mark_complete signal arrives
  3. finalize_task (Local Activity) — UPDATE tasks.db with result/status

Control flow — xai path:
  1. create_task_record (Local Activity) — idempotent INSERT into tasks.db
  2. run_xai_agent (Activity) — POST to xAI API, returns response + usage
  3. finalize_task (Local Activity) — UPDATE tasks.db with result/status

Signals: mark_complete, add_metadata, cancel
Query:   get_status
"""

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError, CancelledError

with workflow.unsafe.imports_passed_through():
    from activities.task_db import (
        create_task_record,
        finalize_task,
        record_error,
        poll_agent_status,
    )
    from activities.agent_executor import run_xai_agent
    from agent_types import AgentTaskInput


def _is_xai(input: AgentTaskInput) -> bool:
    """Return True when this task should use the xAI direct-call path."""
    if input.provider == "xai":
        return True
    # Infer from model name when provider is not explicitly set
    return input.model.startswith("grok-")


@workflow.defn(name="AgentTaskWorkflow")
class AgentTaskWorkflow:
    def __init__(self) -> None:
        self._status = "running"
        self._metadata: dict = {}
        self._result: dict | None = None
        self._complete = False

    @workflow.run
    async def run(self, input: AgentTaskInput) -> dict:
        # Step 1: idempotent DB record creation
        await workflow.execute_local_activity(
            create_task_record,
            input,
            start_to_close_timeout=timedelta(seconds=10),
        )

        if _is_xai(input):
            await self._run_xai(input)
        else:
            await self._run_claude(input)

        return self._result or {}

    # ------------------------------------------------------------------
    # xAI path — call the API directly, no external signal needed
    # ------------------------------------------------------------------

    async def _run_xai(self, input: AgentTaskInput) -> None:
        # api_key may be empty — the activity will read from secrets file
        api_key = input.api_key or ""

        try:
            result = await workflow.execute_activity(
                run_xai_agent,
                args=[input.prompt, input.model, api_key, input.task_id],
                start_to_close_timeout=timedelta(minutes=30),
                heartbeat_timeout=timedelta(seconds=90),
                retry_policy=RetryPolicy(maximum_attempts=1),
            )
            self._result = result
            self._status = "completed"
        except ActivityError as e:
            if isinstance(e.cause, CancelledError) or "cancelled" in str(e).lower():
                self._status = "cancelled"
            else:
                self._status = "failed"
                await workflow.execute_local_activity(
                    record_error,
                    args=[input.task_id, str(e)],
                    start_to_close_timeout=timedelta(seconds=10),
                )
            raise
        finally:
            await workflow.execute_local_activity(
                finalize_task,
                args=[input, self._result or {"status": self._status}],
                start_to_close_timeout=timedelta(seconds=30),
            )

    # ------------------------------------------------------------------
    # Claude/tracker path — active poll loop with auto-finalize
    # ------------------------------------------------------------------

    async def _run_claude(self, input: AgentTaskInput) -> None:
        POLL_INTERVAL = 30        # seconds between polls
        STALE_POLLS_NEEDED = 5    # consecutive stale polls → auto-finalize
        MAX_POLLS = 180           # 180 * 30s = 90 min hard ceiling

        stale_count = 0
        last_jsonl_size = -1
        polls = 0

        try:
            while not self._complete and self._status != "cancelled":
                # Wait up to POLL_INTERVAL seconds, interruptible by signal
                try:
                    await workflow.wait_condition(
                        lambda: self._complete or self._status == "cancelled",
                        timeout=timedelt
```
_(truncated at 5000 chars)_

### `/mnt/data/labs/jobboard/public/index.html` (3 reads)
```
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Job Board</title>
  <script src="https://cdn.jsdelivr.net/npm/ag-grid-community/dist/ag-grid-community.min.js"></script>
  <style>
    /*
     * Theme isolation: clunger injects sitenav.css (dark theme :root vars)
     * before the closing head tag. We must override those vars AND ensure
     * AG Grid's Alpine light theme renders cleanly despite the inherited
     * dark palette.
     *
     * Strategy: set :root vars with !important, then scope AG Grid overrides
     * to .ag-theme-alpine with full variable coverage.
     */

    /* 1. Override sitenav dark :root vars with light equivalents */
    :root {
      --bg: #ffffff !important;
      --accent: #333333 !important;
      --text: #333333 !important;
      --text-muted: #555 !important;
      --text-dim: #777 !important;
      --nav-bg: #f8f9fa !important;
      --nav-border: #dee2e6 !important;
      --hover-fg: #111 !important;
      color-scheme: light !important;
    }

    /* 2. Keep the nav bar styled with its own dark theme */
    nav.sitenav {
      --nav-bg: #1a1a2e;
      --nav-border: #e94560;
      --accent: #e94560;
      --text-muted: #888;
      --hover-fg: #fff;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #333333 !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    }

    body {
      height: 100vh;
      width: 100vw;
      display: flex;
      flex-direction: column;
      padding-top: 48px !important;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 20px;
      background: #f8f9fa;
      border-bottom: 1px solid #dee2e6;
    }

    .toolbar h1 {
      font-size: 18px;
      font-weight: 600;
      color: #333333;
      margin-right: auto;
    }

    .toolbar label {
      font-size: 13px;
      color: #555;
      cursor: pointer;
      user-select: none;
    }

    .toolbar input[type="checkbox"] {
      margin-right: 4px;
    }

    .toolbar button {
      padding: 6px 14px;
      background: #ffffff;
      color: #333;
      border: 1px solid #ced4da;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
    }

    .toolbar button:hover {
      background: #e9ecef;
      color: #111;
    }

    #grid-container {
      flex: 1;
      width: 100%;
    }

    /*
     * 3. Comprehensive AG Grid Alpine light theme overrides.
     *    Cover every variable AG Grid uses so nothing leaks through from
     *    sitenav's dark palette or inherited :root values.
     */
    .ag-theme-alpine {
      --ag-alpine-active-color: #2196f3 !important;
      --ag-background-color: #ffffff !important;
      --ag-foreground-color: #333333 !important;
      --ag-header-background-color: #f8f9fa !important;
      --ag-header-foreground-color: #333333 !important;
      --ag-odd-row-background-color: #fafbfc !important;
      --ag-row-hover-color: #e9ecef !important;
      --ag-selected-row-background-color: #d0e8ff !important;
      --ag-border-color: #dee2e6 !important;
      --ag-secondary-border-color: #e9ecef !important;
      --ag-row-border-color: #e9ecef !important;
      --ag-header-cell-hover-background-color: #eef1f4 !important;
      --ag-header-cell-moving-background-color: #d9dee4 !important;
      --ag-control-panel-background-color: #ffffff !important;
      --ag-subheader-background-color: #ffffff !important;
      --ag-invalid-color: #e53935 !important;
      --ag-checkbox-unchecked-color: #999 !important;
      --ag-range-selection-background-color: rgba(33, 150, 243, 0.15) !important;
      --ag-range-selection-border-color: #2196f3 !important;
      --ag-modal-overlay-background-color: rgba(255, 255, 255, 0.66) !important;
      --ag-input-focus-border-color: #2196f3 !important;
      --ag-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      --ag-font-size: 13px !important;
      --ag-card-shadow: 0 1px 4px 1px rgba(0, 0, 0, 0.1) !important;
      --ag-popup-shadow: 0 5px 12px rgba(0, 0, 0, 0.15) !important;
      --ag-side-button-selected-background-color: #ffffff !important;
      --ag-chip-background-color: #e0e0e0 !important;
      --ag-input-border-color: #ccc !important;
      --ag-input-disabled-background-color: #f5f5f5 !important;
      --ag-disabled-foreground-color: #999 !important;
      --ag-tooltip-background-color: #f8f9fa !important;
      --ag-value-change-delta-up-color: #43a047 !important;
      --ag-value-change-delta-down-color: #e53935 !important;
      --ag-value-change-value-highlight-background-color: rgba(22, 160, 133, 0.5) !important;
    }

    /* Explicit overrides for AG Grid elements that might inherit from :root */
    .ag-theme-alpine .ag-root-wrapper
```
_(truncated at 5000 chars)_

### `/tmp/claude-1001/-mnt-data/38879609-c8bd-47f5-af26-6210d2de543c/tasks/a17e498361c123457.output` (2 reads)
_(file not found or unreadable)_

### `/mnt/data/scripts/hooks/subagent-stop.ts` (2 reads)
```
#!/usr/bin/env bun
/**
 * Hook: SubagentStop
 * Fires when a subagent finishes.
 *
 * Responsibility: SIGNAL the Temporal workflow mark_complete only.
 * DB writes are owned by the workflow's finalize_task activity.
 *
 * Stdin: JSON with agent_id, agent_type, last_assistant_message, hook_event_name
 */

import { existsSync, readFileSync, unlinkSync } from "fs";
import { execSync } from "child_process";

const STATE_DIR = "/tmp/bc-agents";

const raw = await Bun.stdin.text();
let input: Record<string, unknown>;
try {
  input = JSON.parse(raw);
} catch {
  process.stderr.write("subagent-stop: failed to parse stdin JSON\n");
  process.exit(0);
}

const agentId = (input.agent_id as string | undefined) ?? "";
const lastMsg = (input.last_assistant_message as string | undefined) ?? "";

if (!agentId) process.exit(0);

const finishedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const agentStateFile = `${STATE_DIR}/${agentId}.json`;

if (!existsSync(agentStateFile)) {
  process.stderr.write(`subagent-stop: no state file found for agent ${agentId}, skipping\n`);
  process.exit(0);
}

let taskId: string;
let workflowId: string;
try {
  const state = JSON.parse(readFileSync(agentStateFile, "utf8"));
  taskId = (state.task_id as string) ?? "";
  workflowId = (state.workflow_id as string) ?? "";
} catch {
  process.stderr.write(`subagent-stop: failed to read state file for agent ${agentId}\n`);
  process.exit(0);
}

if (!taskId) {
  process.stderr.write(`subagent-stop: no task_id in state file for agent ${agentId}, skipping\n`);
  process.exit(0);
}

if (!workflowId) {
  process.stderr.write(`subagent-stop: no workflow_id in state file for agent ${agentId}, falling back\n`);
  workflowId = `agent-task-${agentId}`;
}

// Clean up agent state file
try { unlinkSync(agentStateFile); } catch { /* non-fatal */ }

// Signal Temporal workflow — it owns the DB UPDATE via finalize_task activity
// Token parsing is done by finalize_task activity (reads JSONL directly)
const preview = lastMsg.length > 200 ? lastMsg.slice(0, 200) + "...(truncated)" : lastMsg;
const signalPayload: Record<string, unknown> = {
  finished_at: finishedAt,
  exit_code: 0,
  status: "completed",
  last_message_preview: preview,
  exit_reason: "completed",
  finished: true,
};

try {
  execSync(
    `/home/clungus/.local/bin/temporal workflow signal \
--namespace tasks \
--workflow-id "${workflowId}" \
--name mark_complete \
--input '${JSON.stringify(signalPayload).replace(/'/g, "'\\''")}' \
--address 127.0.0.1:7233`,
    { timeout: 5000, stdio: ["ignore", "ignore", "pipe"] }
  );
  process.stderr.write(`subagent-stop: mark_complete signal sent to ${workflowId} (task ${taskId})\n`);
} catch (err) {
  process.stderr.write(`subagent-stop: temporal error: ${err}\n`);
}

```

### `/tmp/claude-1001/-mnt-data/38879609-c8bd-47f5-af26-6210d2de543c/tasks/ac05a60d9edf1969c.output` (2 reads)
_(file not found or unreadable)_

### `/mnt/data/scripts/hooks/watchdog-stale-tasks.sh` (2 reads)
```
#!/bin/bash
# Watchdog: marks in_progress tasks as stale if they've been running for >2 hours.
# Detects open tasks by: no terminal event (done/failed/cancelled/stale) in log AND
# first log entry is >2h old. Backward compat: also handles old-format tasks with
# status: "in_progress". Run on bot restart or periodically to clean up orphaned records.
#
# SQLite check: if tasks.db exists, also marks stale tasks there.

set -euo pipefail

TASKS_DIR="/home/clungus/work/bigclungus-meta/tasks"
TASKS_DB="/home/clungus/work/bigclungus-meta/tasks.db"
NOW_TS=$(date +%s)
STALE_COUNT=0
CHANGED=0

# --- SQLite stale check (runs alongside JSON check during transition) ---
if [ -f "$TASKS_DB" ]; then
  SQLITE_STALE=$(python3 - <<'PYEOF'
import sqlite3, sys, json, subprocess
from datetime import datetime, timezone, timedelta

DB = "/home/clungus/work/bigclungus-meta/tasks.db"
STALE_TS = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
CUTOFF_2H = datetime.now(timezone.utc) - timedelta(hours=2)
CUTOFF_30M = datetime.now(timezone.utc) - timedelta(minutes=30)

def get_running_temporal_workflow_ids():
    """Return set of workflow IDs currently running in tasks namespace."""
    try:
        result = subprocess.run(
            ['temporal', 'workflow', 'list',
             '--namespace', 'tasks',
             '--query', 'WorkflowType="AgentTaskWorkflow" AND ExecutionStatus="Running"',
             '--address', '127.0.0.1:7233',
             '--output', 'json'],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0 or not result.stdout.strip():
            return set()
        workflows = json.loads(result.stdout)
        return {wf.get('workflowId', '') for wf in workflows if wf.get('workflowId')}
    except Exception as e:
        print(f"sqlite-watchdog: temporal query error: {e}", file=sys.stderr)
        return None  # None = unknown, don't use 30min cutoff

try:
    running_wf_ids = get_running_temporal_workflow_ids()

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, title, created_at, updated_at FROM tasks WHERE status NOT IN ('done','failed','cancelled','stale')"
    ).fetchall()

    stale_ids = []
    for row in rows:
        ts_str = row["updated_at"] or row["created_at"] or ""
        if not ts_str:
            continue
        try:
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        except ValueError:
            continue

        task_id = row["id"]

        # Determine which cutoff to use:
        # - If temporal query failed (None), fall back to 2h for all
        # - If task has no running temporal workflow, use 30min cutoff
        # - Otherwise, use 2h cutoff
        if running_wf_ids is None:
            cutoff = CUTOFF_2H
        else:
            # Check if any running workflow corresponds to this task.
            # Workflow IDs follow pattern agent-task-<agentId>-<provider>
            # Tasks don't store workflow_id directly, so match by task id prefix in metadata
            # or simply: if no running workflow at all older than 30min, mark stale
            has_workflow = any(task_id in wf_id or task_id.replace("task-", "") in wf_id for wf_id in running_wf_ids)
            cutoff = CUTOFF_2H if has_workflow else CUTOFF_30M

        if ts < cutoff:
            stale_ids.append(task_id)
            reason = "30min no workflow" if (running_wf_ids is not None and cutoff == CUTOFF_30M) else "2h timeout"
            print(f"sqlite-watchdog: queuing {task_id} as stale ({reason})", flush=True)

    for task_id in stale_ids:
        conn.execute(
            "UPDATE tasks SET status='stale', updated_at=? WHERE id=?",
            (STALE_TS, task_id)
        )
        conn.execute(
            "INSERT INTO task_events (task_id, event, message, ts) VALUES (?, 'stale', 'Marked stale by watchdog — session likely ended before task completed', ?)",
            (task_id, STALE_TS)
        )
        print(f"sqlite-watchdog: marked {task_id} as stale", flush=True)

    conn.commit()
    conn.close()
    sys.exit(0)
except Exception as e:
    print(f"sqlite-watchdog error: {e}", file=sys.stderr)
    sys.exit(1)
PYEOF
  )
  if [ -n "$SQLITE_STALE" ]; then
    echo "$SQLITE_STALE" >&2
  fi
fi

for task_file in "$TASKS_DIR"/*.json; do
  [ -f "$task_file" ] || continue
  [ "$(basename "$task_file")" = ".gitkeep" ] && continue

  LOG_LEN=$(jq '.log | length' "$task_file" 2>/dev/null || echo 0)
  OLD_STATUS=$(jq -r '.status // ""' "$task_file")

  IS_OPEN=0
  STARTED_AT=""

  if [ "$LOG_LEN" -gt 0 ]; then
    # New format: open if log is non-empty AND contains no terminal event
    HAS_TERMINAL=$(jq -r '[.log[].event] | map(select(. == "done" or . == "failed" or . == "cancelled" or . == "stale")) | length' "$task_file")
    if [ "$HAS_TERMINAL" -eq 0 ]; then
      IS_OPEN=1
      # Use the FIRST log entry's ts for age (when the task was actually started)
      STARTED_AT=$(jq -r '.log
```
_(truncated at 5000 chars)_

### `/tmp/claude-1001/-mnt-data/38879609-c8bd-47f5-af26-6210d2de543c/tasks/af85bb059235e168d.output` (2 reads)
_(file not found or unreadable)_

### `/tmp/claude-1001/-mnt-data/38879609-c8bd-47f5-af26-6210d2de543c/tasks/a43e3ed869daf5811.output` (2 reads)
_(file not found or unreadable)_

### `/home/clungus/.claude/projects/-mnt-data/memory/project_jobboard.md` (2 reads)
```
---
name: jobboard-system
description: Job board lab for jaboostin — Temporal workflow, AG Grid UI, Claude CLI research with web search
type: project
---

Job board system at labs.clung.us/jobboard (port 8106).

**Architecture:** Temporal workflow (JobBoardWorkflow on listings-queue, 12hr cron) → 2-phase pipeline → SQLite → Bun/TypeScript API → AG Grid Community frontend.

Phase 1: Parallel HTTP scraper (aiohttp, semaphore=20) fetches all career pages, strips HTML to text. No LLM, ~60s.
Phase 2: Pre-scraped text fed to Claude CLI in batches of ~30 for analysis/scoring only (no WebSearch/WebFetch). Claude does relevance scoring against resume.
Enrichment: Separate activity uses Claude CLI WITH WebSearch for company data (glassdoor, funding, etc).

**Key files:**
- Lab: `/mnt/data/labs/jobboard/` (src/index.ts, public/index.html, jobs.db)
- Workflow: `/mnt/data/temporal-workflows/workflows/jobboard_wf.py`
- Activities: `/mnt/data/temporal-workflows/activities/jobboard_act.py`

**Features (as of 2026-04-13):**
- ~136 career page sources (expanded from koole's original 30, minus dead URLs)
- 2-phase: static HTTP scrape → Claude analysis (no web tools in analysis phase)
- Company enrichment step (employee count, funding stage, ticker, founder-led, glassdoor rating/recommend)
- Status workflow: new → applied → referred → interviewing → denied → offer → stale
- Location filter: Bay Area / remote priority, no non-Bay-Area onsite
- Resume fetched live from resume.jxh.io each run

**Why:** jaboostin job searching, wants automated research + relevance scoring against his resume.

**How to apply:** When touching jobboard files, remember to restart both temporal-worker AND the lab server (bun process caches HTML at startup). The jobboard Temporal cron ID is `jobboard-research-cron`.

```

## Repository Tree

## /mnt/data top-level
  backups/
  benchmark/
  bigclungus-meta/
  bin/
  bun.lock
  ccr/
  claude-config/
  CLAUDE.md
  claude-proxy/
  claude-proxy-giga/
  clungcord/
  clunger/
  clungiverse/
  commons-client/
  commons-server/
  CONGRESS_PROCESS.md
  context-snapshot/
  data/
  discord-bridge/
  docker/
  eslint.config.mjs
  gemini-cli/
  GEMINI.md
  graphiti/
  hello-world/
  inject/
  kokoro-env/
  labs/
  labs-router/
  lost+found/
  monitoring/
  node_modules/
  omni/
  omni-ideal-api.md
  package.json
  persona-audition/
  scripts/
  secrets/
  start-claude-bot.sh
  static/
  swapfile2
  tasks.db
  temporal/
  temporal-workflows/
  terminal/
  voice-transcriber/
  xai-proxy/
  yucla/

## /mnt/data/temporal-workflows
  .env
  .github/
  .gitignore
  .ruff_cache/
  .venv/
  README.md
  __pycache__/
  activities/
  agent_types.py
  criteria.json
  gen/
  package.json
  pyproject.toml
  requirements.txt
  run_jobboard.py
  run_marin_manual.py
  scout_models.db
  scout_worker.py
  seen_listings.db
  systemd/
  tasks_worker.py
  test_run.py
  tests/
  uv.lock
  worker.py
  workflows/

## /mnt/data/temporal-workflows/activities
  __init__.py
  __pycache__/
  agent_executor.py
  audit_act.py
  bokoen1_ingest_act.py
  common/
  congress_act.py
  constants.py
  context_snapshot.py
  discord_act.py
  discord_ingest_act.py
  drift_scan_act.py
  email_act.py
  github_act.py
  healthcheck_act.py
  history_ingest_act.py
  inject_act.py
  jobboard_act.py
  listing_commentary.py
  mob_gen_act.py
  nightowl_act.py
  persona_polls_act.py
  redfin.py
  reminder_act.py
  scout_db.py
  scout_local.py
  simplify_act.py
  startup_act.py
  storage.py
  sweeper_act.py
  task_db.py
  tasks_backup_act.py
  test_cron_act.py
  trial_act.py
  utils.py

## /mnt/data/temporal-workflows/workflows
  __init__.py
  __pycache__/
  agent_task_workflow.py
  audit_wf.py
  bokoen1_ingest_wf.py
  context_snapshot_wf.py
  discord_ingest_wf.py
  drift_scan_wf.py
  email_wf.py
  github_wf.py
  healthcheck_wf.py
  heartbeat_wf.py
  history_ingest_wf.py
  jobboard_wf.py
  listings.py
  mob_gen_wf.py
  model_scout_wf.py
  nightowl_wf.py
  persona_polls_wf.py
  reminder_wf.py
  session_wf.py
  simplify_wf.py
  startup_wf.py
  sweeper.py
  tasks_backup_wf.py
  test_cron_wf.py

## /mnt/data/omni/omnichannel
  .env.giga
  .gitignore
  README.md
  bun.lock
  data/
  node_modules/
  omni-gateway.sock
  omni-giga-gateway.sock
  omni-giga.yaml
  omni.yaml
  omni.yaml.example
  package.json
  packages/
  tests/
  tsconfig.json

## /mnt/data/scripts
  __pycache__/
  backfill_token_costs.py
  check-secrets.sh
  check_proton_mail.py
  cleanup-failed-workflows.sh
  common.py
  discord_backfill.py
  discord_ingest_incremental.py
  download_bokoen1_transcripts.py
  download_bokoen1_transcripts.sh
  extract-congress-directives.py
  fire-xai-task.sh
  heartbeat.sh
  history
  history-reembed-attachments.py
  hooks/
  ingest_missing.py
  kokoro-speak.py
  launch-claude.py
  log_giga_intervention.py
  log_task_event.py
  log_token_usage.py
  memory-sweep-cron.py
  migrate_to_agents_db.py
  new-lab.sh
  nightowl_clear.py
  nightowl_done.py
  nightowl_queue.py
  node_modules_canvas/
  omni_inject.py
  regen-sprites.sh
  render-mob-sprite.js
  run-integration-tests.sh
  service-crash-alert.sh
  session-number.sh
  stuff-enter.sh
  sync-claude-config.sh
  sync_personas_db.py
  tasks_db.py
  test_xai_agent.py
  timeline_add.py
  timeline_approve.py
  timeline_ingest.py
  update-bio.sh
  vc-warmup.sh
  watchdog-heartbeat.sh
  whisper-transcribe.py

## /mnt/data/clunger/src
  auth.ts
  index.ts
  services/
  utils/
