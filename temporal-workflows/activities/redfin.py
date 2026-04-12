import asyncio

import pandas as pd
from homeharvest import scrape_property
from temporalio import activity


def _safe(val, default=''):
    """Safely extract a value from a pandas row, replacing NA/NaN with default."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return default
    try:
        if pd.isna(val):
            return default
    except (TypeError, ValueError):
        pass
    return val


@activity.defn
async def fetch_redfin_listings(location: str, min_price: int, max_price: int, listing_type: str = 'for_sale') -> list[dict]:
    """Fetch SFH listings using homeharvest (Redfin/MLS data).

    Args:
        location: City/state string (e.g. "Mill Valley, CA")
        min_price: Minimum list price filter
        max_price: Maximum list price filter
        listing_type: homeharvest listing type — 'for_sale' (default), 'for_rent', or 'sold'
    """
    # homeharvest is sync, run in executor to not block the event loop
    loop = asyncio.get_running_loop()

    def _fetch():
        props = scrape_property(
            location=location,
            listing_type=listing_type,
            past_days=7,  # only new listings from last 7 days
            property_type=['single_family'],
        )
        if props is None or len(props) == 0:
            return []

        # Filter by price
        filtered = props[(props['list_price'] >= min_price) & (props['list_price'] <= max_price)]

        results = []
        for _, row in filtered.iterrows():
            listing_id = str(_safe(row.get('listing_id'), '') or _safe(row.get('property_id'), '') or _safe(row.get('mls_id'), '') or '')
            address = _safe(row.get('formatted_address'), '') or f"{_safe(row.get('full_street_line'), '')}, {_safe(row.get('city'), '')}, {_safe(row.get('state'), '')} {_safe(row.get('zip_code'), '')}".strip(', ')
            url = str(_safe(row.get('property_url'), ''))
            price = float(_safe(row.get('list_price'), 0))
            beds = int(_safe(row.get('beds'), 0))
            baths = float(_safe(row.get('full_baths'), 0))
            sqft = int(_safe(row.get('sqft'), 0))
            list_date = str(_safe(row.get('list_date'), ''))

            photo = str(_safe(row.get('primary_photo'), ''))

            # Extra fields for neighborhood vibe (may be missing)
            neighborhood = str(_safe(row.get('neighborhoods'), ''))
            year_built = int(_safe(row.get('year_built'), 0)) or None
            lot_sqft_val = float(_safe(row.get('lot_sqft'), 0)) or None
            lat = float(_safe(row.get('latitude'), 0)) or None
            lon = float(_safe(row.get('longitude'), 0)) or None
            hoa_fee = float(_safe(row.get('hoa_fee'), 0)) or None

            if listing_id and price > 0:
                entry = {
                    'id': listing_id,
                    'address': address,
                    'price': price,
                    'beds': beds,
                    'baths': baths,
                    'sqft': sqft,
                    'url': url,
                    'list_date': list_date,
                    'photo': photo,
                }
                if neighborhood:
                    entry['neighborhood'] = neighborhood
                if year_built:
                    entry['year_built'] = year_built
                if lot_sqft_val:
                    entry['lot_sqft'] = lot_sqft_val
                if lat:
                    entry['latitude'] = lat
                if lon:
                    entry['longitude'] = lon
                if hoa_fee:
                    entry['hoa_fee'] = hoa_fee
                results.append(entry)
        return results

    return await loop.run_in_executor(None, _fetch)
