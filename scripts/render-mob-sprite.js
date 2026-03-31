#!/usr/bin/env node
// render-mob-sprite.js
// Renders a mob sprite JS function to a 64x64 PNG.
//
// Usage:
//   node render-mob-sprite.js <slug> <output_path>
//   The JS function body is read from stdin (the full drawSprite_<slug> function text).
//
// The script:
//   1. Creates a 64x64 canvas
//   2. Evaluates the draw function (uses only ctx.fillStyle + ctx.fillRect)
//   3. Calls drawSprite_<slug>(ctx, 32, 32)  (centered on the canvas)
//   4. Saves to <output_path> as PNG

'use strict';

const path = require('path');
const fs = require('fs');
const { createCanvas } = require(path.join(__dirname, 'node_modules_canvas', 'node_modules', 'canvas'));

const [, , slug, outputPath] = process.argv;

if (!slug || !outputPath) {
  console.error('Usage: render-mob-sprite.js <slug> <output_path>');
  process.exit(1);
}

let jsCode = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { jsCode += chunk; });
process.stdin.on('end', () => {
  const fnName = `drawSprite_${slug}`;

  // Create canvas
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext('2d');

  // Evaluate the sprite function in a sandboxed scope.
  // The function only uses ctx.fillStyle and ctx.fillRect so this is safe.
  // We stub `window` to absorb the window.drawSprite_X = drawSprite_X registration line.
  try {
    // eslint-disable-next-line no-new-func
    const factory = new Function('ctx', 'window', `
      ${jsCode}
      if (typeof ${fnName} === 'function') {
        ${fnName}(ctx, 32, 32);
      } else {
        throw new Error('Function ${fnName} not found in provided code');
      }
    `);
    // Pass a stub window object so registration lines don't throw
    factory(ctx, {});
  } catch (err) {
    console.error(`Failed to render sprite '${fnName}': ${err.message}`);
    process.exit(1);
  }

  // Ensure output directory exists
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Write PNG
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Rendered ${fnName} -> ${outputPath} (${buffer.length} bytes)`);
});
