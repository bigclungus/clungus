#!/usr/bin/env python3
"""
Drift scan — daily check for dropped BigClungus projects.
Checks: labs with no commits in 14+ days, GitHub issues stale 14+ days.
"""
import subprocess, json, os, datetime, glob

LABS_DIR = "/mnt/data/labs"
STALE_DAYS = 14
now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

findings = []

# 1. Labs with no recent commits
for lab_path in sorted(glob.glob(os.path.join(LABS_DIR, "*/"))):
    lab_name = os.path.basename(lab_path.rstrip("/"))
    # Check if it's a git repo or part of the main repo
    try:
        result = subprocess.run(
            ["git", "-C", lab_path, "log", "--oneline", "-1", "--format=%ct"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0 or not result.stdout.strip():
            # Try the parent repo
            result = subprocess.run(
                ["git", "-C", "/mnt/data", "log", "--oneline", "-1", "--format=%ct", "--", f"labs/{lab_name}/"],
                capture_output=True, text=True, timeout=10
            )
        if result.stdout.strip():
            last_commit_ts = int(result.stdout.strip())
            last_commit = datetime.datetime.fromtimestamp(last_commit_ts, datetime.timezone.utc).replace(tzinfo=None)
            age_days = (now - last_commit).days
            if age_days >= STALE_DAYS:
                findings.append(f"🧪 lab `{lab_name}`: no commits in {age_days}d (last: {last_commit.strftime('%Y-%m-%d')})")
    except Exception as e:
        pass

# 2. Stale GitHub issues (open, no update in 14+ days)
try:
    result = subprocess.run(
        ["gh", "issue", "list", "--repo", "bigclungus/bigclungus-meta",
         "--state", "open", "--limit", "50", "--json", "number,title,updatedAt,createdAt,labels"],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode == 0:
        issues = json.loads(result.stdout)
        for issue in issues:
            updated = datetime.datetime.fromisoformat(issue["updatedAt"].replace("Z", "+00:00")).replace(tzinfo=None)
            age_days = (now - updated).days
            if age_days >= STALE_DAYS:
                labels = [l["name"] for l in issue.get("labels", [])]
                label_str = f" [{', '.join(labels)}]" if labels else ""
                findings.append(f"📋 issue #{issue['number']}{label_str}: `{issue['title']}` — no activity in {age_days}d")
except Exception as e:
    findings.append(f"⚠️ GitHub issue check failed: {e}")

if findings:
    print(f"**Drift scan — {now.strftime('%Y-%m-%d')}**\nFound {len(findings)} stale item(s):\n" + "\n".join(f"• {f}" for f in findings))
# If no findings, print nothing (silence = healthy)
