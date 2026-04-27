"""LLM-based listing commentary using xAI vision API."""

import httpx
from temporalio import activity

from .constants import XAI_API_URL as _API_URL
from .utils import get_xai_key

_MODEL = "grok-4-fast-non-reasoning"

_SYSTEM_PROMPT = (
    "You are grug, a caveman house critic. You look at house photos and listing stats "
    "and give your honest opinion in caveman speak. Comment on what the house actually "
    "looks like — the yard, kitchen, rooms, vibes, curb appeal, anything you notice in "
    "the photos. Keep it to 2-3 sentences max. No hashtags, no emojis. "
    "Example style: 'kitchen have granite counter, grug approve. backyard tiny though, "
    "no room for tribe fire pit. overall decent cave for price.'"
)


def _build_text_context(listing: dict) -> str:
    """Build a text summary of listing stats for context."""
    parts = []
    if listing.get("address"):
        parts.append(f"Address: {listing['address']}")
    if listing.get("price"):
        parts.append(f"Price: ${listing['price']:,.0f}")
    if listing.get("beds"):
        parts.append(f"Beds: {listing['beds']}")
    if listing.get("baths"):
        parts.append(f"Baths: {listing['baths']}")
    if listing.get("sqft"):
        parts.append(f"Sqft: {listing['sqft']:,}")
    if listing.get("year_built"):
        parts.append(f"Year built: {listing['year_built']}")
    if listing.get("neighborhood"):
        parts.append(f"Neighborhood: {listing['neighborhood']}")
    if listing.get("lot_sqft"):
        parts.append(f"Lot: {listing['lot_sqft']:,.0f} sqft")
    return "\n".join(parts)


@activity.defn
async def generate_listing_commentary(listing: dict) -> str:
    """Generate caveman commentary on a listing using xAI vision model.

    Returns commentary string, or empty string on any error (caller falls back
    to deterministic commentary).
    """
    try:
        api_key = get_xai_key()

        # Collect photo URLs: primary + up to 4 alt photos
        photo_urls: list[str] = []
        primary = listing.get("photo", "")
        if primary:
            photo_urls.append(primary)
        alt_photos = listing.get("alt_photos", [])
        for url in alt_photos[:4]:
            if url and url != primary:
                photo_urls.append(url)

        # Build user message content blocks
        user_content: list[dict] = []

        # Add text context
        text_context = _build_text_context(listing)
        if text_context:
            user_content.append({"type": "text", "text": f"Listing stats:\n{text_context}\n\nGive your caveman review of this house based on the photos and stats."})

        # Add image blocks
        user_content.extend(
            {"type": "image_url", "image_url": {"url": url}}
            for url in photo_urls
            if url
        )

        # If no images at all, just use text
        if not photo_urls:
            user_content = [{"type": "text", "text": f"Listing stats:\n{text_context}\n\nGive your caveman review of this house based on the stats."}]

        payload = {
            "model": _MODEL,
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            "max_tokens": 200,
            "temperature": 0.8,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                _API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            commentary = data["choices"][0]["message"]["content"].strip()
            activity.logger.info("Generated listing commentary for %s: %s", listing.get("address", "?"), commentary[:80])
            return commentary

    except Exception as exc:
        activity.logger.warning("Failed to generate listing commentary: %s", exc)
        return ""
