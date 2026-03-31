#!/bin/bash
# Scan git diff for common secret patterns
# Usage: check-secrets.sh [--staged] [--recent N]
# --staged: scan staged changes (for pre-commit hook)
# --recent N: scan last N commits

set -e

PATTERNS=(
    # Private key blocks (always actual secrets)
    "-----BEGIN.*PRIVATE KEY-----"
    # Known token formats with distinctive prefixes (actual values)
    "sk-[a-zA-Z0-9]{20,}"
    "ghp_[a-zA-Z0-9]{36}"
    "ghs_[a-zA-Z0-9]{36}"
    "xai-[a-zA-Z0-9]{20,}"
    # Key/secret/password/token assignments with an actual value (not just name references)
    # Matches: KEY=value, KEY='value', KEY="value" where value is 8+ chars
    # Does NOT match: process.env.KEY, os.environ['KEY'], getenv('KEY'), etc.
    "[A-Z_]*PRIVATE_KEY\s*=\s*['\"]?[a-zA-Z0-9/+_-]{8,}"
    "[A-Z_]*CLIENT_SECRET\s*=\s*['\"]?[a-zA-Z0-9/+_-]{8,}"
    "[A-Z_]*client_secret\s*=\s*['\"]?[a-zA-Z0-9/+_-]{8,}"
    "[A-Z_a-z_]*[Aa][Pp][Ii]_[Kk][Ee][Yy]\s*=\s*['\"]?[a-zA-Z0-9/+_-]{8,}"
    "password\s*=\s*['\"][^'\"]{8,}"
    "secret\s*=\s*['\"][^'\"]{8,}"
    "token\s*=\s*['\"][^'\"]{8,}"
)

if [[ "$1" == "--staged" ]]; then
    DIFF=$(git diff --cached)
elif [[ "$1" == "--recent" ]]; then
    N=${2:-3}
    DIFF=$(git log -p -${N} --no-merges)
else
    DIFF=$(git diff HEAD~1..HEAD 2>/dev/null || git diff --cached)
fi

# Patterns that indicate a line is a safe env var name reference, not an actual secret
EXCLUDE_PATTERNS="process\.env\.|os\.environ|os\.getenv|getenv\(|import\.meta\.env\.|ENV\[|System\.getenv"

FOUND=0
for pattern in "${PATTERNS[@]}"; do
    # Skip comment-only entries (lines starting with #)
    [[ "$pattern" == \#* ]] && continue
    # Find matching lines, then exclude safe env var reference patterns
    MATCHES=$(echo "$DIFF" | grep -E "^\+.*${pattern}" 2>/dev/null | grep -vE "${EXCLUDE_PATTERNS}" || true)
    if [[ -n "$MATCHES" ]]; then
        echo "WARNING: POSSIBLE SECRET DETECTED: pattern '$pattern'"
        echo "$MATCHES" | head -5
        FOUND=1
    fi
done

if [[ $FOUND -eq 1 ]]; then
    echo ""
    echo "Secret scan failed. Review the above matches before committing."
    echo "If these are false positives, check your .gitignore and .env files."
    exit 1
fi

exit 0
