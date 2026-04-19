import { describe, expect, it } from 'vitest'
import { cleanTerminalText } from './terminalText'

describe('cleanTerminalText', () => {
  it('removes CSI color/control escape sequences', () => {
    expect(cleanTerminalText('\u001b[32mhello\u001b[39m')).toBe('hello')
  })

  it('removes complex SGR sequences', () => {
    expect(cleanTerminalText('\u001b[38;5;123mcolor\u001b[0m')).toBe('color')
    expect(cleanTerminalText('\u001b[1;31mbold red\u001b[m')).toBe('bold red')
  })

  it('removes character set selections', () => {
    expect(cleanTerminalText('\u001b(Btext')).toBe('text')
  })

  it('removes cursor control and other CSI sequences', () => {
    expect(cleanTerminalText('\u001b[?25hvisible\u001b[K')).toBe('visible')
  })

  it('handles carriage returns by keeping only the last part of a line', () => {
    expect(cleanTerminalText('Loading...\rDone!      \nNext')).toBe('Done!      \nNext')
  })

  it('removes backspaces', () => {
    expect(cleanTerminalText('abc\b\b\b')).toBe('abc') // Simple removal, not full emulation
  })
})
