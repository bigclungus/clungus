import asyncio

from homeharvest import scrape_property
from temporalio import activity


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
            listing_id = str(row.get('listing_id') or row.get('property_id') or row.get('mls_id') or '')
            address = row.get('formatted_address') or f"{row.get('full_street_line', '')}, {row.get('city', '')}, {row.get('state', '')} {row.get('zip_code', '')}".strip(', ')
            url = row.get('property_url', '')
            price = float(row.get('list_price', 0) or 0)
            beds = int(row.get('beds', 0) or 0)
            baths = float(row.get('full_baths', 0) or 0)
            sqft = int(row.get('sqft', 0) or 0)
            list_date = str(row.get('list_date', '') or '')

            photo = str(row.get('primary_photo') or '')

            # Extra fields for neighborhood vibe (may be missing)
            neighborhood = str(row.get('neighborhoods', '') or '')
            year_built = int(row.get('year_built', 0) or 0) or None
            lot_sqft_val = float(row.get('lot_sqft', 0) or 0) or None
            lat = float(row.get('latitude', 0) or 0) or None
            lon = float(row.get('longitude', 0) or 0) or None
            hoa_fee = float(row.get('hoa_fee', 0) or 0) or None

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
