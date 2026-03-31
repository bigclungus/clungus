import { Cron } from "croner";

const LAB_NAME = "cron-explain";
const PORT = 8105;

function describeField(
  value: string,
  unit: string,
  _min: number,
  _max: number,
  names?: string[]
): string | null {
  if (value === "*") return null;

  // Step: */5 or 0-59/5
  const stepMatch = value.match(/^(\*|(\d+)-(\d+))\/(\d+)$/);
  if (stepMatch) {
    const step = parseInt(stepMatch[4]);
    if (stepMatch[1] === "*") {
      if (step === 1) return `every ${unit}`;
      return `every ${step} ${unit}s`;
    } else {
      const from = parseInt(stepMatch[2]);
      const to = parseInt(stepMatch[3]);
      const fromLabel = names ? names[from] : String(from);
      const toLabel = names ? names[to] : String(to);
      return `every ${step} ${unit}s from ${fromLabel} to ${toLabel}`;
    }
  }

  // Range: 1-5
  const rangeMatch = value.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) {
    const from = parseInt(rangeMatch[1]);
    const to = parseInt(rangeMatch[2]);
    const fromLabel = names ? names[from] : String(from);
    const toLabel = names ? names[to] : String(to);
    return `${fromLabel} through ${toLabel}`;
  }

  // List: 1,2,3
  if (value.includes(",")) {
    const parts = value.split(",").map((p) => {
      const n = parseInt(p.trim());
      return names ? names[n] : String(n);
    });
    if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
    return parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1];
  }

  // Single value
  const n = parseInt(value);
  return names ? names[n] : String(n);
}

