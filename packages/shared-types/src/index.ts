export type SessionStatus = 'idle' | 'active' | 'awaiting_approval' | 'error'

export type ProjectEntry = {
  id: string
  name: string
  path: string
  depth: number
}

export type AutocompleteMode = 'slash' | 'skill'

export type AutocompleteSuggestion = {
  label: string
  insertText: string
  description: string
  category: AutocompleteMode
}

export type CommandApprovalDecision = 'approve_once' | 'approve_always' | 'reject' | 'cancel'
export type FileApprovalDecision = 'approve' | 'approve_always' | 'reject' | 'cancel'

export type PendingApproval = {
  requestId: string
  kind: 'command' | 'file_change' | 'permissions'
  title: string
  reason?: string | null
  command?: string | null
  cwd?: string | null
  availableDecisions?: string[]
  permissionsSummary?: string[]
}

export type SessionMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  phase?: string | null
}

export type SessionSnapshot = {
  sessionId: string
  threadId: string
  projectPath: string
  status: SessionStatus
  messages: SessionMessage[]
  latestDiff: string
  pendingApprovals: PendingApproval[]
  terminalOpen: boolean
  terminalBuffer: string
  lastEventSequence: number
}

export type EventMeta = {
  sequence: number
  timestamp: number
}

export type AuthLoginResponse = {
  token: string
  bindHost: string
  gatewayPort: number
  generatedPasswordHint: string
}

export type SessionCreatedResponse = {
  sessionId: string
  threadId: string
  projectPath: string
}

export type ProjectSessionSummary = {
  threadId: string
  preview: string
  updatedAt: number
  status: string
  name?: string | null
}

export type SessionEvent =
  | ({ type: 'session.snapshot'; sessionId: string; snapshot: SessionSnapshot } & EventMeta)
  | ({ type: 'session.status'; sessionId: string; status: SessionStatus } & EventMeta)
  | ({ type: 'message.added'; sessionId: string; message: SessionMessage } & EventMeta)
  | ({ type: 'message.delta'; sessionId: string; messageId: string; role: 'assistant'; delta: string } & EventMeta)
  | ({ type: 'message.completed'; sessionId: string; message: SessionMessage } & EventMeta)
  | ({ type: 'diff.updated'; sessionId: string; diff: string } & EventMeta)
  | ({ type: 'approval.pending'; sessionId: string; approval: PendingApproval } & EventMeta)
  | ({ type: 'approval.resolved'; sessionId: string; requestId: string } & EventMeta)
  | ({ type: 'terminal.started'; sessionId: string; processId: string } & EventMeta)
  | ({ type: 'terminal.output'; sessionId: string; processId: string; stream: 'stdout' | 'stderr'; chunk: string } & EventMeta)
  | ({ type: 'terminal.stopped'; sessionId: string; processId: string; exitCode: number | null } & EventMeta)
  | ({ type: 'error'; sessionId: string; message: string } & EventMeta)
