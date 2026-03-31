#!/usr/bin/env python3
"""
Cost watchdog — reads Claude session JSONLs and kills claude-bot.service
if cumulative cost for today's sessions exceeds LIMIT_USD.

Run via cron every 5 minutes. Uses a state file to track read offsets so
it only parses new lines on each run, not the full file.
"""
import json
import glob
import os
import sys
import subprocess
from datetime import datetime

LIMIT_USD  = float(os.environ.get('COST_LIMIT', '300'))
JSONL_DIR  = os.path.expanduser('~/.claude/projects/-mnt-data')
LOG_PATH   = '/tmp/cost_watchdog.log'
STATE_PATH = '/tmp/cost_watchdog_state.json'

# Claude Sonnet 4.6 pricing per token
PRICES = {
    'input':       3.00 / 1_000_000,
    'output':     15.00 / 1_000_000,
    'cache_write': 3.75 / 1_000_000,
    'cache_read':  0.30 / 1_000_000,
}


def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line)
    with open(LOG_PATH, 'a') as f:
        f.write(line + '\n')


def _cost_from_usage(u) -> float:
    return (
        u.get('input_tokens', 0) * PRICES['input']
        + u.get('output_tokens', 0) * PRICES['output']
        + u.get('cache_creation_input_tokens', 0) * PRICES['cache_write']
        + u.get('cache_read_input_tokens', 0) * PRICES['cache_read']
    )


def load_state() -> dict:
    try:
        with open(STATE_PATH) as f:
            state = json.load(f)
        # Reset accumulated cost at midnight
        today = datetime.now().strftime('%Y-%m-%d')
        if state.get('date') != today:
            return {'date': today, 'offsets': {}, 'total': 0.0}
        return state
    except (FileNotFoundError, json.JSONDecodeError):
        return {'date': datetime.now().strftime('%Y-%m-%d'), 'offsets': {}, 'total': 0.0}


def save_state(state: dict):
    with open(STATE_PATH, 'w') as f:
        json.dump(state, f)


def calc_incremental_cost(state: dict) -> float:
    """Read only new bytes from each JSONL since last run."""
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    delta = 0.0
    files = glob.glob(os.path.join(JSONL_DIR, '*.jsonl'))
    for path in files:
        try:
            if os.path.getmtime(path) < today_start:
                continue
            offset = state['offsets'].get(path, 0)
            with open(path, 'rb') as f:
                f.seek(offset)
                new_bytes = f.read()
                state['offsets'][path] = offset + len(new_bytes)
            for line in new_bytes.decode('utf-8', errors='replace').splitlines():
                try:
                    obj = json.loads(line)
                    u = obj.get('usage') or obj.get('message', {}).get('usage', {})
                    if u:
                        delta += _cost_from_usage(u)
                except json.JSONDecodeError:
                    pass
        except OSError as e:
            log(f'WARN: could not read {path}: {e}')
    return delta


def main():
    state = load_state()
    delta = calc_incremental_cost(state)
    state['total'] = state.get('total', 0.0) + delta
    save_state(state)

    cost = state['total']
    log(f'Session cost: ${cost:.2f} (limit: ${LIMIT_USD:.2f}, +${delta:.2f} this run)')

    if cost >= LIMIT_USD:
        log('LIMIT EXCEEDED — stopping claude-bot.service')
        try:
            subprocess.run(
                ['systemctl', '--user', 'stop', 'claude-bot.service'],
                check=True, timeout=10,
            )
            log('claude-bot.service stopped successfully')
        except Exception as e:
            log(f'Failed to stop service: {e}')
        sys.exit(1)


if __name__ == '__main__':
    main()