function padTwo(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

function domOrdinal(n: string): string {
  const num = parseInt(n);
  if (isNaN(num)) return n;
  const s = ["th", "st", "nd", "rd"];
  const v = num % 100;
  return num + (s[(v - 20) % 10] || s[v] || s[0]);
}

function describeCron(expr: string): string {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Expected 5 fields, got ${fields.length}`);
  }

  const [minute, hour, dom, month, dow] = fields;

  const DAY_NAMES = [
    "Sunday", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday",
  ];
  const MONTH_NAMES = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  // Special well-known cases
  if (expr.trim() === "* * * * *") return "Every minute";

  const parts: string[] = [];

  // Time description
  if (minute === "*" && hour === "*") {
    parts.push("every minute");
  } else if (hour === "*") {
    const stepMin = minute.match(/^\*\/(\d+)$/);
    if (stepMin) {
      parts.push(`every ${stepMin[1]} minutes`);
    } else if (minute === "0") {
      parts.push("at the top of every hour");
    } else {
      const mDesc = describeField(minute, "minute", 0, 59);
      parts.push(`at minute ${mDesc} of every hour`);
    }
  } else if (minute === "*") {
    const hDesc = describeField(hour, "hour", 0, 23);
    parts.push(`every minute during hour ${hDesc}`);
  } else {
    const stepMin = minute.match(/^\*\/(\d+)$/);
    const stepHr = hour.match(/^\*\/(\d+)$/);
    if (stepMin && stepHr) {
      parts.push(`every ${stepMin[1]} minutes, every ${stepHr[1]} hours`);
    } else if (stepMin) {
      parts.push(`every ${stepMin[1]} minutes`);
    } else if (stepHr) {
      if (minute === "0") {
        parts.push(`every ${stepHr[1]} hours`);
      } else {
        const mDesc = describeField(minute, "minute", 0, 59);
        parts.push(`at minute ${mDesc} every ${stepHr[1]} hours`);
      }
    } else {
      const hourNum = parseInt(hour);
      const minuteNum = parseInt(minute);
      if (!isNaN(hourNum) && !isNaN(minuteNum)) {
        const ampm = hourNum < 12 ? "AM" : "PM";
        const h = hourNum % 12 === 0 ? 12 : hourNum % 12;
        const m = padTwo(minuteNum);
        parts.push(`at ${h}:${m} ${ampm}`);
      } else {
        const mDesc = describeField(minute, "minute", 0, 59) ?? "0";
        const hDesc = describeField(hour, "hour", 0, 23) ?? "every hour";
        parts.push(`at minute ${mDesc} of hour ${hDesc}`);
      }
    }
  }

  // Day of week
  if (dow !== "*") {
    const stepDow = dow.match(/^\*\/(\d+)$/);
    if (stepDow) {
      parts.push(`every ${stepDow[1]} days of the week`);
    } else {
      const dowDesc = describeField(dow, "day", 0, 6, DAY_NAMES);
      if (dowDesc) parts.push(dowDesc);
    }
  }

  // Day of month
  if (dom !== "*") {
    const stepDom = dom.match(/^\*\/(\d+)$/);
    if (stepDom) {
      parts.push(`every ${stepDom[1]} days`);
    } else {
      const domDesc = describeField(dom, "day", 1, 31);
      if (domDesc) parts.push(`on the ${domOrdinal(domDesc)}`);
    }
  }

  // Month
  if (month !== "*") {
    const monthDesc = describeField(month, "month", 1, 12, MONTH_NAMES);
    if (monthDesc) parts.push(`in ${monthDesc}`);
  }

  if (parts.length === 0) return "Custom schedule";
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return first + (parts.length > 1 ? ", " + parts.slice(1).join(", ") : "");
}

function formatDate(d: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const day = days[d.getDay()];
  const mon = months[d.getMonth()];
  const date = d.getDate();
  const year = d.getFullYear();
  const h = padTwo(d.getHours());
  const m = padTwo(d.getMinutes());
  const s = padTwo(d.getSeconds());
  return `${day}, ${mon} ${date} ${year} ${h}:${m}:${s}`;
}

function getNextRuns(expr: string, count: number): string[] {
  const cron = new Cron(expr);
  const runs: string[] = [];
  let prev: Date | undefined = undefined;
  for (let i = 0; i < count; i++) {
    const next = cron.nextRun(prev);
    if (!next) break;
    runs.push(formatDate(next));
    prev = next;
  }
  return runs;
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Cron Explain — labs.clung.us</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', monospace;
      background: #0d0d0d;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 60px 20px 40px;
    }
    h1 {
      font-size: 1.6rem;
      font-weight: 700;
      letter-spacing: -0.5px;
      margin-bottom: 8px;
      color: #fff;
    }
    .subtitle {
      color: #888;
      font-size: 0.85rem;
      margin-bottom: 40px;
    }
    .card {
      background: #161616;
      border: 1px solid #2a2a2a;
      border-radius: 8px;
      padding: 32px;
      width: 100%;
      max-width: 600px;
    }
    label {
      display: block;
      font-size: 0.75rem;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    .input-row {
      display: flex;
      gap: 10px;
    }
    input[type="text"] {
      flex: 1;
      background: #0d0d0d;
      border: 1px solid #333;
      border-radius: 6px;
      color: #e0e0e0;
      font-family: 'Courier New', monospace;
      font-size: 1.1rem;
      padding: 10px 14px;
      outline: none;
      transition: border-color 0.15s;
    }
    input[type="text"]:focus { border-color: #7eb8f7; }
    button {
      background: #7eb8f7;
      border: none;
      border-radius: 6px;
      color: #0d0d0d;
      cursor: pointer;
      font-family: 'Courier New', monospace;
      font-size: 0.9rem;
      font-weight: 700;
      padding: 10px 20px;
      transition: background 0.15s;
      white-space: nowrap;
    }
    button:hover { background: #a8cff9; }
    button:active { background: #5fa0e0; }
    .examples {
      margin-top: 12px;
      font-size: 0.78rem;
      color: #666;
    }
    .examples span {
      cursor: pointer;
      color: #555;
      transition: color 0.1s;
      text-decoration: underline dotted;
    }
    .examples span:hover { color: #7eb8f7; }
    #result { margin-top: 28px; }
    .error {
      background: #1a0d0d;
      border: 1px solid #4a1a1a;
      border-radius: 6px;
      color: #e07070;
      padding: 12px 16px;
      font-size: 0.9rem;
    }
    .description-box {
      background: #0d1a2a;
      border: 1px solid #1a3a5a;
      border-radius: 6px;
      padding: 16px 20px;
      margin-bottom: 16px;
    }
    .description-label {
      font-size: 0.7rem;
      color: #5a8ab0;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 6px;
    }
    .description-text {
      font-size: 1.1rem;
      color: #c8e0f8;
      font-weight: 600;
    }
    .runs-box {
      background: #0d0d0d;
      border: 1px solid #2a2a2a;
      border-radius: 6px;
      padding: 16px 20px;
    }
    .runs-label {
      font-size: 0.7rem;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 10px;
    }
    .run-item {
      padding: 5px 0;
      color: #a0c8a0;
      font-size: 0.9rem;
      border-bottom: 1px solid #1a1a1a;
      display: flex;
      gap: 12px;
    }
    .run-item:last-child { border-bottom: none; }
    .run-num { color: #444; min-width: 24px; }
    .loading {
      color: #555;
      font-size: 0.9rem;
      padding: 20px 0;
      text-align: center;
    }
    .branding {
      margin-top: 40px;
      font-size: 0.72rem;
      color: #333;
    }
    .branding a { color: #444; text-decoration: none; }
    .branding a:hover { color: #666; }
  </style>
</head>
<body>
  <h1>Cron Explain</h1>
  <p class="subtitle">Paste a cron expression — get plain English and the next run times</p>

  <div class="card">
    <label for="expr">Cron expression (5 fields: minute hour day month weekday)</label>
    <div class="input-row">
      <input type="text" id="expr" placeholder="0 9 * * 1-5" autocomplete="off" spellcheck="false">
      <button onclick="explain()">Explain</button>
    </div>
    <div class="examples">
      Examples:
      <span onclick="setExpr('* * * * *')">* * * * *</span> &middot;
      <span onclick="setExpr('*/5 * * * *')">*/5 * * * *</span> &middot;
      <span onclick="setExpr('0 * * * *')">0 * * * *</span> &middot;
      <span onclick="setExpr('0 9 * * 1-5')">0 9 * * 1-5</span> &middot;
      <span onclick="setExpr('30 18 * * 5')">30 18 * * 5</span> &middot;
      <span onclick="setExpr('0 0 1 * *')">0 0 1 * *</span>
    </div>
    <div id="result"></div>
  </div>

  <p class="branding"><a href="https://labs.clung.us">labs.clung.us</a></p>

  <script>
    const BASE_PATH = "%%BASE_PATH%%";
    const input = document.getElementById('expr');
    const result = document.getElementById('result');

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') explain();
    });

    function setExpr(val) {
      input.value = val;
      explain();
    }

    async function explain() {
      const expr = input.value.trim();
      if (!expr) return;
      result.innerHTML = '<div class="loading">parsing...</div>';
      try {
        const resp = await fetch(BASE_PATH + '/api/explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expression: expr }),
        });
        const data = await resp.json();
        if (!resp.ok || data.error) {
          result.innerHTML = '<div class="error">&#9888; ' + (data.error || 'Unknown error') + '</div>';
          return;
        }
        const runs = data.next_runs.map((r, i) =>
          '<div class="run-item"><span class="run-num">' + (i + 1) + '.</span><span>' + r + '</span></div>'
        ).join('');
        result.innerHTML =
          '<div class="description-box">' +
            '<div class="description-label">Schedule</div>' +
            '<div class="description-text">' + data.description + '</div>' +
          '</div>' +
          '<div class="runs-box">' +
            '<div class="runs-label">Next 10 runs</div>' +
            runs +
          '</div>';
      } catch (e) {
        result.innerHTML = '<div class="error">&#9888; Request failed: ' + e.message + '</div>';
      }
    }

    const params = new URLSearchParams(location.search);
    const initial = params.get('expr');
    if (initial) {
      input.value = initial;
      explain();
    }
  </script>
</body>
</html>`;

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Base path injected by the labs-router (e.g. "/cron-explain").
    // Falls back to "" so the lab also works when run directly without the router.
    const base = req.headers.get("X-Lab-Base-Path") ?? "";

    if (url.pathname === "/" || url.pathname === "") {
      return new Response(HTML.replace('"%%BASE_PATH%%"', JSON.stringify(base)), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname === "/api/explain" && req.method === "POST") {
      let body: { expression?: string };
      try {
        body = await req.json();
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const expression = (body.expression ?? "").trim();
      if (!expression) {
        return new Response(
          JSON.stringify({ error: "Missing 'expression' field" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const fields = expression.split(/\s+/);
      if (fields.length !== 5) {
        return new Response(
          JSON.stringify({
            error: `Invalid cron: expected 5 fields (minute hour day month weekday), got ${fields.length}`,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      let description: string;
      let next_runs: string[];

      try {
        description = describeCron(expression);
      } catch (e: any) {
        return new Response(
          JSON.stringify({ error: `Could not parse expression: ${e.message}` }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      try {
        next_runs = getNextRuns(expression, 10);
      } catch (e: any) {
        return new Response(
          JSON.stringify({ error: `Invalid cron expression: ${e.message}` }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ description, next_runs }, null, 2),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("not found", { status: 404 });
  },
});

console.log(`${LAB_NAME} lab listening on port ${PORT}`);
