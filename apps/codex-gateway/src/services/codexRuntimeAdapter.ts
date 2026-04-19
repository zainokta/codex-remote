import type { PendingApproval, SessionMessage } from '@codex-remote/shared-types'
import { JsonRpcClient, type JsonRpcMessage } from '../lib/jsonRpcClient.js'

type SessionCallbacks = {
  onMessageDelta: (sessionId: string, messageId: string, delta: string) => void
  onMessageCompleted: (sessionId: string, messageId: string, text: string, phase?: string | null) => void
  onStatusChange: (sessionId: string, status: 'idle' | 'active' | 'awaiting_approval' | 'error') => void
  onDiffUpdated: (sessionId: string, diff: string) => void
  onApprovalPending: (sessionId: string, approval: PendingApproval) => void
  onApprovalResolved: (sessionId: string, requestId: string) => void
  onTerminalStarted: (sessionId: string, processId: string) => void
  onTerminalOutput: (sessionId: string, processId: string, stream: 'stdout' | 'stderr', chunk: string) => void
  onTerminalStopped: (sessionId: string, processId: string, exitCode: number | null) => void
  onError: (sessionId: string, message: string) => void
}

const TEXT_ENCODER = new TextEncoder()
const TEXT_DECODER = new TextDecoder()

function toBase64(value: string) {
  return Buffer.from(TEXT_ENCODER.encode(value)).toString('base64')
}

function fromBase64(value: string) {
  return TEXT_DECODER.decode(Buffer.from(value, 'base64'))
}

function normalizeAvailableDecisions(decisions: unknown): string[] | undefined {
  if (!Array.isArray(decisions)) return undefined
  const normalized = decisions.flatMap((decision) => {
    if (decision === 'accept') return ['approve_once']
    if (decision === 'acceptForSession') return ['approve_always']
    if (decision === 'decline') return ['reject']
    if (decision === 'cancel') return ['cancel']
    return []
  })
  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined
}

function extractSessionMessages(turns: Array<{ items: Array<Record<string, any>> }>): SessionMessage[] {
  const messages: SessionMessage[] = []
  for (const turn of turns) {
    for (const item of turn.items) {
      if (item.type === 'userMessage') {
        const text = Array.isArray(item.content)
          ? item.content.filter((part) => part.type === 'text').map((part) => part.text).join(' ')
          : ''
        if (text) messages.push({ id: item.id, role: 'user', text })
      }
      if (item.type === 'agentMessage') {
        messages.push({ id: item.id, role: 'assistant', text: item.text ?? '', phase: item.phase ?? null })
      }
    }
  }
  return messages
}

function summarizePermissions(permissions: Record<string, any> | null | undefined): string[] {
  if (!permissions) return []
  const lines: string[] = []
  if (permissions.network) lines.push(`Network: ${JSON.stringify(permissions.network)}`)
  if (permissions.fileSystem) lines.push(`Filesystem: ${JSON.stringify(permissions.fileSystem)}`)
  return lines
}

export class CodexRuntimeAdapter {
  private readonly client: JsonRpcClient
  private initialized = false
  private readonly sessions = new Map<string, { threadId: string; terminalProcessId: string | null }>()
  private readonly threadToSession = new Map<string, string>()
  private readonly terminalToSession = new Map<string, string>()
  private readonly pendingApprovals = new Map<string, { sessionId: string; kind: 'command' | 'file_change' | 'permissions'; params: Record<string, any> }>()

  private readonly callbacks: SessionCallbacks

  constructor(url: string, callbacks: SessionCallbacks) {
    this.callbacks = callbacks
    this.client = new JsonRpcClient(url, (message) => this.onNotification(message), (message) => this.onServerRequest(message))
  }

  async connect() {
    await this.client.connect()
    if (this.initialized) return
    await this.client.request('initialize', {
      clientInfo: { name: 'codex-remote-gateway', title: 'Codex Remote Gateway', version: '0.0.0' },
      capabilities: { experimentalApi: true },
    })
    this.client.sendNotification('initialized')
    this.initialized = true
  }

  async createSession(projectPath: string) {
    const response = await this.client.request<{ thread: { id: string } }>('thread/start', {
      cwd: projectPath,
      approvalPolicy: 'on-request',
      sandbox: 'danger-full-access',
      experimentalRawEvents: false,
      persistExtendedHistory: true,
      sessionStartSource: 'clear',
    })
    const sessionId = response.thread.id
    this.sessions.set(sessionId, { threadId: response.thread.id, terminalProcessId: null })
    this.threadToSession.set(response.thread.id, sessionId)
    return { sessionId, threadId: response.thread.id }
  }

