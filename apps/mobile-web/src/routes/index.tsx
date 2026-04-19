import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { ProjectEntry } from '@codex-remote/shared-types'
import { createSession, listProjects, login, readToken, writeToken } from '../lib/api'

export const Route = createFileRoute('/')({ component: HomePage })

function HomePage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [projects, setProjects] = useState<ProjectEntry[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const hasToken = Boolean(readToken())

  useEffect(() => {
    if (!hasToken) return
    void loadProjects()
  }, [hasToken])

  async function loadProjects() {
    setLoading(true)
    setError('')
    try {
      const payload = await listProjects()
      setProjects(payload.projects)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload = await login(password)
      writeToken(payload.token)
      await loadProjects()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleSelect(projectPath: string) {
    setLoading(true)
    setError('')
    try {
      const session = await createSession(projectPath)
      await navigate({ to: '/session/$sessionId', params: { sessionId: session.sessionId } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to create session')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="page-grid">
      <section className="panel-card hero-card">
        <p className="eyebrow">Mobile-first workflow</p>
        <h2>Start empty, pick a project from ~/Project, and keep Codex usable from your phone.</h2>
        <p>
          This UI keeps the main loop touch-friendly: prompt, stream, approve or reject commands, review diffs, and open a separate terminal fallback only when you need it.
        </p>
      </section>

      {!hasToken ? (
        <section className="panel-card auth-card">
          <p className="eyebrow">Gateway login</p>
          <h3>Enter the shared password from the machine running the gateway.</h3>
          <form className="stack-form" onSubmit={(event) => void handleLogin(event)}>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Shared password" />
            <button type="submit" disabled={loading}>Unlock project list</button>
          </form>
        </section>
      ) : (
        <section className="panel-card project-card">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Project picker</p>
              <h3>Choose a working directory under ~/Project</h3>
            </div>
            <button className="ghost" onClick={() => void loadProjects()} disabled={loading}>Refresh</button>
          </div>
          <div className="project-list">
            {projects.map((project) => (
              <button key={project.id} className="project-item" onClick={() => void handleSelect(project.path)}>
                <strong>{project.name}</strong>
                <span>{project.path}</span>
              </button>
            ))}
            {projects.length === 0 && !loading ? <p>No projects found yet.</p> : null}
          </div>
        </section>
      )}

      {error ? <p className="error-banner">{error}</p> : null}
    </main>
  )
}
