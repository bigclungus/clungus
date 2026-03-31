# temporal-workflows — Real Estate Listings Notifier

Temporal workflow that polls Redfin daily for new SFH listings matching configured search criteria and posts them to Discord.

## Architecture

```
worker.py
  └── ListingsWorkflow (cron: 0 8 * * *)
        ├── load_seen_ids          (remote activity — SQLite read)
        ├── fetch_redfin_listings  (remote activity — HTTP, per location)
        ├── filter_new_listings    (local activity  — pure dedup, in-process)
        ├── post_discord_message   (remote activity — Discord API, per listing)
        └── save_seen_ids          (remote activity — SQLite write)
```

Activities are classified per Temporal best practices:
- **Remote activities**: anything with I/O (HTTP, SQLite, Discord API)
- **Local activity**: `filter_new_listings` is pure in-memory work with no I/O

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env   # add DISCORD_BOT_TOKEN
python worker.py
```

Requires a Temporal server running at `localhost:7233`.

## Configuration

Edit `criteria.json` to add/modify searches. Each search specifies locations, price range, and Discord channel.

## Systemd

```bash
systemctl --user enable --now temporal-worker.service
journalctl --user -u temporal-worker -f
```
