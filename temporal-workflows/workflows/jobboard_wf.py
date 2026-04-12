"""
Temporal workflow: Job Board research and scoring.

Runs periodically (every 12 hours) to research new job postings,
score them for relevance, insert into SQLite, and notify Discord
about high-relevance matches.
"""

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.jobboard_act import (
        enrich_companies,
        fetch_existing_jobs,
        get_unenriched_companies,
        insert_new_jobs,
        notify_discord_new_jobs,
        research_and_score_jobs,
        update_company_data,
    )


@workflow.defn
class JobBoardWorkflow:
    @workflow.run
    async def run(self) -> dict:
        """
        Run one job board research cycle:
        1. Fetch existing jobs for dedup
        2. Research and score new jobs via Claude
        3. Insert new jobs into SQLite
        4. Notify Discord of high-relevance finds
        """
        # Step 1: Fetch existing jobs
        existing_jobs = await workflow.execute_activity(
            fetch_existing_jobs,
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=RetryPolicy(maximum_attempts=2),
        )
        workflow.logger.info("Fetched %d existing jobs for dedup", len(existing_jobs))

        # Step 2: Research and score new jobs (long timeout — Claude CLI call)
        try:
            new_jobs = await workflow.execute_activity(
                research_and_score_jobs,
                existing_jobs,
                start_to_close_timeout=timedelta(seconds=300),
                retry_policy=RetryPolicy(maximum_attempts=2),
            )
        except Exception as e:
            workflow.logger.error("Research activity failed: %s", e)
            return {"error": str(e), "existing_count": len(existing_jobs), "new_count": 0, "inserted": 0}

        workflow.logger.info("Research returned %d new jobs", len(new_jobs))

        if not new_jobs:
            return {"existing_count": len(existing_jobs), "new_count": 0, "inserted": 0}

        # Step 3: Insert new jobs into SQLite
        inserted = await workflow.execute_activity(
            insert_new_jobs,
            new_jobs,
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=RetryPolicy(maximum_attempts=2),
        )

        # Step 4: Enrich companies that haven't been researched yet
        try:
            unenriched = await workflow.execute_activity(
                get_unenriched_companies,
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=RetryPolicy(maximum_attempts=2),
            )
            if unenriched:
                workflow.logger.info("Found %d unenriched companies", len(unenriched))
                enrichment_data = await workflow.execute_activity(
                    enrich_companies,
                    unenriched,
                    start_to_close_timeout=timedelta(seconds=180),
                    retry_policy=RetryPolicy(maximum_attempts=2),
                )
                if enrichment_data:
                    await workflow.execute_activity(
                        update_company_data,
                        enrichment_data,
                        start_to_close_timeout=timedelta(seconds=30),
                        retry_policy=RetryPolicy(maximum_attempts=2),
                    )
                    workflow.logger.info("Enriched %d companies", len(enrichment_data))
        except Exception as e:
            workflow.logger.warning("Company enrichment failed (non-fatal): %s", e)

        # Step 5: Notify Discord if any high-relevance jobs
        high_rel = [j for j in new_jobs if (j.get("relevance") or 0) > 0.7]
        if high_rel:
            try:
                await workflow.execute_activity(
                    notify_discord_new_jobs,
                    args=[new_jobs, "1485343472952148008"],  # main Discord channel
                    start_to_close_timeout=timedelta(seconds=30),
                    retry_policy=RetryPolicy(maximum_attempts=2),
                )
            except Exception as e:
                workflow.logger.warning("Discord notification failed: %s", e)

        summary = {
            "existing_count": len(existing_jobs),
            "new_count": len(new_jobs),
            "inserted": inserted,
            "high_relevance": len(high_rel),
        }
        workflow.logger.info("Job board cycle complete: %s", summary)
        return summary
