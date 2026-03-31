// entities/remote-player.ts — Snapshot interpolation for remote players

import {
  RemotePlayer, PlayerSnapshot,
  INTERPOLATION_DELAY_MS, SNAPSHOT_BUFFER_SIZE,
} from "../state.ts";

export function addRemotePlayerSnapshot(player: RemotePlayer, snap: PlayerSnapshot): void {
  player.snapshots.push(snap);
  if (player.snapshots.length > SNAPSHOT_BUFFER_SIZE) {
    player.snapshots.shift();
  }
}

export function interpolateRemotePlayer(player: RemotePlayer, now: number): void {
  const renderTime = now - INTERPOLATION_DELAY_MS;
  const buf = player.snapshots;

  if (buf.length === 0) return;

  for (let i = buf.length - 1; i > 0; i--) {
    const newer = buf[i];
    const older = buf[i - 1];
    if (older.t <= renderTime && renderTime <= newer.t) {
      const t = (renderTime - older.t) / (newer.t - older.t);
      player.displayX = older.x + (newer.x - older.x) * t;
      player.displayY = older.y + (newer.y - older.y) * t;
      return;
    }
  }

  // Fallback: use newest known
  const latest = buf[buf.length - 1];
  player.displayX = latest.x;
  player.displayY = latest.y;
}

export function tickRemotePlayers(
  players: Map<string, RemotePlayer>,
  now: number
): void {
  for (const player of players.values()) {
    interpolateRemotePlayer(player, now);
  }
}
