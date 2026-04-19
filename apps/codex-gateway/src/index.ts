import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { URL } from 'node:url'
import type { AuthLoginResponse, SessionCreatedResponse } from '@codex-remote/shared-types'
import { gatewayPort, resolveBindHosts, projectRoot, readOrCreateSharedPassword, codexAppServerPort } from './config.js'
import { AuthService } from './services/authService.js'
import { ProjectDiscoveryService } from './services/projectDiscovery.js'
import { AutocompleteService } from './services/autocompleteService.js'
import { SessionStore } from './services/sessionStore.js'
import { CodexRuntimeAdapter } from './services/codexRuntimeAdapter.js'
import { CodexAppServerProcess } from './lib/codexAppServer.js'
import { cleanTerminalText } from './services/terminalText.js'

const bindHosts = resolveBindHosts()
const port = gatewayPort()
const projectService = new ProjectDiscoveryService(projectRoot())
const auth = new AuthService(readOrCreateSharedPassword())
const sessions = new SessionStore()
const autocomplete = new AutocompleteService()
const appServer = new CodexAppServerProcess(codexAppServerPort())
const runtime = new CodexRuntimeAdapter(`ws://127.0.0.1:${codexAppServerPort()}`, {
  onMessageDelta: (sessionId, messageId, delta) => sessions.appendAssistantDelta(sessionId, messageId, delta),
  onMessageCompleted: (sessionId, messageId, text, phase) => sessions.completeAssistantMessage(sessionId, messageId, text, phase),
  onStatusChange: (sessionId, status) => sessions.setStatus(sessionId, status),
  onDiffUpdated: (sessionId, diff) => sessions.setDiff(sessionId, diff),
  onApprovalPending: (sessionId, approval) => sessions.addApproval(sessionId, approval),
  onApprovalResolved: (sessionId, requestId) => {
    sessions.resolveApproval(sessionId, requestId)
    sessions.setStatus(sessionId, sessions.pendingApprovalCount(sessionId) > 0 ? 'awaiting_approval' : 'active')
  },
  onTerminalStarted: (sessionId, processId) => sessions.startTerminal(sessionId, processId),
  onTerminalOutput: (sessionId, processId, stream, chunk) => sessions.appendTerminalOutput(sessionId, processId, stream, cleanTerminalText(chunk)),
  onTerminalStopped: (sessionId, processId, exitCode) => sessions.stopTerminal(sessionId, processId, exitCode),
  onError: (sessionId, message) => sessions.emitError(sessionId, message),
})

await appServer.start()
await runtime.connect()

