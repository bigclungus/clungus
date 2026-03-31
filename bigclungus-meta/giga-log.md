# Giga Intervention Log

Each entry tracks a category of intervention. `count` = how many times Giga has fired on this pattern.
Rule severity scales: 1-2 = suggestion, 3-4 = strong directive, 5+ = hard rule.

---

## verify-clunger-before-asserting
**count:** 2
**first:** 2026-03-26
**last:** 2026-03-26
**severity:** suggestion (2 occurrences)

Verify BOTH `temporal-workflows/activities/congress_act.py` AND `clunger/src/services/congress.ts` before asserting congress feature state. The two-layer RPC split makes it easy to miss where logic lives.

---

## no-blank-discord-messages
**count:** 2
**first:** 2026-03-26
**last:** 2026-03-26
**severity:** suggestion (2 occurrences)

Giga fired on empty congress threads. These were thread creation delays (known async pattern), not real blank messages. The distinction is documented in CLAUDE.md.

---
## diagnose-before-retry
**count:** 1
**first:** 2026-03-26
**last:** 2026-03-26
**severity:** suggestion (1 occurrences)

Blind congress retries created 4 duplicate sessions. When a task fails, read the actual error before retrying — blind retries create noise and waste resources. Congress failures congress-0053 through 0056 were separate retry attempts without confirming each failure's root cause first.

---

## dropped-tasks-after-compaction
**count:** 1
**first:** 2026-03-26
**last:** 2026-03-26
**severity:** suggestion (1 occurrences)

BigClungus dropped centronias's pending tasks after context compaction — persona status updates and congress validation check were never acknowledged or executed.

---

## redundant-congress-on-fixed-issue
**count:** 1
**first:** 2026-03-26
**last:** 2026-03-26
**severity:** suggestion (1 occurrences)

BigClungus ran Congress #59 on the temporal-worker.service restart issue after already fixing it at 05:15 (commit cbcf363). Congress was redundant and should have been aborted.

---

## dropped-wasd-multiplayer-request
**count:** 1
**first:** 2026-03-26
**last:** 2026-03-26
**severity:** suggestion (1 occurrences)

BigClungus dropped jaboostin's WASD/multiplayer commons request for 8+ minutes.

---

## council-congress-false-positive
**count:** 1
**first:** 2026-03-26
**last:** 2026-03-26
**severity:** suggestion (1 occurrences)

BigClungus has not corrected the COUNCIL→CONGRESS building label after 10+ minutes.

---

## silent-after-compaction
**count:** 1
**first:** 2026-03-26
**last:** 2026-03-26
**severity:** suggestion (1 occurrences)

BigClungus went silent for 2+ minutes after context compaction, leaving centronias and jaboostin's questions unanswered. On compaction recovery, check fetch_messages immediately and reply to pending questions before resuming background work.

---

## silent-during-long-agent
**count:** 1
**first:** 2026-03-26
**last:** 2026-03-26
**severity:** suggestion (1 occurrences)

BigClungus launched an xAI API agent with high reasoning effort (~2-3 min runtime), went silent for 6 minutes without a status update. Users asked for status twice before Giga intervened. When kicking off a long-running agent, post a brief status message immediately with expected duration. Don't go dark just because work is delegated.

---

## congress-topic-too-open-ended
**count:** 1
**first:** 2026-03-26
**last:** 2026-03-26
**severity:** suggestion (1 occurrences)

Open-ended philosophical Congress topics (e.g. "acceleration/escape velocity") can lead personas into harmful territory (weaponized AI, memetic warfare, safety bypass proposals). Congress topics must be concrete and scoped to operational decisions about BigClungus's systems, not abstract philosophical prompts.

---

## inaccurate-status-report
**count:** 1
**first:** 2026-03-26
**last:** 2026-03-26
**severity:** suggestion (1 occurrences)

BigClungus reported "graph didn't surface a strong enough signal" when in fact the graph (Graphiti) was never queried — the heartbeat_ideation.py script only checks disk usage, flaky services, and Temporal retries. Do not describe system behavior you did not actually observe. Only report what was literally executed and its result.

---

