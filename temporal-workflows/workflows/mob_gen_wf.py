"""
Temporal workflow: MobGenerationWorkflow

Selects entities from the FalkorDB knowledge graph, checks for cached stats,
and generates RPG mob stats via OpenAI for any uncached entities.

Supports a progress query so callers can poll completion status.
"""

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy


@workflow.defn
class MobGenerationWorkflow:
    def __init__(self) -> None:
        self._completed = 0
        self._total = 0
        self._current = ""
        self._status = "generating"
        self._results: list[dict] = []

    @workflow.query
    def progress(self) -> dict:
        return {
            "completed": self._completed,
            "total": self._total,
            "current": self._current,
            "status": self._status,
        }

    @workflow.run
    async def run(self, count: int = 30, exclude_names: list | None = None) -> list:
        if exclude_names is None:
            exclude_names = []
        # Step 1: Select entities from graph
        entities = await workflow.execute_activity(
            "select_entities_from_graph",
            args=[count, exclude_names],
            schedule_to_close_timeout=timedelta(seconds=30),
        )

        if not entities:
            self._status = "complete"
            return []

        self._total = len(entities)

        # Step 2: Check cache for already-generated stats
        cached = await workflow.execute_activity(
            "check_mob_cache",
            args=[[e["name"] for e in entities]],
            schedule_to_close_timeout=timedelta(seconds=10),
        )

        cached_results = list(cached.values())
        self._completed = len(cached_results)
        self._results = cached_results

        to_generate = [e for e in entities if e["name"] not in cached]

        if not to_generate:
            self._status = "complete"
            return self._results

        # Step 3: For each entity, generate stats first, then use the LLM-assigned
        # display_name to generate the sprite. Sprite naming must match stats.display_name
        # because the game client loads sprites by slugifying mob.displayName.

        async def process_mob(entity: dict) -> dict:
            stats = await workflow.execute_activity(
                "generate_mob_stats",
                args=[entity["name"], entity.get("summary", "")],
                schedule_to_close_timeout=timedelta(seconds=120),
                retry_policy=RetryPolicy(maximum_attempts=3),
            )

            # Persist stats immediately so future runs can cache-hit
            await workflow.execute_activity(
                "save_mob_stats",
                args=[stats],
                schedule_to_close_timeout=timedelta(seconds=15),
                retry_policy=RetryPolicy(maximum_attempts=3),
            )

            # Generate sprite using the LLM-assigned display_name so the sprite
            # function slug matches what the client looks up (mobSlug(display_name))
            description = (
                f"behavior={stats.get('behavior', '')}, "
                f"HP={stats.get('base_hp', '')}, "
                f"ATK={stats.get('base_atk', '')}, "
                f"DEF={stats.get('base_def', '')}, "
                f"flavor: {stats.get('flavor_text', '')}"
            )
            try:
                await workflow.execute_activity(
                    "generate_mob_sprite",
                    args=[stats["entity_name"], stats["display_name"], description],
                    schedule_to_close_timeout=timedelta(seconds=120),
                    retry_policy=RetryPolicy(maximum_attempts=2),
                )
            except Exception as exc:  # noqa: BLE001
                workflow.logger.warning("Sprite generation failed for '%s': %s", entity["name"], exc)

            self._completed += 1
            self._current = stats.get("entity_name", "")
            self._results.append(stats)
            return stats

        # Process mobs sequentially — running all N mobs concurrently overwhelms
        # the workflow task queue and triggers _DeadlockError (TMPRL1101).
        for entity in to_generate:
            await process_mob(entity)

        self._status = "complete"
        return self._results
