---
name: simplify
description: Run a code cleanup and simplification pass on recent changes in hello-world and temporal-workflows
---

Run a code simplification and cleanup pass on recent changes.

## Usage

/simplify

## What to do

1. **Get recent commits** from both codebases:
   ```bash
   git -C /mnt/data/hello-world log --oneline -5
   git -C /mnt/data/temporal-workflows log --oneline -5
   ```

2. **Get the diffs** for the most recent changes (HEAD~3..HEAD or similar):
   ```bash
   git -C /mnt/data/hello-world diff HEAD~3..HEAD -- '*.py' '*.html' '*.ts' '*.js'
   git -C /mnt/data/temporal-workflows diff HEAD~3..HEAD -- '*.py'
   ```

3. **Review for these issues:**
   - Dead code (unused imports, unreachable branches, commented-out blocks)
   - Duplicate logic (same pattern repeated, could be a shared helper)
   - Hardcoded values that should use constants (e.g., channel IDs, URLs)
   - Obvious bugs (undefined variable, wrong type, error swallowed silently)
   - Style inconsistencies (inconsistent naming, inconsistent error handling)
   - Redundant imports (imported at module level AND inside functions)

4. **Apply only clear, safe fixes.** Skip anything that requires design decisions.

5. **Commit with message:** `simplify: <brief description of what was fixed>`

6. **Restart affected services** if needed:
   - hello-world changes: `systemctl --user restart website.service`
   - temporal-workflows changes: `systemctl --user restart temporal-worker.service`

7. **If nothing is worth fixing**, do nothing and stay silent. Do not invent busywork.

## Constraints

- No new features, no architectural changes — cleanup only
- Only touch `/mnt/data/hello-world/` and `/mnt/data/temporal-workflows/`
- Do not post to Discord unless a service restart happened or a real bug was fixed
- Run as a background agent to avoid blocking the main thread
