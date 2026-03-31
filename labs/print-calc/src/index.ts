const LAB_NAME = "print-calc";
const PORT = 8108;

function calcHTML(base: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>3D Print Calculator</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: ui-monospace, monospace; max-width: 680px; margin: 60px auto; padding: 0 20px;
           background: #0d0d0d; color: #e0e0e0; }
    h1 { font-size: 1.4rem; margin-bottom: 4px; }
    .sub { color: #888; font-size: 0.85rem; margin-bottom: 32px; }
    label { display: block; font-size: 0.85rem; color: #aaa; margin-bottom: 4px; }
    input, select {
      width: 100%; padding: 8px 10px; background: #1a1a1a; border: 1px solid #333;
      color: #e0e0e0; font-family: inherit; font-size: 0.95rem; border-radius: 4px;
      margin-bottom: 18px;
    }
    input:focus, select:focus { outline: none; border-color: #7eb8f7; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    button {
      width: 100%; padding: 10px; background: #7eb8f7; color: #0d0d0d;
      border: none; font-family: inherit; font-size: 1rem; font-weight: 700;
      border-radius: 4px; cursor: pointer; margin-top: 4px;
    }
    button:hover { background: #a8d0ff; }
    #result { display: none; margin-top: 28px; border: 1px solid #333; border-radius: 6px; padding: 20px; }
    #result h2 { font-size: 1rem; color: #7eb8f7; margin: 0 0 16px; }
    .stat { display: flex; justify-content: space-between; padding: 6px 0;
            border-bottom: 1px solid #1e1e1e; font-size: 0.9rem; }
    .stat:last-child { border-bottom: none; }
    .stat .val { color: #fff; font-weight: 600; }
    .note { margin-top: 14px; font-size: 0.78rem; color: #666; }
  </style>
</head>
<body>
  <h1>3D Print Calculator</h1>
  <p class="sub">Estimate print time and filament before you send the job.</p>

  <form id="f">
    <div class="row">
      <div>
        <label>Layer count</label>
        <input type="number" id="layers" min="1" step="1" value="200" required>
      </div>
      <div>
        <label>Layer height (mm)</label>
        <input type="number" id="lh" min="0.05" max="1" step="0.01" value="0.2" required>
      </div>
    </div>
    <div class="row">
      <div>
        <label>Average print speed (mm/s)</label>
        <input type="number" id="speed" min="1" max="1000" step="1" value="50" required>
      </div>
      <div>
        <label>Avg perimeter length per layer (mm)</label>
        <input type="number" id="perim" min="1" step="1" value="400"
          title="Rough total extrusion path per layer. For a 20mm cube with 2 walls: ~320mm. Scale up for larger prints." required>
      </div>
    </div>
    <div class="row">
      <div>
        <label>Infill % (0–100)</label>
        <input type="number" id="infill" min="0" max="100" step="1" value="20" required>
      </div>
      <div>
        <label>Infill area per layer (mm²)</label>
        <input type="number" id="area" min="0" step="1" value="400"
          title="Cross-sectional area of the print to be filled. For a 20mm cube: 400mm²." required>
      </div>
    </div>
    <div class="row">
      <div>
        <label>Filament diameter (mm)</label>
        <select id="diam">
          <option value="1.75" selected>1.75 mm</option>
          <option value="2.85">2.85 mm</option>
        </select>
      </div>
      <div>
        <label>Material</label>
        <select id="mat">
          <option value="1.24" selected>PLA (1.24 g/cm³)</option>
          <option value="1.27">PETG (1.27 g/cm³)</option>
          <option value="1.05">ABS (1.05 g/cm³)</option>
          <option value="1.21">ASA (1.21 g/cm³)</option>
          <option value="1.14">Nylon (1.14 g/cm³)</option>
          <option value="1.30">TPU (1.30 g/cm³)</option>
        </select>
      </div>
    </div>
    <button type="submit">Calculate</button>
  </form>

  <div id="result">
    <h2>Estimated Results</h2>
    <div class="stat"><span>Print height</span><span class="val" id="r-height"></span></div>
    <div class="stat"><span>Estimated print time</span><span class="val" id="r-time"></span></div>
    <div class="stat"><span>Filament length</span><span class="val" id="r-len"></span></div>
    <div class="stat"><span>Filament weight</span><span class="val" id="r-weight"></span></div>
    <div class="stat"><span>Filament volume</span><span class="val" id="r-vol"></span></div>
    <p class="note">Estimates assume constant speed and uniform infill. Acceleration, support, travel, and retraction add 20–40% to real print time. Slicer previews are more accurate for final jobs.</p>
  </div>

  <script>
    document.getElementById('f').addEventListener('submit', function(e) {
      e.preventDefault();
      const layers  = parseFloat(document.getElementById('layers').value);
      const lh      = parseFloat(document.getElementById('lh').value);
      const speed   = parseFloat(document.getElementById('speed').value);   // mm/s
      const perim   = parseFloat(document.getElementById('perim').value);   // mm per layer
      const infill  = parseFloat(document.getElementById('infill').value) / 100;
      const area    = parseFloat(document.getElementById('area').value);    // mm²
      const diam    = parseFloat(document.getElementById('diam').value);    // mm
      const density = parseFloat(document.getElementById('mat').value);     // g/cm³

      // Extrusion cross-section of the bead (approximate as rectangle lh x w, w ~ lh)
      const beadW   = lh * 1.1;  // slightly wider than tall
      const beadArea = lh * beadW; // mm²

      // Volume extruded per layer (perimeter + infill)
      const infillLineSpacing = beadW * 2;
      const infillLines = area / infillLineSpacing;
      const infillLen   = infillLines * Math.sqrt(area) * infill; // rough snake path
      const perimLen    = perim;
      const totalLenPerLayer = perimLen + infillLen; // mm extrusion path per layer
      const totalExtrusionLen = totalLenPerLayer * layers; // mm

      // Convert extrusion path length to filament length consumed
      const filamentRadius = diam / 2;
      const filamentArea   = Math.PI * filamentRadius * filamentRadius; // mm²
      const filamentLen    = (beadArea * totalExtrusionLen) / filamentArea; // mm

      // Weight
      const volumeCm3 = (filamentArea * filamentLen) / 1000; // mm³ -> cm³
      const weightG   = volumeCm3 * density;

      // Time — total path at speed (no accel correction here, noted in disclaimer)
      const totalPathMm = totalExtrusionLen;
      const timeSec     = totalPathMm / speed;

      // Formatting
      const heightMm = layers * lh;
      const h = Math.floor(timeSec / 3600);
      const m = Math.floor((timeSec % 3600) / 60);
      const s = Math.floor(timeSec % 60);
      const timeStr = h > 0 ? h + 'h ' + m + 'm' : m + 'm ' + s + 's';

      document.getElementById('r-height').textContent  = heightMm.toFixed(1) + ' mm';
      document.getElementById('r-time').textContent    = timeStr;
      document.getElementById('r-len').textContent     = (filamentLen / 1000).toFixed(2) + ' m';
      document.getElementById('r-weight').textContent  = weightG.toFixed(1) + ' g';
      document.getElementById('r-vol').textContent     = volumeCm3.toFixed(2) + ' cm³';
      document.getElementById('result').style.display  = 'block';
    });
  </script>
</body>
</html>`;
}

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    const base = req.headers.get("X-Lab-Base-Path") ?? "";

    if (url.pathname === `${base}/` || url.pathname === `${base}` || url.pathname === "/" || url.pathname === "") {
      return new Response(calcHTML(base), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response("not found", { status: 404 });
  },
});

console.log(`${LAB_NAME} lab listening on port ${PORT}`);
