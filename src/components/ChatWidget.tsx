import { useEffect, useRef, useState } from 'react'
import { sendChat, type ChatMessage } from '../api/chat'

const STARTER_QUESTIONS = [
  "Who's pitching next?",
  'How did the last game go?',
  'NL East standings?',
]

// Server-side caps (see server/src/chat.ts) — enforced here too so a long
// conversation or pasted wall of text can't wedge every later request.
const MAX_HISTORY = 20
const MAX_MESSAGE_CHARS = 2000

// Locally-generated error bubbles are rendered but never sent to the server,
// so they can't pollute the model's view of the conversation.
type WidgetMessage = ChatMessage & { error?: boolean }

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<WidgetMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const listEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  // Both other overlays (GameLogModal, AuthWidget) close on Escape; on mobile
  // this panel is inset-0 fullscreen, so the header X was the only way out.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function submitQuestion(question: string) {
    const text = question.trim()
    if (text.length === 0 || sending) return
    const nextMessages: WidgetMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setInput('')
    setSending(true)
    const windowed = nextMessages
      .filter(m => !m.error)
      .map(m => ({ role: m.role, content: m.content }))
      .slice(-MAX_HISTORY)
    // The API requires the first message to be user-role; the tail-slice can
    // leave an assistant message first once the history outgrows the window.
    const payload: ChatMessage[] = windowed.slice(windowed.findIndex(m => m.role === 'user'))
    try {
      const reply = await sendChat(payload)
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      const content =
        err instanceof Error ? err.message : 'Something went wrong — please try again.'
      setMessages(prev => [...prev, { role: 'assistant', content, error: true }])
    } finally {
      setSending(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        aria-label="Open chat"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-phillies-red text-white shadow-[0_3px_10px_rgb(0_0_0/0.28)] transition-transform hover:scale-110"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-7 w-7"
          aria-hidden="true"
        >
          <path d="M4.913 2.658c2.075-.27 4.19-.408 6.337-.408 2.147 0 4.262.139 6.337.408 1.922.25 3.291 1.861 3.405 3.727a4.403 4.403 0 0 0-1.032-.211 50.89 50.89 0 0 0-8.42 0c-2.358.196-4.04 2.19-4.04 4.434v4.286a4.47 4.47 0 0 0 2.433 3.984L7.28 21.53A.75.75 0 0 1 6 21v-4.03a48.527 48.527 0 0 1-1.087-.128C2.905 16.58 1.5 14.833 1.5 12.862V6.638c0-1.97 1.405-3.718 3.413-3.98Z" />
          <path d="M15.75 7.5c-1.376 0-2.739.057-4.086.169C10.124 7.797 9 9.103 9 10.609v4.285c0 1.507 1.128 2.814 2.67 2.94 1.243.102 2.5.157 3.768.165l2.782 2.781a.75.75 0 0 0 1.28-.53v-2.39l.33-.026c1.542-.125 2.67-1.433 2.67-2.94v-4.286c0-1.505-1.125-2.811-2.664-2.94A49.392 49.392 0 0 0 15.75 7.5Z" />
        </svg>
      </button>
    )
  }

  return (
    <div
      role="dialog"
      aria-label="Phillies chat"
      className="fixed z-40 inset-0 sm:inset-auto sm:bottom-4 sm:right-4 sm:w-96 sm:max-h-[70vh] flex flex-col bg-panel-raised border-2 border-rule-heavy overflow-hidden"
    >
      <div className="flex items-center justify-between bg-phillies-navy px-4 py-3 text-white">
        <h2 className="font-display text-lg uppercase tracking-wide">Phils Chat</h2>
        <button
          type="button"
          aria-label="Close chat"
          onClick={() => setOpen(false)}
          className="rounded p-2.5 -m-1 text-white/80 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div aria-live="polite" className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              Ask me anything about the Phillies — games, pitchers, stats, standings.
            </p>
            {STARTER_QUESTIONS.map(q => (
              <button
                key={q}
                type="button"
                onClick={() => submitQuestion(q)}
                className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-sm text-mark hover:bg-gray-50"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === 'user' ? 'bg-phillies-red text-white' : 'bg-gray-100 text-gray-900'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-gray-100 px-3 py-2">
              <span className="animate-pulse text-gray-500">●</span>
              <span className="animate-pulse text-gray-500 [animation-delay:150ms]"> ●</span>
              <span className="animate-pulse text-gray-500 [animation-delay:300ms]"> ●</span>
            </div>
          </div>
        )}
        <div ref={listEndRef} />
      </div>

      <form
        className="flex gap-2 border-t border-gray-200 p-3"
        onSubmit={e => {
          e.preventDefault()
          submitQuestion(input)
        }}
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={sending}
          maxLength={MAX_MESSAGE_CHARS}
          placeholder="Ask about the Phillies…"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-phillies-navy focus:outline-none disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded-lg bg-phillies-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}
