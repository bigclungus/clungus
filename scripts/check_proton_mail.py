#!/usr/bin/env python3
"""
check_proton_mail.py — fetch unread inbox messages from bigclungus@proton.me

Uses the protonmail-api-client package (already installed) which speaks directly
to Proton's internal API — no Bridge, no IMAP, no desktop app required.

Session is cached at SESSION_PATH so subsequent runs skip re-authentication.

Usage:
    python3 /mnt/data/scripts/check_proton_mail.py [--all] [--limit N] [--read ID]

Options:
    --all       show all messages (default: unread only)
    --limit N   max messages to show (default: 20)
    --read ID   read and print the body of message with given ID
    --no-cache  force fresh login (ignore saved session)
"""

import sys
import os
import argparse
from datetime import datetime

# Redirect stderr early to suppress tqdm progress bars from protonmail-api-client
# (the library uses tqdm_asyncio.gather which writes to stderr unconditionally)
_devnull = open(os.devnull, "w")
os.dup2(_devnull.fileno(), 2)

USERNAME = "bigclungus@proton.me"
PASSWORD = ".nLbLpWDGkTeoAkhATj3yyTQ-e6Twuy4CHBb2!fE3.3wndbsMxVzr2XavNh6Nw4V"
SESSION_PATH = os.path.expanduser("~/.cache/proton_session.json")


def get_client(force_login=False):
    from protonmail import ProtonMail

    # Suppress tqdm progress bars from the library
    import tqdm
    import tqdm.auto
    original_tqdm = tqdm.tqdm
    tqdm.tqdm = lambda *a, **kw: original_tqdm(*a, **{**kw, "disable": True})
    tqdm.auto.tqdm = tqdm.tqdm

    client = ProtonMail(logging_level=0)  # suppress all logging output

    if not force_login and os.path.exists(SESSION_PATH):
        try:
            client.load_session(SESSION_PATH)
            return client
        except Exception:
            pass  # fall through to fresh login

    client.login(USERNAME, PASSWORD)
    os.makedirs(os.path.dirname(SESSION_PATH), exist_ok=True)
    client.save_session(SESSION_PATH)
    return client


def fmt_time(ts):
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M")


def main():
    parser = argparse.ArgumentParser(description="Check Proton Mail inbox")
    parser.add_argument("--all", action="store_true", help="Show all messages, not just unread")
    parser.add_argument("--limit", type=int, default=20, help="Max messages to show")
    parser.add_argument("--read", metavar="ID", help="Read body of a specific message ID")
    parser.add_argument("--no-cache", action="store_true", help="Force fresh login")
    args = parser.parse_args()

    client = get_client(force_login=args.no_cache)

    if args.read:
        # Find and print message body
        messages = client.get_messages_by_page(0, page_size=150)
        target = next((m for m in messages if m.id == args.read), None)
        if not target:
            print(f"Message ID not found: {args.read}", file=sys.stderr)
            sys.exit(1)
        full = client.read_message(target)
        print(f"Subject: {full.subject}")
        print(f"From:    {full.sender.address}")
        print(f"Date:    {fmt_time(full.time)}")
        print("-" * 60)
        # Strip HTML tags simply
        body = full.body or ""
        if "<" in body:
            import re
            body = re.sub(r"<[^>]+>", "", body)
            body = re.sub(r"\s{3,}", "\n\n", body).strip()
        print(body)
        return

    # List messages
    messages = client.get_messages_by_page(0, page_size=args.limit)

    if not args.all:
        messages = [m for m in messages if m.unread]

    if not messages:
        print("No unread messages." if not args.all else "No messages.")
        return

    label = "All" if args.all else "Unread"
    print(f"{label} messages in bigclungus@proton.me inbox ({len(messages)} shown):\n")
    print(f"{'DATE':<17} {'FROM':<38} {'SUBJECT'}")
    print("-" * 100)
    for msg in messages:
        flag = "[U]" if msg.unread else "   "
        sender = msg.sender.address if msg.sender else "?"
        subject = msg.subject or "(no subject)"
        date = fmt_time(msg.time)
        print(f"{flag} {date:<14} {sender:<38} {subject}")


if __name__ == "__main__":
    main()
