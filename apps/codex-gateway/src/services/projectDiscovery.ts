import fs from 'node:fs/promises'
import path from 'node:path'
import type { ProjectEntry } from '@codex-remote/shared-types'

function toId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
}

export class ProjectDiscoveryService {
  private readonly root: string

  constructor(root: string) {
    this.root = root
  }

  async listProjects() {
    const entries = await fs.readdir(this.root, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => {
        const fullPath = path.join(this.root, entry.name)
        return {
          id: toId(entry.name),
          name: entry.name,
          path: fullPath,
          depth: 0,
        } satisfies ProjectEntry
      })
      .sort((a, b) => a.path.localeCompare(b.path))
  }

  async resolveProject(inputPath: string) {
    const lexicalResolved = path.resolve(inputPath)
    const realRoot = await fs.realpath(this.root)
    const realResolved = await fs.realpath(lexicalResolved)
    if (!realResolved.startsWith(realRoot + path.sep) && realResolved != realRoot) {
      throw new Error('Project path must remain under ~/Project after resolving symlinks')
    }
    const stat = await fs.stat(realResolved)
    if (!stat.isDirectory()) {
      throw new Error('Selected project must be a directory')
    }
    return realResolved
  }

}
