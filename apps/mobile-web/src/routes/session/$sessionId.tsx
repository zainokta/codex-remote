import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { ProjectSessionSummary, SessionEvent, SessionSnapshot } from '@codex-remote/shared-types'
import { useEffect, useMemo, useState } from 'react'
import { ApprovalBar } from '../../components/approvals/ApprovalBar'
import { MessageStream } from '../../components/chat/MessageStream'
import { PromptComposer } from '../../components/chat/PromptComposer'
import { DiffReviewSheet } from '../../components/diff/DiffReviewSheet'
import { createSession, createSessionEventSource, fetchAutocomplete, fetchSession, listProjectSessions, respondToApproval, resumeSession, sendPrompt } from '../../lib/api'
import { parseSlashCommand } from '../../lib/slashCommands'

export const Route = createFileRoute('/session/$sessionId')({ component: SessionPage })

function SessionPage() {
  const { sessionId } = Route.useParams()
  const navigate = useNavigate()
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null)
  const [connectionState, setConnectionState] = useState<'connecting' | 'live' | 'error'>('connecting')
  const [approvalPending, setApprovalPending] = useState<Record<string, boolean>>({})
  const [projectSessions, setProjectSessions] = useState<ProjectSessionSummary[]>([])
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false)

  useEffect(() => {
    let source: EventSource | null = null
    let active = true
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const syncSnapshot = async () => {
      try {
        const payload = await fetchSession(sessionId)
        if (!active) return payload
        setSnapshot((current) => !current || payload.lastEventSequence > current.lastEventSequence ? payload : current)
        setConnectionState((curr) => curr === 'error' ? 'connecting' : curr)
        return payload
      } catch (err) {
        setConnectionState('error')
        throw err
      }
    }

    const connect = async () => {
      if (!active) return
      try {
        const payload = await syncSnapshot()

        source = createSessionEventSource(sessionId, (event) => {
          setConnectionState('live')
          setSnapshot((current) => reduceSnapshot(current ?? payload, event))
        }, payload.lastEventSequence)

        source.onerror = () => {
          if (!active) return
          setConnectionState('error')
          source?.close()
          retryTimer = setTimeout(connect, 3000)
        }
      } catch (err) {
        retryTimer = setTimeout(connect, 5000)
      }
    }

    void connect()
    pollTimer = setInterval(() => {
      if (snapshot?.status === 'idle' && connectionState === 'live') return
      void syncSnapshot().catch(() => undefined)
    }, 5000)

    return () => {
      active = false
      source?.close()
      clearInterval(pollTimer)
      clearTimeout(retryTimer)
    }
  }, [sessionId])

  useEffect(() => {
    if (!snapshot?.projectPath) return
    let cancelled = false
    void listProjectSessions(snapshot.projectPath)
      .then((payload) => {
        if (!cancelled) setProjectSessions(payload.sessions)
      })
      .catch(() => {
        if (!cancelled) setProjectSessions([])
      })
    return () => {
      cancelled = true
    }
  }, [snapshot?.projectPath, snapshot?.lastEventSequence])

  const title = useMemo(() => snapshot?.projectPath.split('/').at(-1) ?? 'Session', [snapshot?.projectPath])

  const addLocalMessage = (role: 'assistant' | 'system', text: string) => {
    setSnapshot((current) => current ? {
      ...current,
      messages: [...current.messages, { id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`, role, text }],
    } : current)
  }

  const handleSlashCommand = async (prompt: string) => {
    const action = parseSlashCommand(prompt)
    if (!action) return false

    switch (action.type) {
      case 'local':
        if (action.command === 'help') {
          addLocalMessage('assistant', 'Supported slash commands: /help, /status, /clear, /plan, /cancel, /trace, /skills')
        } else if (action.command === 'status') {
          addLocalMessage('assistant', `Status: ${snapshot.status}
Project: ${snapshot.projectPath}
Connection: ${connectionState}
Messages: ${snapshot.messages.length}`)
        } else {
          const payload = await fetchAutocomplete('skill', '')
          const skills = payload.suggestions.map((item) => item.label).join(', ') || 'No skills found.'
          addLocalMessage('assistant', `Available skills: ${skills}`)
        }
        return true
      case 'clear': {
        const created = await createSession(snapshot.projectPath)
        await navigate({ to: '/session/$sessionId', params: { sessionId: created.sessionId } })
        return true
      }
      case 'proxy':
        setSnapshot((current) => current ? {
          ...current,
          status: 'active',
          messages: [...current.messages, { id: `local-${Date.now()}`, role: 'user', text: prompt }],
        } : current)
        await sendPrompt(sessionId, action.prompt)
        return true
      case 'unsupported':
        addLocalMessage('assistant', `Unsupported slash command: ${action.command}`)
        return true
    }
  }


  if (!snapshot) {
    return <main className="page-grid"><section className="panel-card">Connecting to session…</section></main>
  }

  return (
    <main className="page-grid session-grid">
      <section className="panel-card session-header">
        <div className="session-header-copy">
          <p className="eyebrow">{connectionState === 'live' ? 'Live session' : 'Connecting'}</p>
          <h2>{title}</h2>
          <p>{snapshot.projectPath}</p>
        </div>
        <div className="session-header-meta">
          <span className={`status-pill ${snapshot.status}`}>{snapshot.status}</span>
          <span className={`status-pill connection-${connectionState}`}>{connectionState}</span>
        </div>
      </section>

      <ApprovalBar
        approvals={snapshot.pendingApprovals}
        disabled={approvalPending}
        onDecision={async (requestId, decision) => {
          setApprovalPending((current) => ({ ...current, [requestId]: true }))
          let shouldResolveLocally = false
          try {
            await respondToApproval(sessionId, requestId, decision)
            shouldResolveLocally = true
          } catch (error) {
            if (error instanceof Error && error.message.includes('no longer pending')) {
              shouldResolveLocally = true
            } else {
              console.error(error)
            }
          } finally {
            if (shouldResolveLocally) {
              setSnapshot((current) => current ? (() => {
                const pendingApprovals = current.pendingApprovals.filter((item) => item.requestId !== requestId)
                return {
                  ...current,
                  status: pendingApprovals.length > 0 ? 'awaiting_approval' : 'active',
                  pendingApprovals,
                }
              })() : current)
            }
            setApprovalPending((current) => ({ ...current, [requestId]: false }))
          }
        }}
      />

      <section className="panel-card project-card session-picker-card">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Current project sessions</p>
            <h3>Pick another session in {title}</h3>
          </div>
          <button className="ghost session-picker-toggle" onClick={() => setSessionPickerOpen((open) => !open)}>
            {sessionPickerOpen ? 'Hide sessions' : 'Choose session'}
          </button>
        </div>
        {sessionPickerOpen ? (
          <div className="project-list session-dropdown-list">
            {projectSessions.map((projectSession) => (
              <button
                key={projectSession.threadId}
                className={`project-item ${projectSession.threadId === sessionId ? 'is-active' : ''}`}
                onClick={async () => {
                  if (projectSession.threadId === sessionId) {
                    setSessionPickerOpen(false)
                    return
                  }
                  const resumed = await resumeSession(projectSession.threadId, snapshot.projectPath)
                  setSessionPickerOpen(false)
                  await navigate({ to: '/session/$sessionId', params: { sessionId: resumed.sessionId } })
                }}
              >
                <strong>{projectSession.name || projectSession.preview || `Session ${new Date(projectSession.updatedAt * 1000).toLocaleString()}`}</strong>
                <span className="session-picker-date">{new Date(projectSession.updatedAt * 1000).toLocaleString()}</span>
              </button>
            ))}
            {projectSessions.length === 0 ? <p>No saved sessions for this project yet.</p> : null}
          </div>
        ) : null}
      </section>

      <MessageStream messages={snapshot.messages} />

      <PromptComposer busy={snapshot.status === 'active'} onSubmit={async (prompt) => {
        if (prompt.startsWith('/')) {
          const handled = await handleSlashCommand(prompt)
          if (handled) return
        }

        setSnapshot((current) => current ? {
          ...current,
          status: 'active',
          messages: [...current.messages, { id: `local-${Date.now()}`, role: 'user', text: prompt }],
        } : current)
        await sendPrompt(sessionId, prompt)
      }} />

      <DiffReviewSheet diff={snapshot.latestDiff} />
    </main>
  )
}

function reduceSnapshot(snapshot: SessionSnapshot, event: SessionEvent): SessionSnapshot {
  if (event.type !== 'session.snapshot' && event.sequence <= snapshot.lastEventSequence) {
    return snapshot
  }

  switch (event.type) {
    case 'session.snapshot':
      return event.snapshot
    case 'session.status':
      return { ...snapshot, status: event.status, lastEventSequence: event.sequence }
    case 'message.added':
      return { ...snapshot, messages: [...snapshot.messages, event.message], lastEventSequence: event.sequence }
    case 'message.delta': {
      const messages = [...snapshot.messages]
      const index = messages.findIndex((message) => message.id === event.messageId)
      if (index !== -1) {
        messages[index] = { ...messages[index], text: messages[index].text + event.delta }
      } else {
        messages.push({ id: event.messageId, role: 'assistant', text: event.delta })
      }
      return { ...snapshot, messages, lastEventSequence: event.sequence }
    }
    case 'message.completed': {
      const messages = snapshot.messages.some((message) => message.id === event.message.id)
        ? snapshot.messages.map((message) => (message.id === event.message.id ? event.message : message))
        : [...snapshot.messages, event.message]
      return { ...snapshot, messages, lastEventSequence: event.sequence }
    }
    case 'diff.updated':
      return { ...snapshot, latestDiff: event.diff, lastEventSequence: event.sequence }
    case 'approval.pending':
      return { ...snapshot, status: 'awaiting_approval', pendingApprovals: [...snapshot.pendingApprovals.filter((item) => item.requestId !== event.approval.requestId), event.approval], lastEventSequence: event.sequence }
    case 'approval.resolved': {
      const pendingApprovals = snapshot.pendingApprovals.filter((item) => item.requestId !== event.requestId)
      return { ...snapshot, status: pendingApprovals.length > 0 ? 'awaiting_approval' : 'active', pendingApprovals, lastEventSequence: event.sequence }
    }
    case 'terminal.started':
      return { ...snapshot, terminalOpen: true, lastEventSequence: event.sequence }
    case 'terminal.output':
      return { ...snapshot, terminalBuffer: snapshot.terminalBuffer + event.chunk, lastEventSequence: event.sequence }
    case 'terminal.stopped':
      return { ...snapshot, terminalOpen: false, lastEventSequence: event.sequence }
    case 'error':
      return { ...snapshot, status: 'error', lastEventSequence: event.sequence }
    default:
      return snapshot
  }
}
