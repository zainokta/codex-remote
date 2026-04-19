import { useMemo, useState } from 'react'
import { cleanTerminalText } from '../../lib/terminalText'

type Props = {
  open: boolean
  buffer: string
  onOpen: () => Promise<void>
  onClose: () => Promise<void>
  onSend: (input: string) => Promise<void>
}

export function TerminalFallbackSheet({ open, buffer, onOpen, onClose, onSend }: Props) {
  const [value, setValue] = useState('')
  const cleanedBuffer = useMemo(() => cleanTerminalText(buffer), [buffer])

  return (
    <section className="panel-card terminal-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Fallback terminal</p>
          <h3>Separate project shell</h3>
        </div>
        <div className="row-actions">
          {open ? <button className="ghost" onClick={onClose}>Close</button> : <button onClick={onOpen}>Open terminal</button>}
        </div>
      </div>
      <pre className="terminal-output">{cleanedBuffer || 'Terminal output will appear here once opened.'}</pre>
      <form
        className="terminal-input"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!value.trim()) return
          await onSend(`${value}\n`)
          setValue('')
        }}
      >
        <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Type a shell command" />
        <button type="submit" disabled={!open}>Send</button>
      </form>
    </section>
  )
}
