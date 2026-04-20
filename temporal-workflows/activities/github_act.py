"""GitHub webhook activities — ack comments and Discord notifications."""
import aiohttp
from temporalio import activity

from .constants import MAIN_CHANNEL_ID
from .inject_act import _do_inject
from .utils import get_github_token


@activity.defn
async def github_post_ack_comment(repo: str, number: int, event_type: str) -> str:
    """Post a '👋 seen' acknowledgment comment on a GitHub issue or PR."""
    try:
        token = get_github_token()
    except RuntimeError:
        activity.logger.warning("GITHUB_TOKEN not set — skipping ack comment")
        return "skipped (no token)"

    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "BigClungus",
        "Authorization": f"Bearer {token}",
    }

    if event_type == "pull_request":
        body_text = "👀 PR received, will review"
    else:
        body_text = "👋 seen — I'll take a look"

    url = f"https://api.github.com/repos/{repo}/issues/{number}/comments"

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json={"body": body_text},
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status in (200, 201):
                    return "ok"
                text = await resp.text()
                activity.logger.error(
                    "github_post_ack_comment HTTP error %s for %s#%s: %s",
                    resp.status, repo, number, text[:200],
                )
                return f"ERROR {resp.status}: {text[:200]}"
    except Exception as e:
        activity.logger.error("github_post_ack_comment request failed for %s#%s: %s", repo, number, e)
        return f"ERROR: {e}"


@activity.defn
async def github_inject_discord_notification(
    event_type: str,
    repo: str,
    title: str,
    number: int,
    url: str,
    user: str,
) -> None:
    """Inject a Discord notification for a new GitHub issue or PR."""
    icon = "🔀" if event_type == "pull_request" else "📌"
    label = "PR" if event_type == "pull_request" else "Issue"
    content = (
        f"{icon} **New {label} on {repo}** by `{user}`\n"
        f"**#{number}: {title}**\n{url}"
    )

    try:
        await _do_inject(content, MAIN_CHANNEL_ID, user="github-webhook")
    except Exception as e:
        activity.logger.error("Discord inject failed: %s", e)
