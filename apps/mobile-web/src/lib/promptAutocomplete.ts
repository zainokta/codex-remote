export function detectAutocomplete(text: string, caret: number) {
  const beforeCaret = text.slice(0, caret)
  const match = beforeCaret.match(/(^|\s)([/$])([^\s/$]*)$/)
  if (!match) return null
  return {
    mode: match[2] === '/' ? 'slash' as const : 'skill' as const,
    query: `${match[2]}${match[3]}`,
    replaceRange: [beforeCaret.length - match[0].trimStart().length, caret] as const,
  }
}
