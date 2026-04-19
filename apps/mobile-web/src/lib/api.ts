import type { AuthLoginResponse, ProjectEntry, ProjectSessionSummary, SessionCreatedResponse, SessionEvent, SessionSnapshot, AutocompleteSuggestion, CommandApprovalDecision, FileApprovalDecision } from '@codex-remote/shared-types'

const TOKEN_KEY = 'codex-remote-token'
const GATEWAY_ORIGIN_KEY = 'codex-remote-gateway-origin'
const DEFAULT_GATEWAY_PORT = import.meta.env.VITE_GATEWAY_PORT ?? '3101'

export function readToken() {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(TOKEN_KEY) ?? ''
}

export function writeToken(token: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TOKEN_KEY, token)
}

export function readGatewayOrigin() {
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_GATEWAY_URL ?? `http://127.0.0.1:${DEFAULT_GATEWAY_PORT}`
  }

  return window.localStorage.getItem(GATEWAY_ORIGIN_KEY)
    ?? import.meta.env.VITE_GATEWAY_URL
    ?? `${window.location.protocol}//${window.location.hostname}:${DEFAULT_GATEWAY_PORT}`
}

export function writeGatewayOrigin(origin: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(GATEWAY_ORIGIN_KEY, origin)
}

async function request<T>(path: string, init: RequestInit = {}, token = readToken()): Promise<T> {
  const baseUrl = readGatewayOrigin()
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(new URL(path, `${baseUrl}/`).toString(), { ...init, headers })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText })) as { error?: string }
    throw new Error(payload.error ?? `Request failed with ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function login(password: string) {
  const payload = await request<AuthLoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  }, '')
  writeGatewayOrigin(`${window.location.protocol}//${payload.bindHost}:${payload.gatewayPort}`)
  return payload
}

export function listProjects() {
  return request<{ projects: ProjectEntry[] }>('/api/projects')
}

export function listProjectSessions(projectPath: string) {
  return request<{ sessions: ProjectSessionSummary[] }>(`/api/project-sessions?projectPath=${encodeURIComponent(projectPath)}`)
}

export function resumeSession(threadId: string, projectPath: string) {
  return request<SessionCreatedResponse>('/api/sessions/resume', {
    method: 'POST',
    body: JSON.stringify({ threadId, projectPath }),
  })
}

export function createSession(projectPath: string) {
  return request<SessionCreatedResponse>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ projectPath }),
  })
}

export function fetchSession(sessionId: string) {
  return request<SessionSnapshot>(`/api/sessions/${encodeURIComponent(sessionId)}`)
}

export function sendPrompt(sessionId: string, prompt: string) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/prompts`, {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  })
}

export function respondToApproval(sessionId: string, requestId: string, decision: CommandApprovalDecision | FileApprovalDecision) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/approvals/${encodeURIComponent(requestId)}`, {
    method: 'POST',
    body: JSON.stringify({ decision }),
  })
}

export function openTerminal(sessionId: string) {
  return request<{ processId: string }>(`/api/sessions/${encodeURIComponent(sessionId)}/terminal/open`, { method: 'POST', body: '{}' })
}

export function writeTerminal(sessionId: string, input: string, closeStdin = false) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/terminal/write`, {
    method: 'POST',
    body: JSON.stringify({ input, closeStdin }),
  })
}

export function closeTerminal(sessionId: string) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/terminal/close`, { method: 'POST', body: '{}' })
}

export function fetchAutocomplete(mode: 'slash' | 'skill', query: string) {
  return request<{ suggestions: AutocompleteSuggestion[] }>(`/api/autocomplete?mode=${mode}&query=${encodeURIComponent(query)}`)
}

export function createSessionEventSource(sessionId: string, onEvent: (event: SessionEvent) => void, cursor = 0) {
  const token = encodeURIComponent(readToken())
  const source = new EventSource(new URL(`/api/sessions/${encodeURIComponent(sessionId)}/events?token=${token}&cursor=${cursor}`, `${readGatewayOrigin()}/`).toString())
  source.onmessage = (event) => {
    onEvent(JSON.parse(event.data) as SessionEvent)
  }
  return source
}
