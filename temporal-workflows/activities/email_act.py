import re
from asyncio import get_running_loop
from pathlib import Path

from temporalio import activity

from .constants import MAIN_CHANNEL_ID
from .inject_act import _do_inject

PROTON_SESSION = str(Path.home() / ".cache" / "proton_session.json")


@activity.defn
async def check_new_emails(last_check_ts: float) -> list[dict]:
    """Poll ProtonMail for emails newer than last_check_ts (unix timestamp).
    Returns list of dicts with: message_id, subject, sender, snippet, ts."""
    return await get_running_loop().run_in_executor(None, _check_emails_sync, last_check_ts)


def _check_emails_sync(last_check_ts: float) -> list[dict]:
    from protonmail import ProtonMail
    client = ProtonMail(logging_level=0)
    client.load_session(PROTON_SESSION)

    # 5-min poll interval; 10 is plenty for normal volume
    messages = client.get_messages_by_page(0, page_size=10)
    new_msgs = []
    try:
        for msg in messages:
            # msg.time is a datetime or unix timestamp — handle both
            if hasattr(msg.time, 'timestamp'):
                msg_ts = msg.time.timestamp()
            else:
                msg_ts = float(msg.time)

            if msg_ts <= last_check_ts:
                break

            if msg.unread:
                try:
                    full = client.read_message(msg)
                    raw = full.body or ''
                    raw = re.sub(r'<(style|script)[^>]*>.*?</(style|script)>', '', raw, flags=re.DOTALL | re.IGNORECASE)
                    raw = re.sub(r'<[^>]+>', '', raw)
                    body = ' '.join(raw.split())[:200].strip()
                except Exception as exc:
                    activity.logger.warning("[email_act] failed to read message body for %s: %s", msg.id, exc)
                    body = ''

                new_msgs.append({
                    'message_id': str(msg.id),
                    'subject': msg.subject or '(no subject)',
                    'sender': msg.sender.address if msg.sender else 'unknown',
                    'snippet': body,
                    'ts': msg_ts,
                })
    finally:
        client.save_session(PROTON_SESSION)

    return new_msgs


@activity.defn
async def inject_email_notification(email: dict) -> None:
    """Inject an email notification into the bot session via the inject endpoint."""
    subject = email['subject']
    sender = email['sender']
    snippet = email['snippet']

    content = f"📧 **New email** from {sender}\n**Subject:** {subject}"
    if snippet:
        content += f"\n> {snippet}{'…' if len(snippet) == 200 else ''}"

    await _do_inject(content, MAIN_CHANNEL_ID, user="email-poller")
