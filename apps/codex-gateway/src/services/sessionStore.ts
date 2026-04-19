import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { PendingApproval, SessionEvent, SessionMessage, SessionSnapshot, SessionStatus } from '@codex-remote/shared-types'

export type SessionRecord = {
  sessionId: string
  threadId: string
  projectPath: string
  status: SessionStatus
  messages: SessionMessage[]
  latestDiff: string
  pendingApprovals: PendingApproval[]
  terminalOpen: boolean
  terminalBuffer: string
  eventSequence: number
  eventLog: SessionEvent[]
}

type SessionEventInput =
  | { type: 'session.status'; sessionId: string; status: SessionStatus }
  | { type: 'message.delta'; sessionId: string; messageId: string; role: 'assistant'; delta: string }
  | { type: 'message.completed'; sessionId: string; message: SessionMessage }
  | { type: 'diff.updated'; sessionId: string; diff: string }
  | { type: 'approval.pending'; sessionId: string; approval: PendingApproval }
  | { type: 'approval.resolved'; sessionId: string; requestId: string }
  | { type: 'terminal.started'; sessionId: string; processId: string }
  | { type: 'terminal.output'; sessionId: string; processId: string; stream: 'stdout' | 'stderr'; chunk: string }
  | { type: 'terminal.stopped'; sessionId: string; processId: string; exitCode: number | null }
  | { type: 'error'; sessionId: string; message: string }

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly emitter = new EventEmitter()

  create(sessionId: string, threadId: string, projectPath: string, messages: SessionMessage[] = []) {
    const record: SessionRecord = {
      sessionId,
      threadId,
      projectPath,
      status: 'idle',
      messages,
      latestDiff: '',
      pendingApprovals: [],
      terminalOpen: false,
      terminalBuffer: '',
      eventSequence: 0,
      eventLog: [],
    }
    this.sessions.set(sessionId, record)
    return record
  }

  snapshot(sessionId: string): SessionSnapshot {
    const record = this.require(sessionId)
    return {
      sessionId: record.sessionId,
      threadId: record.threadId,
      projectPath: record.projectPath,
      status: record.status,
      messages: record.messages,
      latestDiff: record.latestDiff,
      pendingApprovals: record.pendingApprovals,
      terminalOpen: record.terminalOpen,
      terminalBuffer: record.terminalBuffer,
      lastEventSequence: record.eventSequence,
    }
  }

  snapshotEvent(sessionId: string): SessionEvent {
    const record = this.require(sessionId)
    return {
      type: 'session.snapshot',
      sessionId,
      snapshot: this.snapshot(sessionId),
      sequence: record.eventSequence,
      timestamp: Date.now(),
    }
  }

  eventsSince(sessionId: string, sequence: number) {
    return this.require(sessionId).eventLog.filter((event) => event.sequence > sequence)
  }

  hasPendingApproval(sessionId: string, requestId: string) {
    return this.require(sessionId).pendingApprovals.some((item) => item.requestId === requestId)
  }

  getPendingApproval(sessionId: string, requestId: string) {
    return this.require(sessionId).pendingApprovals.find((item) => item.requestId === requestId)
  }

  pendingApprovalCount(sessionId: string) {
    return this.require(sessionId).pendingApprovals.length
  }

  subscribe(sessionId: string, listener: (event: SessionEvent) => void) {
    const eventName = `session:${sessionId}`
    this.emitter.on(eventName, listener)
    return () => this.emitter.off(eventName, listener)
  }

  setStatus(sessionId: string, status: SessionStatus) {
    const record = this.require(sessionId)
    record.status = status
    this.publish(sessionId, { type: 'session.status', sessionId, status })
  }

  addUserPrompt(sessionId: string, prompt: string) {
    const record = this.require(sessionId)
    record.messages.push({ id: crypto.randomUUID(), role: 'user', text: prompt })
  }

  appendAssistantDelta(sessionId: string, messageId: string, delta: string) {
    const record = this.require(sessionId)
    const existing = record.messages.find((message) => message.id === messageId)
    if (existing) {
      existing.text += delta
    } else {
      record.messages.push({ id: messageId, role: 'assistant', text: delta })
    }
    this.publish(sessionId, { type: 'message.delta', sessionId, messageId, role: 'assistant', delta })
  }

  completeAssistantMessage(sessionId: string, messageId: string, text: string, phase?: string | null) {
    const record = this.require(sessionId)
    const existing = record.messages.find((message) => message.id === messageId)
    if (existing) {
      existing.text = text
      existing.phase = phase
      this.publish(sessionId, { type: 'message.completed', sessionId, message: existing })
      return
    }
    const message = { id: messageId, role: 'assistant' as const, text, phase }
    record.messages.push(message)
    this.publish(sessionId, { type: 'message.completed', sessionId, message })
  }

  setDiff(sessionId: string, diff: string) {
    const record = this.require(sessionId)
    record.latestDiff = diff
    this.publish(sessionId, { type: 'diff.updated', sessionId, diff })
  }

  addApproval(sessionId: string, approval: PendingApproval) {
    const record = this.require(sessionId)
    record.pendingApprovals = [...record.pendingApprovals.filter((item) => item.requestId !== approval.requestId), approval]
    this.publish(sessionId, { type: 'approval.pending', sessionId, approval })
  }

  resolveApproval(sessionId: string, requestId: string) {
    const record = this.require(sessionId)
    const hadApproval = record.pendingApprovals.some((item) => item.requestId === requestId)
    record.pendingApprovals = record.pendingApprovals.filter((item) => item.requestId !== requestId)
    if (hadApproval) {
      this.publish(sessionId, { type: 'approval.resolved', sessionId, requestId })
    }
    return hadApproval
  }

  startTerminal(sessionId: string, processId: string) {
    const record = this.require(sessionId)
    record.terminalOpen = true
    this.publish(sessionId, { type: 'terminal.started', sessionId, processId })
  }

  appendTerminalOutput(sessionId: string, processId: string, stream: 'stdout' | 'stderr', chunk: string) {
    const record = this.require(sessionId)
    record.terminalBuffer += chunk
    this.publish(sessionId, { type: 'terminal.output', sessionId, processId, stream, chunk })
  }

  stopTerminal(sessionId: string, processId: string, exitCode: number | null) {
    const record = this.require(sessionId)
    record.terminalOpen = false
    this.publish(sessionId, { type: 'terminal.stopped', sessionId, processId, exitCode })
  }

  emitError(sessionId: string, message: string) {
    const record = this.require(sessionId)
    record.status = 'error'
    this.publish(sessionId, { type: 'error', sessionId, message })
  }

  private publish(sessionId: string, event: SessionEventInput) {
    const record = this.require(sessionId)
    const fullEvent = {
      ...event,
      sequence: ++record.eventSequence,
      timestamp: Date.now(),
    } as SessionEvent
    record.eventLog.push(fullEvent)
    if (record.eventLog.length > 500) {
      record.eventLog.shift()
    }
    this.emitter.emit(`session:${sessionId}`, fullEvent)
  }

  private require(sessionId: string) {
    const record = this.sessions.get(sessionId)
    if (!record) throw new Error(`Unknown session ${sessionId}`)
    return record
  }
}
