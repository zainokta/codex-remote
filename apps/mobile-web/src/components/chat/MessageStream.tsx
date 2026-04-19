import { useEffect, useRef } from 'react'
import type { SessionMessage } from '@codex-remote/shared-types'

type Props = {
  messages: SessionMessage[]
}

export function MessageStream({ messages }: Props) {
  const containerRef = useRef<HTMLElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    if (distanceFromBottom < 160) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages])

  if (messages.length === 0) {
    return (
      <section className="empty-state">
        <p className="eyebrow">Ready</p>
        <h2>Pick up this session and keep the conversation moving.</h2>
        <p>
          Your next prompt will appear here with streamed replies, approvals, and project context — optimized for one-handed mobile use.
        </p>
      </section>
    )
  }

  return (
    <section ref={containerRef} className="message-list" aria-live="polite">
      {messages.map((message) => (
        <article key={message.id} className={`message-card ${message.role}`}>
          <div className="message-meta-row">
            <div className="message-role-pill">{message.role === 'user' ? 'You' : message.role === 'assistant' ? 'Codex' : 'System'}</div>
            {message.phase ? <div className="message-phase">{message.phase.replaceAll('_', ' ')}</div> : null}
          </div>
          <pre>{message.text}</pre>
        </article>
      ))}
      <div ref={bottomRef} style={{ height: 1 }} />
    </section>
  )
}
