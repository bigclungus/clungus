const INJECT_URL = 'http://127.0.0.1:8085/webhooks/bigclungus-main'
const MAIN_CHANNEL = '1485343472952148008'

export async function injectDiscord(content: string, chatId = MAIN_CHANNEL, user = 'system'): Promise<void> {
  const resp = await fetch(INJECT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content, chat_id: chatId, user }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!resp.ok) {
    throw new Error(`injectDiscord failed: HTTP ${resp.status.toString()}`)
  }
}
