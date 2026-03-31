const INJECT_URL = 'http://127.0.0.1:9876/inject'
const INJECT_SECRET = process.env.DISCORD_INJECT_SECRET ?? ''
const MAIN_CHANNEL = '1485343472952148008'

export async function injectDiscord(content: string, chatId = MAIN_CHANNEL, user = 'system'): Promise<void> {
  await fetch(INJECT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-inject-secret': INJECT_SECRET,
    },
    body: JSON.stringify({ content, chat_id: chatId, user }),
  })
}
