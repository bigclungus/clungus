const OMNI_URL = "http://127.0.0.1:8085/webhooks/bigclungus-main";
const PORT = 9876;
const HOST = "127.0.0.1";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 600;

const INJECT_SECRET = process.env.DISCORD_INJECT_SECRET ?? "";

if (!INJECT_SECRET) {
  console.warn("[inject] WARNING: DISCORD_INJECT_SECRET is not set — endpoint is unauthenticated");
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method !== "POST" || url.pathname !== "/inject") {
      return new Response("Not Found", { status: 404 });
    }

    if (INJECT_SECRET) {
      const providedSecret = req.headers.get("x-inject-secret") ?? "";
      if (providedSecret !== INJECT_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    let body: { content?: string; user?: string; chat_id?: string };
    try {
      body = await req.json();
    } catch {
      return new Response("Bad Request: invalid JSON", { status: 400 });
    }

    const { content, user, chat_id } = body;

    if (!content) {
      return new Response("Bad Request: missing content", { status: 400 });
    }

    console.log(`[inject] proxying message from=${user ?? "(unknown)"} chat_id=${chat_id ?? "(ignored)"} content="${content.slice(0, 80)}${content.length > 80 ? "..." : ""}"`);

    const omniPayload = { content, user };

    let lastErr: string = "";
    let omniRes: Response | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        omniRes = await fetch(OMNI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(omniPayload),
        });
        if (omniRes.ok) break;
        // Retry on server errors (5xx) or gateway not-ready (404 from omni itself)
        lastErr = `omni responded ${omniRes.status}`;
        console.warn(`[inject] attempt ${attempt}/${MAX_RETRIES}: ${lastErr}`);
        if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * attempt);
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
        console.warn(`[inject] attempt ${attempt}/${MAX_RETRIES}: request failed: ${lastErr}`);
        if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * attempt);
      }
    }

    if (!omniRes) {
      console.error(`[inject] all ${MAX_RETRIES} attempts failed: ${lastErr}`);
      return new Response(`Bad Gateway: ${lastErr}`, { status: 502 });
    }

    const responseText = await omniRes.text();
    console.log(`[inject] omni responded ${omniRes.status}`);

    return new Response(responseText, {
      status: omniRes.status,
      headers: { "Content-Type": omniRes.headers.get("Content-Type") ?? "text/plain" },
    });
  },
});

console.log(`[inject] listening on ${HOST}:${PORT} -> ${OMNI_URL}`);
