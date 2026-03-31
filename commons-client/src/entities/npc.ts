// entities/npc.ts — NPC snapshot interpolation (server-authoritative)

import {
  NPC, NPCSnapshot,
  INTERPOLATION_DELAY_MS, SNAPSHOT_BUFFER_SIZE,
} from "../state.ts";

export function addNPCSnapshot(npc: NPC, snap: NPCSnapshot): void {
  npc.snapshots.push(snap);
  if (npc.snapshots.length > SNAPSHOT_BUFFER_SIZE) {
    npc.snapshots.shift();
  }
}

export function interpolateNPC(npc: NPC, now: number): void {
  const renderTime = now - INTERPOLATION_DELAY_MS;
  const buf = npc.snapshots;

  if (buf.length === 0) return;

  for (let i = buf.length - 1; i > 0; i--) {
    const newer = buf[i];
    const older = buf[i - 1];
    if (older.t <= renderTime && renderTime <= newer.t) {
      const t = (renderTime - older.t) / (newer.t - older.t);
      npc.displayX = older.x + (newer.x - older.x) * t;
      npc.displayY = older.y + (newer.y - older.y) * t;
      return;
    }
  }

  const latest = buf[buf.length - 1];
  npc.displayX = latest.x;
  npc.displayY = latest.y;
}

export function tickNPCs(npcs: Map<string, NPC>, now: number): void {
  for (const npc of npcs.values()) {
    interpolateNPC(npc, now);
    // Expire blurbs client-side (belt-and-suspenders — server also clears them)
    if (npc.blurbExpiry !== undefined && performance.now() > npc.blurbExpiry) {
      npc.blurb = undefined;
      npc.blurbExpiry = undefined;
    }
  }
}
