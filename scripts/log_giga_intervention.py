#!/usr/bin/env python3
"""Log a Giga intervention to /mnt/data/giga-log.md.

Usage: python3 log_giga_intervention.py <slug> "<description>"

slug: kebab-case identifier for the intervention category (e.g. verify-clunger-before-asserting)
description: what the intervention was about
"""
import sys, re, os
from datetime import date

GIGA_LOG = "/mnt/data/giga-log.md"
today = date.today().isoformat()

if len(sys.argv) < 3:
    print("Usage: log_giga_intervention.py <slug> <description>", file=sys.stderr)
    sys.exit(1)

slug = sys.argv[1]
description = sys.argv[2]

# Read existing log
if os.path.exists(GIGA_LOG):
    content = open(GIGA_LOG).read()
else:
    content = "# Giga Intervention Log\n\nEach entry tracks a category of intervention. `count` = how many times Giga has fired on this pattern.\nRule severity scales: 1-2 = suggestion, 3-4 = strong directive, 5+ = hard rule.\n\n---\n\n"

# Find existing entry for this slug
entry_pattern = re.compile(
    rf'## {re.escape(slug)}\n\*\*count:\*\* (\d+)\n\*\*first:\*\* (\S+)\n\*\*last:\*\* \S+\n\*\*severity:\*\* [^\n]+\n\n(.*?)(?=\n---|\Z)',
    re.DOTALL
)
match = entry_pattern.search(content)

def severity(count):
    if count >= 5: return f"HARD RULE ({count} occurrences)"
    if count >= 3: return f"strong directive ({count} occurrences)"
    return f"suggestion ({count} occurrences)"

if match:
    count = int(match.group(1)) + 1
    first = match.group(2)
    new_entry = f"## {slug}\n**count:** {count}\n**first:** {first}\n**last:** {today}\n**severity:** {severity(count)}\n\n{match.group(3).strip()}"
    content = content[:match.start()] + new_entry + content[match.end():]
else:
    count = 1
    new_entry = f"## {slug}\n**count:** {count}\n**first:** {today}\n**last:** {today}\n**severity:** {severity(count)}\n\n{description}\n\n---\n\n"
    content += new_entry

open(GIGA_LOG, 'w').write(content)
print(f"Logged: {slug} (count={count}, severity={severity(count)})")
