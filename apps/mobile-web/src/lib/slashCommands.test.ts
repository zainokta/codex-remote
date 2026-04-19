import { describe, expect, it } from 'vitest'
import { parseSlashCommand } from './slashCommands'

describe('parseSlashCommand', () => {
  it('returns null for plain prompts', () => {
    expect(parseSlashCommand('hello')).toBeNull()
  })

  it('maps local slash commands', () => {
    expect(parseSlashCommand('/help')).toEqual({ type: 'local', command: 'help' })
    expect(parseSlashCommand('/status')).toEqual({ type: 'local', command: 'status' })
    expect(parseSlashCommand('/skills')).toEqual({ type: 'local', command: 'skills' })
  })

  it('maps clear to a dedicated action', () => {
    expect(parseSlashCommand('/clear')).toEqual({ type: 'clear' })
  })

  it('maps proxy commands to dollar prompts', () => {
    expect(parseSlashCommand('/plan')).toEqual({ type: 'proxy', prompt: '$plan' })
    expect(parseSlashCommand('/trace recent')).toEqual({ type: 'proxy', prompt: '$trace recent' })
  })

  it('flags unsupported commands', () => {
    expect(parseSlashCommand('/unknown')).toEqual({ type: 'unsupported', command: '/unknown' })
  })
})
