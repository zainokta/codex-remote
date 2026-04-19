import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { AutocompleteMode, AutocompleteSuggestion } from '@codex-remote/shared-types'

const SLASH_COMMANDS = [
  ['/help', 'Open help and quick shortcuts'],
  ['/status', 'Show session status'],
  ['/clear', 'Start a fresh thread'],
  ['/plan', 'Kick off planning mode'],
  ['/cancel', 'Cancel the active OMX mode'],
  ['/trace', 'Show OMX trace timeline'],
  ['/skills', 'Browse installed skills'],
]

export class AutocompleteService {
  async suggest(mode: AutocompleteMode, query: string) {
    const normalized = query.toLowerCase()
    if (mode === 'slash') {
      return SLASH_COMMANDS
        .map(([label, description]) => ({
          label,
          insertText: label,
          description,
          category: 'slash' as const,
        }))
        .filter((item) => item.label.toLowerCase().includes(normalized))
    }

    const skills = await this.readSkillNames()
    return skills
      .map((name) => ({
        label: `$${name}`,
        insertText: `$${name} `,
        description: 'Installed OMX skill',
        category: 'skill' as const,
      }))
      .filter((item) => item.label.toLowerCase().includes(normalized))
  }

  private async readSkillNames() {
    const roots = [path.join(os.homedir(), '.codex', 'skills'), path.join(os.homedir(), '.agents', 'skills')]
    const names = new Set<string>()
    for (const root of roots) {
      try {
        const entries = await fs.readdir(root, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            names.add(entry.name)
          }
        }
      } catch {
        // ignore missing roots
      }
    }
    return [...names].sort()
  }
}