  async listProjectSessions(projectPath: string) {
    const response = await this.client.request<{ data: Array<{ id: string; preview: string; updatedAt: number; status: { type?: string } | string; name?: string | null }> }>('thread/list', {
      cwd: projectPath,
      limit: 25,
      archived: false,
    })

    return response.data.map((thread) => ({
      threadId: thread.id,
      preview: thread.preview,
      updatedAt: thread.updatedAt,
      status: typeof thread.status === 'string' ? thread.status : thread.status?.type ?? 'unknown',
      name: thread.name ?? null,
    }))
  }

  async resumeSession(threadId: string, cwd?: string) {
    const response = await this.client.request<{ thread: { id: string }; cwd?: string }>('thread/resume', {
      threadId,
      cwd,
      persistExtendedHistory: true,
    })
    const detail = await this.client.request<{ thread: { turns: Array<{ items: Array<Record<string, any>> }> } }>('thread/read', {
      threadId: response.thread.id,
      includeTurns: true,
    })
    const sessionId = response.thread.id
    this.sessions.set(sessionId, { threadId: response.thread.id, terminalProcessId: null })
    this.threadToSession.set(response.thread.id, sessionId)
    return { sessionId, threadId: response.thread.id, messages: extractSessionMessages(detail.thread.turns) }
  }

  async sendPrompt(sessionId: string, prompt: string) {
    const session = this.requireSession(sessionId)
    await this.client.request('turn/start', {
      threadId: session.threadId,
      input: [{ type: 'text', text: prompt, text_elements: [] }],
    })
  }

  async respondToApproval(requestId: string, decision: string) {
    const approval = this.pendingApprovals.get(requestId)
    if (!approval) throw new Error(`Unknown approval request ${requestId}`)

    if (approval.kind === 'file_change') {
      const normalized = decision === 'approve_always' ? 'acceptForSession' : decision === 'approve' ? 'accept' : decision === 'cancel' ? 'cancel' : 'decline'
      this.client.respond(requestId, { decision: normalized })
      this.pendingApprovals.delete(requestId)
      return
    }

    if (approval.kind === 'permissions') {
      const permissions = decision === 'approve_once' || decision === 'approve_always' ? approval.params.permissions ?? {} : {}
      const scope = decision === 'approve_always' ? 'session' : 'turn'
      this.client.respond(requestId, { permissions, scope })
      this.pendingApprovals.delete(requestId)
      return
    }

    const normalized = decision === 'approve_always' ? 'acceptForSession' : decision === 'approve_once' ? 'accept' : 'decline'
    this.client.respond(requestId, { decision: normalized })
    this.pendingApprovals.delete(requestId)
  }

  async openTerminal(sessionId: string, cwd: string) {
    const processId = `${sessionId}-terminal`
    this.client.request<{ exitCode: number }>('command/exec', {
      processId,
      command: [process.env.SHELL || '/bin/bash'],
      tty: true,
      streamStdin: true,
      streamStdoutStderr: true,
      cwd,
      sandboxPolicy: { type: 'dangerFullAccess' },
    }).then((result) => {
      this.callbacks.onTerminalStopped(sessionId, processId, result.exitCode ?? null)
      const session = this.sessions.get(sessionId)
      if (session) session.terminalProcessId = null
      this.terminalToSession.delete(processId)
    }).catch((error) => {
      this.callbacks.onError(sessionId, error instanceof Error ? error.message : 'Terminal failed')
      const session = this.sessions.get(sessionId)
      if (session) session.terminalProcessId = null
      this.terminalToSession.delete(processId)
    })
    this.requireSession(sessionId).terminalProcessId = processId
    this.terminalToSession.set(processId, sessionId)
    return processId
  }

  async writeTerminal(sessionId: string, input: string, closeStdin = false) {
    const processId = this.requireSession(sessionId).terminalProcessId
    if (!processId) throw new Error('Terminal is not open')
    await this.client.request('command/exec/write', {
      processId,
      deltaBase64: input ? toBase64(input) : undefined,
      closeStdin,
    })
  }

  async resizeTerminal(sessionId: string, cols: number, rows: number) {
    const processId = this.requireSession(sessionId).terminalProcessId
    if (!processId) throw new Error('Terminal is not open')
    await this.client.request('command/exec/resize', {
      processId,
      size: { cols, rows },
    })
  }

