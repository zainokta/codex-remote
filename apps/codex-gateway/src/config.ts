import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'node:fs'

const PRIVATE_RANGES = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
]

export function isPrivateIpv4(value: string) {
  return PRIVATE_RANGES.some((pattern) => pattern.test(value))
}

export function resolveBindHosts() {
  const requested = process.env.CODEX_REMOTE_BIND_HOST
  if (requested) {
    if (!isPrivateIpv4(requested) && requested !== '127.0.0.1') {
      throw new Error(`CODEX_REMOTE_BIND_HOST must be an RFC1918 IPv4 address or 127.0.0.1, received ${requested}`)
    }
    return [requested]
  }

  const interfaces = os.networkInterfaces()
  const hosts = new Set<string>(['127.0.0.1'])
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal && isPrivateIpv4(entry.address)) {
        hosts.add(entry.address)
      }
    }
  }

  if (hosts.size === 0) {
    throw new Error('Could not find an RFC1918 LAN IPv4 address to bind the gateway')
  }

  return [...hosts]
}

export function gatewayPort() {
  return Number(process.env.CODEX_REMOTE_GATEWAY_PORT ?? 3101)
}

export function codexAppServerPort() {
  return Number(process.env.CODEX_REMOTE_APP_SERVER_PORT ?? 3210)
}

export function projectRoot() {
  return process.env.CODEX_REMOTE_PROJECT_ROOT ?? path.join(os.homedir(), 'Project')
}

export function passwordFilePath() {
  return path.resolve('.omx/state/codex-remote-password.txt')
}

export function readOrCreateSharedPassword() {
  const file = passwordFilePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (fs.existsSync(file)) {
    return fs.readFileSync(file, 'utf8').trim()
  }

  const password = crypto.randomBytes(18).toString('base64url')
  fs.writeFileSync(file, `${password}\n`, { mode: 0o600 })
  return password
}
