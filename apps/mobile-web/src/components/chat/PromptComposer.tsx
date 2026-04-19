import { useEffect, useMemo, useRef, useState } from 'react'
import type { AutocompleteSuggestion } from '@codex-remote/shared-types'
import { fetchAutocomplete } from '../../lib/api'
import { detectAutocomplete } from '../../lib/promptAutocomplete'

type Props = {
  onSubmit: (prompt: string) => Promise<void>
  busy?: boolean
}

export function PromptComposer({ onSubmit, busy = false }: Props) {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const autocomplete = useMemo(() => detectAutocomplete(value, textareaRef.current?.selectionStart ?? value.length), [value])

  useEffect(() => {
    let cancelled = false
    if (!autocomplete || sending || busy) {
      setSuggestions([])
      return
    }
    fetchAutocomplete(autocomplete.mode, autocomplete.query)
      .then((payload) => {
        if (!cancelled) setSuggestions(payload.suggestions)
      })
      .catch(() => {
        if (!cancelled) setSuggestions([])
      })
    return () => {
      cancelled = true
    }
  }, [autocomplete, sending, busy])

  async function submit() {
    const prompt = value.trim()
    if (!prompt || sending || busy) return
    setSending(true)
    try {
      await onSubmit(prompt)
      setValue('')
      setSuggestions([])
    } finally {
      setSending(false)
    }
  }

  function applySuggestion(suggestion: AutocompleteSuggestion) {
    const target = textareaRef.current
    if (!target || !autocomplete || sending || busy) return
    const [start, end] = autocomplete.replaceRange
    const nextValue = `${value.slice(0, start)}${suggestion.insertText}${value.slice(end)}`
    setValue(nextValue)
    setSuggestions([])
    requestAnimationFrame(() => {
      target.focus()
      const caret = start + suggestion.insertText.length
      target.selectionStart = caret
      target.selectionEnd = caret
    })
  }

  return (
    <section className="composer-card">
      <div className="composer-heading-row">
        <div>
          <p className="eyebrow">Prompt</p>
          <h3>{busy ? 'Codex is finishing the last turn' : 'Send the next task'}</h3>
        </div>
        <div className={`composer-status-dot ${busy ? 'is-busy' : 'is-ready'}`} aria-hidden="true" />
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        disabled={sending || busy}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={async (event) => {
          if (event.key === 'ArrowDown' && suggestions.length > 0) {
            event.preventDefault()
            setActiveIndex((current) => (current + 1) % suggestions.length)
            return
          }
          if (event.key === 'ArrowUp' && suggestions.length > 0) {
            event.preventDefault()
            setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length)
            return
          }
          if (event.key === 'Enter' && !event.shiftKey && suggestions.length === 0) {
            event.preventDefault()
            await submit()
            return
          }
          if (event.key === 'Tab' && suggestions[activeIndex]) {
            event.preventDefault()
            applySuggestion(suggestions[activeIndex])
          }
        }}
        placeholder={busy ? 'Codex is still working…' : sending ? 'Sending prompt…' : 'Prompt Codex, or type / for commands and $ for skills…'}
      />

      {suggestions.length > 0 ? (
        <div className="suggestion-list">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.label}
              className={index === activeIndex ? 'active' : ''}
              type="button"
              disabled={sending || busy}
              onClick={() => applySuggestion(suggestion)}
            >
              <strong>{suggestion.label}</strong>
              <span>{suggestion.description}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="composer-footer">
        <p>{busy ? 'Wait for the current reply to finish before sending another prompt.' : 'Slash commands and skills stay touch-friendly on mobile.'}</p>
        <button onClick={() => void submit()} disabled={sending || busy || !value.trim()}>{busy ? 'Working…' : sending ? 'Sending…' : 'Send'}</button>
      </div>
    </section>
  )
}
