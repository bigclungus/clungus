"""
Temporal workflow: Job Board research and scoring.

Runs periodically (every 12 hours) to research new job postings,
score them for relevance, insert into SQLite, and notify Discord
about high-relevance matches.

2-phase architecture:
  Phase 1: Static HTTP scraping of all career pages (fast, no LLM)
  Phase 2: Claude analysis of pre-scraped content (no web tools needed)
"""

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.jobboard_act import (
        analyze_scraped_jobs,
        enrich_companies,
        fetch_existing_jobs,
        get_unenriched_companies,
        insert_new_jobs,
        notify_discord_new_jobs,
        scrape_career_pages,
        update_company_data,
    )


@workflow.defn
class JobBoardWorkflow:
    @workflow.run
    async def run(self) -> dict:
        """
        Run one job board research cycle:
        1. Fetch existing jobs for dedup
        2. Scrape all career pages (pure HTTP, no LLM)
        3. Analyze scraped content via Claude (no web tools)
        4. Insert new jobs into SQLite
        5. Enrich companies with missing data
        6. Notify Discord of high-relevance finds
        """
        # Step 1: Fetch existing jobs
        existing_jobs = await workflow.execute_activity(
            fetch_existing_jobs,
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=RetryPolicy(maximum_attempts=2),
        )
        workflow.logger.info("Fetched %d existing jobs for dedup", len(existing_jobs))

        # Step 2: Scrape all career pages (pure HTTP, fast)
        try:
            scraped_content = await workflow.execute_activity(
                scrape_career_pages,
                start_to_close_timeout=timedelta(seconds=180),
                retry_policy=RetryPolicy(maximum_attempts=2),
            )
        except Exception as e:
            workflow.logger.error("Scrape activity failed: %s", e)
            return {"error": f"scrape failed: {e}", "existing_count": len(existing_jobs), "new_count": 0, "inserted": 0}

        workflow.logger.info("Scraped %d career pages", len(scraped_content))

        if not scraped_content:
            workflow.logger.warning("No career pages scraped successfully")
            return {"existing_count": len(existing_jobs), "new_count": 0, "inserted": 0, "scraped": 0}

        # Step 3: Analyze scraped content via Claude (no web tools needed)
        try:
            new_jobs = await workflow.execute_activity(
                analyze_scraped_jobs,
                args=[scraped_content, existing_jobs],
                start_to_close_timeout=timedelta(seconds=1500),
                heartbeat_timeout=timedelta(seconds=600),
                retry_policy=RetryPolicy(maximum_attempts=2),
            )
        except Exception as e:
            workflow.logger.error("Analysis activity failed: %s", e)
            return {"error": f"analysis failed: {e}", "existing_count": len(existing_jobs), "scraped": len(scraped_content), "new_count": 0, "inserted": 0}

        workflow.logger.info("Analysis returned %d new jobs", len(new_jobs))

        if not new_jobs:
            return {"existing_count": len(existing_jobs), "scraped": len(scraped_content), "new_count": 0, "inserted": 0}

        # Step 4: Insert new jobs into SQLite
        inserted = await workflow.execute_activity(
            insert_new_jobs,
            new_jobs,
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=RetryPolicy(maximum_attempts=2),
        )

        # Step 5: Enrich companies that haven't been researched yet
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

        # Step 6: Notify Discord if any high-relevance jobs
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
            "scraped": len(scraped_content),
            "new_count": len(new_jobs),
            "inserted": inserted,
            "high_relevance": len(high_rel),
        }
        workflow.logger.info("Job board cycle complete: %s", summary)
        return summary