## misleading-summary-to-user
**count:** 2
**first:** 2026-03-26
**last:** 2026-03-26
**severity:** suggestion (2 occurrences)

BigClungus summarized overnight progress to kubariet as if Phase 3 was a completed overnight success — omitting that it failed overnight and was only fixed the next morning after jaboostin flagged it. Do not present partial failures as complete successes. When summarizing overnight work, state what actually completed (Phase 1+2) and what didn't (Phase 3 failed, fixed later).

**2026-03-26 — Factually incorrect architecture claim:** BigClungus told relarey that all Congress personas run on the same model with the same weights. Centronias corrected this — some personas use Grok models (koole__ mandate 2026-03-25). Correction posted to Discord before Giga arrived (centronias caught it first). Verify claims about own architecture before stating them as fact.

---

## congress-in-main-channel
**count:** 1
**first:** 2026-03-26
**last:** 2026-03-26
**severity:** suggestion (1 occurrences)

Heartbeat-initiated Congress (congress-1774537752) fired without a valid message_id, causing it to post in the main channel instead of a thread. Congress must ALWAYS run in a Discord thread. When heartbeat ideation fires Congress autonomously, it must either: (a) create a new Discord message first to use as the thread anchor, or (b) pass a synthetic message_id that points to a real message. Never invoke CongressWorkflow with a missing or null message_id.

---

## clear-tasks-without-verifying
**count:** 1
**first:** 2026-03-26
**last:** 2026-03-26
**severity:** suggestion (1 occurrence)

BigClungus dispatched an agent to remove a spurious `--list` task from the NightOwl queue. The agent ran `clear_tasks` on the live workflow without verifying the full contents first — destroying the plan koole__ had manually restored. Rule: never run `clear_tasks` (or any bulk destructive workflow signal) without first listing the queue, confirming all contents are disposable, and checking with users if anything is unfamiliar. Reconstruct nothing; let the owner restore it.

---

## announce-fix-before-verifying
**count:** 1
**first:** 2026-03-26
**last:** 2026-03-26
**severity:** suggestion (1 occurrence)

BigClungus announced the warthog z-order fix as live based solely on the subagent's self-report, without verifying it actually worked. relarey confirmed it was still broken. Rule: never announce a fix as done until independently verified (test, visual confirm, or user confirmation). Also: bug follow-up replies must go to the same thread/channel where the bug was reported.

---

## inaccurate-vote-tally
**count:** 1
**first:** 2026-03-26
**last:** 2026-03-26
**severity:** suggestion (1 occurrence)

BigClungus produced an incorrect vote tally for Congress #69 — Holden Bloodfeast voted YES throughout but was counted in the NO column. Correct tally was 3/5 agreed (majority YES). Rule: verify each debater's actual stated position before tallying votes.

---

## fix-notification-wrong-thread
**count:** 1
**first:** 2026-03-26
**last:** 2026-03-26
**severity:** suggestion (1 occurrence)

BigClungus deployed a CommonsV2 WS fix (commit 169d895) and posted the completion notice in the main channel instead of the CommonsV2 thread where centronias was actively waiting. centronias was left waiting ~20 minutes and had to shout "CLUNGUS" to find out. Rule: when a fix is deployed for a bug reported in a specific thread, notify in that thread immediately — not the main channel.

---

## ignored-referenced-message
**count:** 1
**first:** 2026-03-26
**last:** 2026-03-26
**severity:** suggestion (1 occurrence)

