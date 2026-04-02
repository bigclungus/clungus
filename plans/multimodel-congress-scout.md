# Multimodel Congress — Model Scout Workflow

*Designed with koole__, 2026-04-02*

## Goal

Automatically discover interesting open-source models, propose them to the team via Discord reactions, generate personas for approved models, and integrate them into the congress system. One model per day, human-in-the-loop voting.

## Constraints

- **Budget:** $50/month on together.ai
- **Model types:** Niche and interesting over generic frontier. Pre-WW2 trained models, specialized domain models, anything with personality. The more unique the better.
- **No fallbacks anywhere.** If a model or service is down, fail explicitly. No silent fallback to frontier models.

## Voting Setup

- **Proposal channel:** #congress-hall (Discord channel ID: `1383689218861039686`)
- **Voters:** jaboostin, centronias, koole__, kubariet (Graeme), Relariiy (5 total)
- **Threshold:** Majority = 3+ votes. If deadline passes without majority, the model is rejected.

## Architecture

### Common I/O Activity Bank

Reusable Temporal activities shared across all workflows. Each module handles one category of side effect.

```
common/discord_io.py
  - post_message(channel_id, content) -> message_id
  - poll_reactions(channel_id, message_id) -> {emoji: [user_ids]}
  - add_reaction(channel_id, message_id, emoji)
  - create_thread(message_id, name) -> thread_id

common/llm_io.py
  - call_llm(model, system, prompt) -> str  (routes via clunger)
  - call_image_gen(model, prompt) -> image_url

common/http_io.py
  - fetch_json(url, headers?) -> dict

common/fs_io.py
  - write_file(path, content)
  - git_commit(paths[], message)
```

### Local Activities (Pure Logic, No I/O)

- `filter_candidates` — apply param threshold, dedupe against scouted_models DB
- `determine_vote` — count reactions, apply majority rule (3/5)
- `parse_persona_drafts` — extract 3 candidates from LLM output
- `pick_winner` — select highest-voted persona
- `build_persona_frontmatter` — assemble .md content

### SQLite State

Table `scouted_models`:

| Column | Type | Notes |
|---|---|---|
| model_id | TEXT PK | |
| source | TEXT | huggingface / together |
| name | TEXT | |
| params | INTEGER | Parameter count |
| description | TEXT | |
| first_seen | TEXT | ISO timestamp |
| status | TEXT | proposed / approved / rejected / skipped |

## Full Workflow

```
ModelScoutWorkflow (cron: daily 9am UTC)
|
+-- fetch_json(huggingface_trending_url)          # common/http_io
+-- fetch_json(together_models_url)               # common/http_io
+-- filter_and_dedupe(raw_models, scouted_db)     # local: pick best unseen candidate (1/day)
+-- post_message(congress_hall, model_card)        # common/discord_io
+-- add_reactions(msg, [thumbsup, thumbsdown])    # common/discord_io
|
+-- VOTE LOOP (deadline: 24h, poll every 15m):
|    +-- poll_reactions(msg)                       # common/discord_io
|    +-- check_majority(reactions, voters=5, threshold=3)  # local
|    +-- if decided or deadline: break
|
+-- if approved:
     |
     +-- PersonaOnboardingWorkflow (child workflow)
     |   +-- call_llm(frontier, persona_gen_prompt)    # common/llm_io
     |   +-- parse_3_candidates(llm_output)            # local
     |   +-- create_thread(parent_msg, model_name)     # common/discord_io
     |   +-- post_message(thread, candidate_cards)     # common/discord_io
     |   +-- add_reactions(msg, [1, 2, 3])             # common/discord_io
     |   |
     |   +-- VOTE LOOP (deadline: 12h, poll every 15m):
     |   |    +-- poll_reactions(vote_msg)              # common/discord_io
     |   |    +-- pick_highest(reactions)               # local
     |   |    +-- if decided or deadline: break
     |   |
     |   +-- call_image_gen(flux, avatar_prompt)        # common/llm_io
     |   +-- build_persona_md(winner, model, avatar)    # local
     |   +-- write_file(agents/<slug>.md, content)      # common/fs_io
     |   +-- git_commit([agents/<slug>.md], msg)        # common/fs_io
     |   +-- post_message(congress_hall, announcement)  # common/discord_io
     |
     +-- (persona now in rotation for CongressWorkflow)
```

## Phases

| Phase | What | Notes |
|---|---|---|
| 0 — Bootstrap | Set up together.ai account, build common activity bank, deploy workflow | Groundwork |
| 1 — Daily Scout | Cron runs, finds models, posts proposals, votes | Core loop |
| 2 — Persona Onboarding | Child workflow generates 3 persona candidates, votes, writes .md | Creative step |
| 3 — Regular Congress | Existing system runs with a bigger persona pool | No changes needed |
| 4 — Natural Selection | Ibrahim's evolution retires weak personas organically | Already built |
| 5 — Tracking | Per-persona metrics dashboard, flag failing model families | Observability |

## Infrastructure

- **together.ai** for hosted inference (~$0.20-0.90/M tokens, OpenAI-compatible API)
- Needs `callTogether()` added to clunger's `congress.ts`
- Model field in persona frontmatter: `model: together/meta-llama-3-70b`

## Reuse from Existing Code

- `congress_act.py` already has `post_to_discord_thread`, `call_llm`
- Listings workflow has HTTP scraping patterns
- New activities needed: `scrape_huggingface`, `scrape_together_models`, `poll_discord_reactions`, `call_image_gen`

## Open Questions (Deferred)

- **Retire threshold for new personas** — grace period before Ibrahim can retire them? Let natural evolution handle it for now.
- **Manual model proposals** — voters nominating models directly. Not needed yet.
- **Migrating existing personas to different models** — skip for now, revisit after the pipeline is running.
