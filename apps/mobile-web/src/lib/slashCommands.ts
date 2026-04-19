export type SlashAction =
  | { type: 'local'; command: 'help' | 'status' | 'skills' }
  | { type: 'clear' }
  | { type: 'proxy'; prompt: string }
  | { type: 'unsupported'; command: string }

export function parseSlashCommand(prompt: string): SlashAction | null {
  const trimmed = prompt.trim()
  if (!trimmed.startsWith('/')) return null

  const [command, ...rest] = trimmed.split(/\s+/)
  const argument = rest.join(' ').trim()

  switch (command) {
    case '/help':
      return { type: 'local', command: 'help' }
    case '/status':
      return { type: 'local', command: 'status' }
    case '/skills':
      return { type: 'local', command: 'skills' }
    case '/clear':
      return { type: 'clear' }
    case '/plan':
    case '/cancel':
    case '/trace':
      return { type: 'proxy', prompt: `$${command.slice(1)}${argument ? ` ${argument}` : ''}` }
    default:
      return { type: 'unsupported', command }
  }
}
