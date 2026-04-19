const ESC = '\\u001B'
const BEL = '\\u0007'
const ANSI_CSI = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, 'g')
const ANSI_OSC = new RegExp(`${ESC}\\][^${BEL}]*(?:${BEL}|${ESC}\\\\)`, 'g')
const ANSI_SINGLE = new RegExp(`${ESC}[@-_]`, 'g')
const ANSI_CHARSET = new RegExp(`${ESC}[()#][0-9A-Za-z]`, 'g')

export function cleanTerminalText(input: string) {
  const stripped = input
    .replace(ANSI_OSC, '')
    .replace(ANSI_CSI, '')
    .replace(ANSI_CHARSET, '')
    .replace(ANSI_SINGLE, '')
    .split('\b').join('')

  return stripped
    .split('\n')
    .map((line) => line.split('\r').at(-1) ?? '')
    .join('\n')
}