  async closeTerminal(sessionId: string) {
    const processId = this.requireSession(sessionId).terminalProcessId
    if (!processId) return
    await this.client.request('command/exec/terminate', { processId })
  }

  private requireSession(sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Unknown session ${sessionId}`)
    return session
  }

  private onNotification(message: JsonRpcMessage) {
    const method = message.method
    const params = message.params as Record<string, any>
    if (!method) return

    if (method === 'thread/status/changed') {
      const sessionId = this.threadToSession.get(params.threadId)
      if (sessionId) {
        const status = params.status?.type === 'active' ? 'active' : 'idle'
        this.callbacks.onStatusChange(sessionId, status)
      }
      return
    }

    if (method === 'item/agentMessage/delta') {
      const sessionId = this.threadToSession.get(params.threadId)
      if (sessionId) {
        this.callbacks.onMessageDelta(sessionId, params.itemId, params.delta)
      }
      return
    }

    if (method === 'item/completed' && params.item?.type === 'agentMessage') {
      const sessionId = this.threadToSession.get(params.threadId)
      if (sessionId) {
        this.callbacks.onMessageCompleted(sessionId, params.item.id, params.item.text ?? '', params.item.phase)
      }
      return
    }

    if (method === 'serverRequest/resolved') {
      const approval = this.pendingApprovals.get(params.requestId)
      if (approval) {
        this.pendingApprovals.delete(params.requestId)
        this.callbacks.onApprovalResolved(approval.sessionId, params.requestId)
      }
      return
    }

    if (method === 'turn/diff/updated') {
      const sessionId = this.threadToSession.get(params.threadId)
      if (sessionId) {
        this.callbacks.onDiffUpdated(sessionId, params.diff ?? '')
      }
      return
    }

    if (method === 'command/exec/outputDelta') {
      const sessionId = this.terminalToSession.get(params.processId)
      if (sessionId) {
        this.callbacks.onTerminalOutput(sessionId, params.processId, params.stream, fromBase64(params.deltaBase64))
      }
      return
    }

    if (method === 'thread/closed' || method === 'error') {
      const sessionId = this.threadToSession.get(params.threadId)
      if (sessionId) {
        this.callbacks.onError(sessionId, params.error?.message ?? 'Thread closed unexpectedly')
      }
      return
    }
  }

  private onServerRequest(message: JsonRpcMessage) {
    const method = message.method
    const requestId = message.id
    const params = message.params as Record<string, any>
    if (!method || !requestId) return

    if (method === 'item/commandExecution/requestApproval') {
      const sessionId = this.threadToSession.get(params.threadId)
      if (!sessionId) return
      this.pendingApprovals.set(requestId, { sessionId, kind: 'command', params })
      this.callbacks.onStatusChange(sessionId, 'awaiting_approval')
      this.callbacks.onApprovalPending(sessionId, {
        requestId,
        kind: 'command',
        title: 'Command approval requested',
        reason: params.reason,
        command: params.command,
        cwd: params.cwd,
        availableDecisions: normalizeAvailableDecisions(params.availableDecisions) ?? ['approve_once', 'approve_always', 'reject'],
      })
      return
    }

    if (method === 'item/fileChange/requestApproval') {
      const sessionId = this.threadToSession.get(params.threadId)
      if (!sessionId) return
      this.pendingApprovals.set(requestId, { sessionId, kind: 'file_change', params })
      this.callbacks.onStatusChange(sessionId, 'awaiting_approval')
      this.callbacks.onApprovalPending(sessionId, {
        requestId,
        kind: 'file_change',
        title: 'File-change approval requested',
        reason: params.reason,
        availableDecisions: ['approve', 'approve_always', 'reject', 'cancel'],
      })
      return
    }

    if (method === 'item/permissions/requestApproval') {
      const sessionId = this.threadToSession.get(params.threadId)
      if (!sessionId) return
      this.pendingApprovals.set(requestId, { sessionId, kind: 'permissions', params })
      this.callbacks.onStatusChange(sessionId, 'awaiting_approval')
      this.callbacks.onApprovalPending(sessionId, {
        requestId,
        kind: 'permissions',
        title: 'Permission expansion requested',
        reason: params.reason,
        availableDecisions: ['approve_once', 'approve_always', 'reject'],
        permissionsSummary: summarizePermissions(params.permissions),
      })
      return
    }
  }
}
