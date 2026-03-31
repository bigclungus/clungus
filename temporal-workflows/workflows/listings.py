from datetime import timedelta

from temporalio import activity as _activity
from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from activities.discord_act import post_listings_summary
    from activities.redfin import fetch_redfin_listings
    from activities.storage import load_seen_ids, save_seen_ids


@_activity.defn(name="filter_new_listings")
async def filter_new_listings(all_listings: list[dict], seen_ids: list[str]) -> list[dict]:
    """Pure dedup filter. No I/O — registered as local activity."""
    seen_set = set(seen_ids)
    seen_in_batch: set[str] = set()
    result = []
    for listing in all_listings:
        lid = listing["id"]
        if lid and lid not in seen_set and lid not in seen_in_batch:
            result.append(listing)
            seen_in_batch.add(lid)
    return result


@workflow.defn
class ListingsWorkflow:
    @workflow.run
    async def run(self, search: dict) -> int:
        """Run a single search. Returns count of new listings posted.

        If search['dry_run'] is True:
          - Skip dedup check (show all listings regardless of seen status)
          - Post to Discord as normal
          - Do NOT update seen_listings.db
        """
        db_path = "/home/clungus/work/temporal-workflows/seen_listings.db"
        dry_run: bool = search.get("dry_run", False)

        # Fetch listings for each location (remote activity)
        all_listings: list[dict] = []
        for location in search["locations"]:
            listings = await workflow.execute_activity(
                fetch_redfin_listings,
                args=[location, search["min_price"], search["max_price"]],
                start_to_close_timeout=timedelta(seconds=60),
                retry_policy=RetryPolicy(maximum_attempts=3),
            )
            all_listings.extend(listings)

        if dry_run:
            # Skip dedup — show all listings
            new_listings = all_listings
        else:
            # Load seen IDs (remote activity)
            seen_ids: list[str] = await workflow.execute_activity(
                load_seen_ids,
                args=[db_path, search["name"]],
                start_to_close_timeout=timedelta(seconds=30),
            )

            # Filter new listings (local activity — pure, no I/O, runs in-process)
            new_listings = await workflow.execute_local_activity(
                filter_new_listings,
                args=[all_listings, seen_ids],
                start_to_close_timeout=timedelta(seconds=5),
            )

        # Cap at 1 and post a single summary message if there are any new listings
        top_listings = new_listings[:1]
        if top_listings:
            await workflow.execute_activity(
                post_listings_summary,
                args=[search["discord_channel_id"], top_listings],
                start_to_close_timeout=timedelta(seconds=30),
            )

            if not dry_run:
                # Persist new IDs (remote activity)
                new_ids = [lst["id"] for lst in top_listings]
                await workflow.execute_activity(
                    save_seen_ids,
                    args=[db_path, search["name"], new_ids],
                    start_to_close_timeout=timedelta(seconds=30),
                )

        return len(top_listings)
