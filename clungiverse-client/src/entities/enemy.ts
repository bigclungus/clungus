// Clungiverse Enemy Client-Side Logic
// Interpolation and visual state cues

import type { DungeonClientState, ClientEnemy } from '../state';
import { getInterpolatedPos } from './remote-player';

export interface EnemyRenderInfo {
  x: number;
  y: number;
  enemy: ClientEnemy;
  telegraphProgress: number;
}

export function getEnemyRenderInfos(state: DungeonClientState): EnemyRenderInfo[] {
  const results: EnemyRenderInfo[] = [];

  for (const enemy of state.enemies.values()) {
    if (!enemy.alive) continue;

    const { ix, iy } = getInterpolatedPos(enemy.prevX, enemy.prevY, enemy.x, enemy.y, state);

    // Telegraph progress for brutes (pulsing effect)
    let telegraphProgress = 0;
    if (enemy.telegraphing) {
      telegraphProgress = 0.5 + 0.5 * Math.sin(performance.now() / 100);
    }

    results.push({
      x: ix,
      y: iy,
      enemy,
      telegraphProgress,
    });
  }

  return results;
}

export function getBossRenderInfo(
  state: DungeonClientState,
): EnemyRenderInfo | null {
  const boss = state.boss;
  if (!boss?.alive) return null;

  const { ix, iy } = getInterpolatedPos(boss.prevX, boss.prevY, boss.x, boss.y, state);

  let telegraphProgress = 0;
  if (boss.telegraphing) {
    telegraphProgress = 0.5 + 0.5 * Math.sin(performance.now() / 80);
  }

  return {
    x: ix,
    y: iy,
    enemy: boss,
    telegraphProgress,
  };
}
