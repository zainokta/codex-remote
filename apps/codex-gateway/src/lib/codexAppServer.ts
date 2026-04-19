import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import http from 'node:http'

export class CodexAppServerProcess {
  private child: ChildProcessWithoutNullStreams | null = null
  private readonly port: number

  constructor(port: number) {
    this.port = port
  }

  async start() {
    if (this.child) return

    this.child = spawn('codex', ['app-server', '--listen', `ws://127.0.0.1:${this.port}`], {
      stdio: 'pipe',
      env: process.env,
    })

    this.child.stdout.on('data', (chunk) => {
      process.stdout.write(`[codex-app-server] ${chunk}`)
    })
    this.child.stderr.on('data', (chunk) => {
      process.stderr.write(`[codex-app-server] ${chunk}`)
    })

    await this.waitUntilHealthy()
  }

  async stop() {
    this.child?.kill('SIGTERM')
    this.child = null
  }

  private async waitUntilHealthy() {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const ready = await new Promise<boolean>((resolve) => {
        const req = http.get(`http://127.0.0.1:${this.port}/readyz`, (res) => {
          resolve(res.statusCode === 200)
          res.resume()
        })
        req.on('error', () => resolve(false))
      })
      if (ready) return
      await new Promise((resolve) => setTimeout(resolve, 250))
    }

    throw new Error('Codex app-server did not become ready in time')
  }
}
