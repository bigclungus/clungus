"""
Cost watchdog activity — reads Claude session JSONLs and stops claude-bot.service
if cumulative cost for today's sessions exceeds LIMIT_USD.

Uses a state file at /tmp/cost_watchdog_state.json to track read offsets so
it only parses new lines on each invocation, not the full file.
"""
import json
import glob
import os
import subprocess
from datetime import datetime
from pathlib import Path

from temporalio import activity

from .inject_act import _do_inject
from .constants import MAIN_CHANNEL_ID

LIMIT_USD = float(os.environ.get("COST_LIMIT", "300"))
JSONL_DIR = os.path.expanduser("~/.claude/projects/-mnt-data")
STATE_PATH = "/tmp/cost_watchdog_state.json"

# Claude Sonnet 4.6 pricing per token
PRICES = {
    "input":       3.00 / 1_000_000,
    "output":      15.00 / 1_000_000,
    "cache_write": 3.75 / 1_000_000,
    "cache_read":  0.30 / 1_000_000,
}


def _cost_from_usage(u: dict) -> float:
    return (
        u.get("input_tokens", 0) * PRICES["input"]
        + u.get("output_tokens", 0) * PRICES["output"]
        + u.get("cache_creation_input_tokens", 0) * PRICES["cache_write"]
        + u.get("cache_read_input_tokens", 0) * PRICES["cache_read"]
    )


def _load_state() -> dict:
    try:
        with open(STATE_PATH) as f:
            state = json.load(f)
        today = datetime.now().strftime("%Y-%m-%d")
        if state.get("date") != today:
            return {"date": today, "offsets": {}, "total": 0.0}
        return state
    except (FileNotFoundError, json.JSONDecodeError):
        return {"date": datetime.now().strftime("%Y-%m-%d"), "offsets": {}, "total": 0.0}


def _save_state(state: dict) -> None:
    with open(STATE_PATH, "w") as f:
        json.dump(state, f)


def _calc_incremental_cost(state: dict) -> float:
    """Read only new bytes from each JSONL since last run."""
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    delta = 0.0
    files = glob.glob(os.path.join(JSONL_DIR, "*.jsonl"))
    for path in files:
        try:
            if os.path.getmtime(path) < today_start:
                continue
            offset = state["offsets"].get(path, 0)
            with open(path, "rb") as f:
                f.seek(offset)
                new_bytes = f.read()
                state["offsets"][path] = offset + len(new_bytes)
            for line in new_bytes.decode("utf-8", errors="replace").splitlines():
                try:
                    obj = json.loads(line)
                    u = obj.get("usage") or obj.get("message", {}).get("usage", {})
                    if u:
                        delta += _cost_from_usage(u)
                except json.JSONDecodeError:
                    pass
        except OSError as e:
            activity.logger.warning("could not read %s: %s", path, e)
    return delta


@activity.defn
async def run_cost_watchdog() -> str:
    """Check cumulative session cost. Stops claude-bot.service if over limit."""
    state = _load_state()
    delta = _calc_incremental_cost(state)
    state["total"] = state.get("total", 0.0) + delta
    if delta > 0:
        _save_state(state)

    cost = state["total"]
    msg = f"Session cost: ${cost:.2f} (limit: ${LIMIT_USD:.2f}, +${delta:.2f} this run)"
    activity.logger.info(msg)

    if cost >= LIMIT_USD:
        alert = f"Cost watchdog: limit exceeded (${cost:.2f} >= ${LIMIT_USD:.2f}) — stopping claude-bot.service"
        activity.logger.warning(alert)
        await _do_inject(alert, MAIN_CHANNEL_ID, user="cost-watchdog")
        try:
            subprocess.run(
                ["systemctl", "--user", "stop", "claude-bot.service"],
                check=True,
                timeout=10,
            )
        except Exception as e:
            raise RuntimeError(f"Failed to stop claude-bot.service: {e}") from e

    return msg
