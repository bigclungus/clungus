// Clungiverse Results Scene
// Post-run stats display

import type { DungeonClientState, PersonaSlug } from '../state';
import { PERSONAS } from '../state';

interface ResultsScene {
  enter(state: DungeonClientState): void;
  update(state: DungeonClientState, dt: number): void;
  render(state: DungeonClientState, ctx: CanvasRenderingContext2D): void;
  exit(state: DungeonClientState): void;
}

let clickHandler: ((e: MouseEvent) => void) | null = null;
let returnButtonHit: { x: number; y: number; w: number; h: number } | null = null;

export function createResultsScene(
  onReturnToCommons: () => void,
): ResultsScene {
  return {
    enter(_state: DungeonClientState): void {
      returnButtonHit = null;

      clickHandler = (e: MouseEvent) => {
        if (!returnButtonHit) return;
        const mx = e.clientX;
        const my = e.clientY;
        const b = returnButtonHit;
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          onReturnToCommons();
        }
      };

      window.addEventListener('click', clickHandler);
    },

    update(_state: DungeonClientState, _dt: number): void {
      // Static display
    },

    render(state: DungeonClientState, ctx: CanvasRenderingContext2D): void {
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;
      const results = state.results;

      // Background
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, results?.outcome === 'victory' ? '#0d1a0d' : '#1a0d0d');
      grad.addColorStop(1, '#0a0a0a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      if (!results) {
        ctx.fillStyle = '#888888';
        ctx.font = '16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Loading results...', w / 2, h / 2);
        return;
      }

      // Outcome header
      const isVictory = results.outcome === 'victory';
      ctx.fillStyle = isVictory ? '#44dd44' : '#dd4444';
      ctx.font = 'bold 32px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(isVictory ? 'VICTORY' : 'DEFEATED', w / 2, 60);

      // Summary stats
      let sy = 100;
      ctx.fillStyle = '#cccccc';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';

      ctx.fillText(`Floor Reached: ${results.floorReached} / ${results.totalFloors}`, w / 2, sy);
      sy += 24;

      const totalSec = Math.floor(results.durationMs / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      ctx.fillText(`Time: ${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`, w / 2, sy);
      sy += 24;

      ctx.fillText(`Total Kills: ${results.kills}`, w / 2, sy);
      sy += 24;

      ctx.fillText(`Damage Dealt: ${results.damageDealt}`, w / 2, sy);
      sy += 24;

      ctx.fillText(`Damage Taken: ${results.damageTaken}`, w / 2, sy);
      sy += 40;

      // Player breakdown table
      if (results.players.length > 0) {
        ctx.fillStyle = '#aaaaaa';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('Player Breakdown', w / 2, sy);
        sy += 24;

        // Header row
        ctx.font = '10px monospace';
        ctx.fillStyle = '#888888';
        const colX = w / 2 - 220;
        ctx.textAlign = 'left';
        ctx.fillText('Player', colX, sy);
        ctx.fillText('Kills', colX + 120, sy);
        ctx.fillText('Dmg Dealt', colX + 170, sy);
        ctx.fillText('Dmg Taken', colX + 260, sy);
        ctx.fillText('Healed', colX + 350, sy);
        ctx.fillText('Deaths', colX + 410, sy);
        sy += 4;

        // Separator
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(colX, sy);
        ctx.lineTo(colX + 460, sy);
        ctx.stroke();
        sy += 14;

        for (const pr of results.players) {
          const persona = PERSONAS[pr.personaSlug];
          const color = persona?.color ?? '#888888';

          // Colored dot
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(colX + 4, sy - 3, 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#cccccc';
          ctx.font = '10px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(pr.name || pr.personaSlug, colX + 14, sy);
          ctx.fillText(String(pr.kills), colX + 120, sy);
          ctx.fillText(String(pr.damageDealt), colX + 170, sy);
          ctx.fillText(String(pr.damageTaken), colX + 260, sy);
          // Healed in green
          ctx.fillStyle = pr.totalHealing > 0 ? '#44dd88' : '#666666';
          ctx.fillText(pr.totalHealing > 0 ? `+${pr.totalHealing}` : '-', colX + 350, sy);
          ctx.fillStyle = '#cccccc';
          ctx.fillText(pr.diedOnFloor !== null ? `F${pr.diedOnFloor}` : '-', colX + 410, sy);

          sy += 20;
        }
      }

      // Return button
      const btnW = 200;
      const btnH = 40;
      const btnX = (w - btnW) / 2;
      const btnY = Math.min(sy + 30, h - 70);

      returnButtonHit = { x: btnX, y: btnY, w: btnW, h: btnH };

      ctx.fillStyle = '#2a2a4e';
      ctx.fillRect(btnX, btnY, btnW, btnH);
      ctx.strokeStyle = '#6666aa';
      ctx.lineWidth = 1;
      ctx.strokeRect(btnX, btnY, btnW, btnH);

      ctx.fillStyle = '#dddddd';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('RETURN TO COMMONS', btnX + btnW / 2, btnY + 25);
    },

    exit(_state: DungeonClientState): void {
      if (clickHandler) {
        window.removeEventListener('click', clickHandler);
        clickHandler = null;
      }
      returnButtonHit = null;
    },
  };
}
