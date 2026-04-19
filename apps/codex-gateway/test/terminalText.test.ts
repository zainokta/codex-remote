import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanTerminalText } from '../src/services/terminalText.ts'

test('cleanTerminalText strips ANSI and OSC terminal control sequences', () => {
  const input = '\u001b[32mgreen\u001b[39m\u001b]7;file://host/path\u0007\r\n'
  assert.equal(cleanTerminalText(input), 'green\n')
})
