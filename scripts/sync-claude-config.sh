#!/bin/bash
# Copies staged Claude config to ~/.claude before bot starts
STAGING="/mnt/data/claude-config"
DEST="$HOME/.claude"

for f in settings.json settings.local.json; do
  if [ -f "$STAGING/$f" ]; then
    cp "$STAGING/$f" "$DEST/$f"
    echo "Synced $f"
  fi
done

if [ -f "$STAGING/installed_plugins.json" ]; then
  cp "$STAGING/installed_plugins.json" "$DEST/plugins/installed_plugins.json"
  echo "Synced plugins/installed_plugins.json"
fi

if [ -d "$STAGING/skills" ]; then
  rsync -a "$STAGING/skills/" "$DEST/skills/"
  echo "Synced skills/"
fi

if [ -d "$STAGING/agents" ]; then
  mkdir -p "$DEST/agents"
  rsync -a "$STAGING/agents/" "$DEST/agents/"
  echo "Synced agents/"
fi

if [ -f "$STAGING/CLAUDE.md" ]; then
  cp "$STAGING/CLAUDE.md" "$DEST/CLAUDE.md"
  echo "Synced CLAUDE.md"
fi

# Sync systemd user service files — keeps MemoryMax, resource limits, etc. in sync
SYSTEMD_STAGING="$STAGING/systemd/user"
SYSTEMD_DEST="$HOME/.config/systemd/user"
if [ -d "$SYSTEMD_STAGING" ]; then
  mkdir -p "$SYSTEMD_DEST"
  changed=0
  for f in "$SYSTEMD_STAGING"/*.service "$SYSTEMD_STAGING"/*.timer; do
    [ -f "$f" ] || continue
    fname=$(basename "$f")
    dest_file="$SYSTEMD_DEST/$fname"
    if ! diff -q "$f" "$dest_file" > /dev/null 2>&1; then
      cp "$f" "$dest_file"
      echo "Synced systemd/$fname"
      changed=1
    fi
  done
  if [ "$changed" = "1" ]; then
    systemctl --user daemon-reload 2>/dev/null || true
    echo "systemd daemon-reload done"
  fi
fi
