/** Strip hop-by-hop and rebuild-safe headers. Host/Content-Length come from fetch(URL, body). */
const DROP = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function hasApiKeyCredentials(h: Headers): boolean {
  const x = h.get("x-api-key");
  if (x != null && x.trim() !== "") return true;
  const auth = h.get("authorization");
  return auth != null && /^bearer\s+\S+/i.test(auth);
}

/**
 * Same idea as proxy.js: forward incoming headers to Anthropic, minus hop-by-hop.
 * Optionally set x-api-key from env only when the client sent no key and no Bearer token.
 */
export function forwardToAnthropicHeaders(req: Request): Headers {
  const out = new Headers();
  req.headers.forEach((value, name) => {
    if (DROP.has(name.toLowerCase())) return;
    out.append(name, value);
  });

  const envKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (envKey && !hasApiKeyCredentials(out)) {
    out.set("x-api-key", envKey);
  }

  out.set("content-type", "application/json");
  return out;
}
