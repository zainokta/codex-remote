import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ProjectDiscoveryService } from '../src/services/projectDiscovery.ts'

test('project discovery only resolves directories under the configured root', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-remote-projects-'))
  await fs.mkdir(path.join(root, 'alpha'))
  await fs.mkdir(path.join(root, 'alpha', 'nested'))
  await fs.mkdir(path.join(root, 'beta'))
  const service = new ProjectDiscoveryService(root)

  const projects = await service.listProjects()
  assert.equal(projects.length, 2)
  assert.deepEqual(projects.map((project) => project.name), ['alpha', 'beta'])
  await assert.rejects(() => service.resolveProject('/tmp'), /must remain under ~\/Project/)
  await assert.doesNotReject(() => service.resolveProject(path.join(root, 'alpha')))
})

test('project discovery rejects symlink escapes outside the allowlist root', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-remote-projects-'))
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-remote-outside-'))
  const escape = path.join(root, 'escape')
  await fs.symlink(outside, escape, 'dir')
  const service = new ProjectDiscoveryService(root)

  await assert.rejects(() => service.resolveProject(escape), /resolving symlinks/)
})
