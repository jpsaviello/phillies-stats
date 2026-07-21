export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// Sends the full text-only history to the backend chat route; the Claude
// tool-use loop runs server-side and only the final answer text comes back.
export async function sendChat(messages: ChatMessage[]): Promise<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
  if (!res.ok) {
    let backendError: string | undefined
    try {
      const data = (await res.json()) as { error?: string }
      backendError = data.error
    } catch {
      // non-JSON error body; fall through to the generic message
    }
    if (res.status === 503) {
      throw new Error("Chat isn't configured — add an Anthropic API key to enable it.")
    }
    throw new Error(backendError ?? 'Something went wrong — please try again.')
  }
  const data = (await res.json()) as { reply: string }
  return data.reply
}
