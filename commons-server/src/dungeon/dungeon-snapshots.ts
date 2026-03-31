// Dungeon Snapshot Builders + Results + Persistence
// Extracted from dungeon-loop.ts to separate the "what happened this tick" output
// from the "how the tick runs" logic.

import type {
  DungeonInstance,
  DungeonPlayerSnapshot,
  EnemySnapshot,
  ProjectileSnapshot,
  AoEZoneSnapshot,
  DungeonResultsMessage,
} from "./dungeon-protocol.ts";

import { saveRunResult } from "../persistence.ts";

// ─── Player snapshots ─────────────────────────────────────────────────────────

export function buildPlayerSnapshots(instance: DungeonInstance): DungeonPlayerSnapshot[] {
  const snaps: DungeonPlayerSnapshot[] = [];

  const anyAlive = Array.from(instance.players.values()).some(
    (p) => p.hp > 0 && p.diedOnFloor === null
  );

  for (const [_id, p] of instance.players) {
    const isDead = p.diedOnFloor !== null || p.hp <= 0;
    const spectating = isDead && anyAlive;
    snaps.push({
      id: p.id,
      name: p.name,
      personaSlug: p.personaSlug,
      x: p.x,
      y: p.y,
      facing: p.facing,
      hp: p.hp,
      maxHp: p.maxHp,
      iframeTicks: p.iframeTicks,
      cooldownRemaining: p.cooldownTicks,
      scramblingTicks: p.scramblingTicks,
      activeTempPowerups: p.activeTempPowerups.map((a) => ({
        templateId: a.templateId,
        expiresAt: a.expiresAt,
      })),
      spectating,
    });
  }
  return snaps;
}

// ─── Enemy snapshots ──────────────────────────────────────────────────────────

export function buildEnemySnapshots(instance: DungeonInstance): EnemySnapshot[] {
  const snaps: EnemySnapshot[] = [];
  for (const [_id, e] of instance.enemies) {
    if (e.hp <= 0) continue;
    snaps.push({
      id: e.id,
      variantName: e.variantName,
      behavior: e.behavior,
      x: e.x,
      y: e.y,
      hp: e.hp,
      maxHp: e.maxHp,
      isBoss: e.isBoss,
      telegraphing: e.telegraphing,
    });
  }
  return snaps;
}

// ─── Projectile snapshots ─────────────────────────────────────────────────────

export function buildProjectileSnapshots(instance: DungeonInstance): ProjectileSnapshot[] {
  const snaps: ProjectileSnapshot[] = [];
  for (const [_id, p] of instance.projectiles) {
    snaps.push({
      id: p.id,
      x: p.x,
      y: p.y,
      radius: p.radius,
      fromEnemy: p.fromEnemy,
      ownerId: p.ownerId,
    });
  }
  return snaps;
}

// ─── AoE zone snapshots ───────────────────────────────────────────────────────

export function buildAoEZoneSnapshots(instance: DungeonInstance): AoEZoneSnapshot[] {
  const snaps: AoEZoneSnapshot[] = [];
  for (const [_id, z] of instance.aoeZones) {
    snaps.push({
      id: z.id,
      x: z.x,
      y: z.y,
      radius: z.radius,
      ticksRemaining: z.ticksRemaining,
      zoneType: z.zoneType,
    });
  }
  return snaps;
}

// ─── Floor pickup snapshots ───────────────────────────────────────────────────

export interface FloorPickupSnap {
  id: string;
  templateId: string;
  type: 'temp_powerup' | 'health';
  healAmount?: number;
  x: number;
  y: number;
}

export function buildFloorPickupSnapshots(instance: DungeonInstance): FloorPickupSnap[] {
  const snaps: FloorPickupSnap[] = [];
  for (const [_id, pickup] of instance.floorPickups) {
    if (pickup.pickedUpBy !== null) continue;
    const snap: FloorPickupSnap = {
      id: pickup.id,
      templateId: pickup.templateId,
      type: pickup.type,
      x: pickup.x,
      y: pickup.y,
    };
    if (pickup.healAmount !== undefined) snap.healAmount = pickup.healAmount;
    snaps.push(snap);
  }
  return snaps;
}

// ─── Results message ──────────────────────────────────────────────────────────

export function buildResults(
  instance: DungeonInstance,
  outcome: "victory" | "death",
): DungeonResultsMessage {
  const durationMs = Date.now() - instance.startedAt;
  const players = Array.from(instance.players.values()).map((p) => ({
    playerId: p.id,
    name: p.name,
    personaSlug: p.personaSlug,
    kills: p.kills,
    damageDealt: p.damageDealt,
    damageTaken: p.damageTaken,
    totalHealing: p.totalHealing,
    diedOnFloor: p.diedOnFloor,
  }));

  return {
    type: "d_results",
    outcome,
    floorReached: instance.floor,
    durationMs,
    players,
  };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

export function persistRunResult(
  instance: DungeonInstance,
  outcome: "victory" | "death",
): void {
  const party = Array.from(instance.players.values()).map((p) => ({
    name: p.name,
    personaSlug: p.personaSlug,
  }));
  const durationMs = Date.now() - instance.startedAt;
  try {
    saveRunResult(outcome, instance.floor, durationMs, party);
  } catch (err) {
    console.error("[dungeon-loop] Failed to persist run result:", err);
  }
}