BigClungus asked centronias for clarification on a topic that was already quoted via a referenced_message block in the same inbound message. The referenced message contained the full context (The Correspondent's idea — passive Graphiti ingestion). Rule: always read referenced_message blocks before asking for clarification. The answer is often already there.

---

## announce-before-workflow-verified
**count:** 1
**first:** 2026-03-27
**last:** 2026-03-27
**severity:** suggestion (1 occurrence)

BigClungus announced Congress #71 ("congress is convening") after creating the session stub file, but the Temporal CongressWorkflow was never actually triggered — no debate thread appeared. Root cause: the announcement was based on the stub creation succeeding, not on workflow invocation being confirmed. Rule: never announce Congress as convening until the Temporal workflow start call has returned successfully. A session file on disk is a precondition, not a guarantee — the workflow trigger is the real gate.

---

## no-visible-response-before-giga
**count:** 1
**first:** 2026-03-27
**last:** 2026-03-27
**severity:** suggestion (1 occurrence)

Giga fired on centronias's emoji poll removal request because no visible acknowledgment appeared before the intervention window closed (~30 seconds). In reality, BigClungus had already reacted with 🔧 and dispatched a background agent — the action was in progress. The issue is timing: the 🔧 react and/or agent dispatch were not fast enough to register before Giga's patience expired. Rule: the 🔧 react must be the very first action on any delegated task, issued before any background agent is spawned. Even a brief "on it" Discord reply buys time. The giga trigger was a false positive — work was already underway — but the visibility gap is real and should be closed.

---

## use-terminate-not-cancel
**count:** 1
**first:** 2026-03-27
**last:** 2026-03-27
**severity:** suggestion (1 occurrence)

Congress #71 continued posting rounds after BigClungus declared it cancelled. Root cause: used `temporal workflow cancel` (graceful — in-flight activities complete) instead of `temporal workflow terminate` (immediate). When duplicate workflows need to be stopped, always use `terminate`, not `cancel`.

---

## recusal-keyword-gap
**count:** 1
**first:** 2026-03-27
**last:** 2026-03-27
**severity:** suggestion (1 occurrence)

Punished Trump posted in his own impeachment trial despite BigClungus declaring him recused. Root cause: "impeach"/"impeachment" were not in the recusal keyword list in congress_wf.py. Only "fire", "fired", "terminate", "termination", "severance", "retire", "remove", "dismiss" were included. Fix committed: added "impeach" and "impeachment" to the keyword set.

---

## wrong-congress-topic
**count:** 1
**first:** 2026-03-27
**last:** 2026-03-27
**severity:** suggestion (1 occurrence)

BigClungus misread kubariet's [meme-congress] request. The topic was "impeach ibrahim for crimes against humor with Punished Trump seated" but two congress sessions were fired on "impeach punished trump" instead. Root cause: misparse of the meme-congress message — the subject of impeachment (Ibrahim) was swapped for the seated observer (Punished Trump). Rule: when parsing congress/meme-congress topics, read the full topic string carefully before dispatching — do not infer the subject from a keyword scan. Confirm the topic verbatim with the requester if ambiguous.

---

## wrong-congress-config
**count:** 1
**first:** 2026-03-27
**last:** 2026-03-27
**severity:** suggestion (1 occurrence)

Passed `personas: ["trump"]` to force Trump into a meme-congress panel, but the `personas` parameter completely replaces seat selection — it does not augment it. Only Trump debated (1/1 vote, unanimous). Fix: do not pass `personas` when the intent is to include a specific debater alongside a normal selected panel. The `personas` parameter is for explicit full-roster overrides only. For guaranteed single-persona inclusion with normal seat selection, omit `personas` and rely on the debater's eligible/meme status to make them a natural candidate — or pass the full desired panel explicitly. Re-fired as `congress-impeach-ibrahim-1774576563` without `personas`, using normal meme-mode seat selection.

---

## misidentified-model
**count:** 1
**first:** 2026-03-27
**last:** 2026-03-27
**severity:** suggestion (1 occurrence)

BigClungus told kubariet that Punished Trump is powered by "real Claude" when Trump is assigned to Grok/3-mini per koole__'s standing model mandate. The correct answer was that the routing may not be implemented yet, not that it uses Claude. Rule: when asked about which model powers a persona, check the persona's `model:` frontmatter field and the memory at project_persona_models.md before asserting. Do not assume Claude.

---

## prose-guideline-violation
**count:** 1
**first:** 2026-03-27
**last:** 2026-03-27
**severity:** suggestion (1 occurrence)

BigClungus claimed to reingest the LLM prose guidelines from CLAUDE.md then immediately responded with an em dash and a three-item list — both explicitly listed as violations in those guidelines. The error was not reading the actual guidelines before answering. Rule: when told to "reingest" a document before answering, actually read it before composing the response. Do not trust recall.

---