const requestHandler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    if (req.method === 'OPTIONS') {
      setCors(res)
      res.writeHead(204)
      res.end()
      return
    }

    if (url.pathname === '/healthz') {
      json(res, 200, { ok: true, bindHosts, port, projectRoot: projectRoot() })
      return
    }

    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await readJson(req)
      const token = auth.login(String(body.password ?? ''))
      const requestHost = (req.headers.host ?? '').split(':')[0] || bindHosts[0]
      const payload: AuthLoginResponse = { token, bindHost: requestHost, gatewayPort: port, generatedPasswordHint: auth.hint() }
      json(res, 200, payload)
      return
    }

    const token = readBearerToken(req, url)
    if (!auth.verify(token)) {
      json(res, 401, { error: 'Unauthorized' })
      return
    }

    if (url.pathname === '/api/projects' && req.method === 'GET') {
      json(res, 200, { projects: await projectService.listProjects() })
      return
    }

    if (url.pathname === '/api/project-sessions' && req.method === 'GET') {
      const projectPath = await projectService.resolveProject(String(url.searchParams.get('projectPath') ?? ''))
      json(res, 200, { sessions: await runtime.listProjectSessions(projectPath) })
      return
    }

    if (url.pathname === '/api/autocomplete' && req.method === 'GET') {
      const mode = (url.searchParams.get('mode') ?? 'slash') as 'slash' | 'skill'
      const query = url.searchParams.get('query') ?? ''
      json(res, 200, { suggestions: await autocomplete.suggest(mode, query) })
      return
    }

    if (url.pathname === '/api/sessions/resume' && req.method === 'POST') {
      const body = await readJson(req)
      const projectPath = await projectService.resolveProject(String(body.projectPath ?? ''))
      const { sessionId, threadId, messages } = await runtime.resumeSession(String(body.threadId ?? ''), projectPath)
      sessions.create(sessionId, threadId, projectPath, messages)
      const payload: SessionCreatedResponse = { sessionId, threadId, projectPath }
      json(res, 201, payload)
      return
    }

    if (url.pathname === '/api/sessions' && req.method === 'POST') {
      const body = await readJson(req)
      const projectPath = await projectService.resolveProject(String(body.projectPath ?? ''))
      const { sessionId, threadId } = await runtime.createSession(projectPath)
      sessions.create(sessionId, threadId, projectPath)
      const payload: SessionCreatedResponse = { sessionId, threadId, projectPath }
      json(res, 201, payload)
      return
    }

    const match = url.pathname.match(/^\/api\/sessions\/([^/]+)(?:\/(.*))?$/)
    if (!match) {
      json(res, 404, { error: 'Not found' })
      return
    }

    const sessionId = decodeURIComponent(match[1])
    const suffix = match[2] ?? ''

    if (suffix === '' && req.method === 'GET') {
      json(res, 200, sessions.snapshot(sessionId))
      return
    }

    if (suffix === 'events' && req.method === 'GET') {
      setCors(res)
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      })
      const cursor = Number(req.headers['last-event-id'] ?? url.searchParams.get('cursor') ?? 0)
      let streamingReady = false
      let snapshotSequence = 0
      const backlog: Array<{ sequence: number }> = []
      const unsubscribe = sessions.subscribe(sessionId, (event) => {
        if (!streamingReady) {
          backlog.push(event)
          return
        }
        if (event.sequence > snapshotSequence) {
          writeEvent(res, event)
        }
      })
      const snapshotEvent = sessions.snapshotEvent(sessionId)
      snapshotSequence = snapshotEvent.sequence
      writeEvent(res, snapshotEvent)
      void cursor
      for (const event of backlog) {
        if (event.sequence > snapshotSequence) {
          writeEvent(res, event as Parameters<typeof writeEvent>[1])
        }
      }
      streamingReady = true
      req.on('close', unsubscribe)
      return
    }

    if (suffix === 'prompts' && req.method === 'POST') {
      const body = await readJson(req)
      const prompt = String(body.prompt ?? '').trim()
      sessions.addUserPrompt(sessionId, prompt)
      await runtime.sendPrompt(sessionId, prompt)
      json(res, 202, { ok: true })
      return
    }

    if (suffix.startsWith('approvals/') && req.method === 'POST') {
      const requestId = suffix.split('/')[1]
      const body = await readJson(req)
      const approval = sessions.getPendingApproval(sessionId, requestId)
      if (!approval) {
        json(res, 409, { error: 'Approval is no longer pending' })
        return
      }
      const decision = String(body.decision ?? 'reject')
      if (!isAllowedApprovalDecision(approval.kind, decision)) {
        json(res, 400, { error: 'Decision is not valid for this approval type' })
        return
      }
      await runtime.respondToApproval(requestId, decision)
      sessions.resolveApproval(sessionId, requestId)
      sessions.setStatus(sessionId, sessions.pendingApprovalCount(sessionId) > 0 ? 'awaiting_approval' : 'active')
      json(res, 200, { ok: true })
      return
    }

    if (suffix === 'terminal/open' && req.method === 'POST') {
      const snapshot = sessions.snapshot(sessionId)
      const processId = await runtime.openTerminal(sessionId, snapshot.projectPath)
      sessions.startTerminal(sessionId, processId)
      json(res, 200, { processId })
      return
    }

    if (suffix === 'terminal/write' && req.method === 'POST') {
      const body = await readJson(req)
      await runtime.writeTerminal(sessionId, String(body.input ?? ''), Boolean(body.closeStdin))
      json(res, 200, { ok: true })
      return
    }

    if (suffix === 'terminal/resize' && req.method === 'POST') {
      const body = await readJson(req)
      await runtime.resizeTerminal(sessionId, Number(body.cols ?? 80), Number(body.rows ?? 24))
      json(res, 200, { ok: true })
      return
    }

    if (suffix === 'terminal/close' && req.method === 'POST') {
      await runtime.closeTerminal(sessionId)
      json(res, 200, { ok: true })
      return
    }

    json(res, 404, { error: 'Not found' })
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' })
  }
}

const servers = bindHosts.map((host) => ({ host, server: http.createServer(requestHandler) }))
await Promise.all(servers.map(({ host, server }) => new Promise<void>((resolve) => {
  server.listen(port, host, () => {
    console.log(`codex-remote gateway listening on http://${host}:${port}`)
    resolve()
  })
})))
console.log(`Use shared password hint: ${auth.hint()}`)
console.log(`Project root allowlist: ${projectRoot()}`)

process.on('SIGTERM', async () => {
  for (const { server } of servers) {
    server.close()
  }
  await appServer.stop()
  process.exit(0)
})

function setCors(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

async function readJson(req: http.IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}

function readBearerToken(req: http.IncomingMessage, url: URL) {
  const authorization = req.headers.authorization
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length)
  }
  return url.searchParams.get('token')
}



function isAllowedApprovalDecision(kind: 'command' | 'file_change' | 'permissions', decision: string) {
  if (kind === 'command') return ['approve_once', 'approve_always', 'reject', 'cancel'].includes(decision)
  if (kind === 'file_change') return ['approve', 'approve_always', 'reject', 'cancel'].includes(decision)
  return ['approve_once', 'approve_always', 'reject', 'cancel'].includes(decision)
}

function writeEvent(res: http.ServerResponse, event: { sequence: number }) {
  res.write(`id: ${event.sequence}\n`)
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

function json(res: http.ServerResponse, status: number, payload: unknown) {
  setCors(res)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}
