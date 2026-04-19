import { describe, expect, it } from 'vitest'
import { detectAutocomplete } from './promptAutocomplete'

describe('detectAutocomplete', () => {
  it('detects slash commands', () => {
    expect(detectAutocomplete('/pla', 4)).toEqual({ mode: 'slash', query: '/pla', replaceRange: [0, 4] })
  })

  it('detects skill commands after whitespace', () => {
    expect(detectAutocomplete('run $ral', 8)).toEqual({ mode: 'skill', query: '$ral', replaceRange: [4, 8] })
  })

  it('returns null when there is no active trigger', () => {
    expect(detectAutocomplete('hello world', 11)).toBeNull()
  })
})
