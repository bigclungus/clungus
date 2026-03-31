# Mob Generation Pipeline Plan

Saved from plan agent output. See Discord thread for discussion.
Full plan covers: knowledge graph entity selection, LLM stat/sprite generation,
SQLite caching, Temporal workflow orchestration, client loading screen.

## Quick Summary

1. Pick N entities from FalkorDB knowledge graph (sqrt-weighted by edge count, top 50%)
2. Check SQLite mob_cache — skip already-generated entities
3. Fan out Temporal activities for uncached entities (parallel LLM calls for stats + sprites)
4. Cache results in mob_cache table
5. Load into game via MobRegistry (same pattern as LootRegistry)
6. Client shows progress bar during generation, renders sprites when available

## Build Phases

- Phase A: Cache layer + MobRegistry (no LLM, seed with existing variants)
- Phase B: Temporal workflow + stat generation
- Phase C: Sprite generation + client sprite rendering
- Phase D: Polish (run tracking, blocklist, error handling)

See /mnt/data/clungiverse-plan.md for the full game plan.
