const ESC = '\\u001B'
const BEL = '\\u0007'
const ANSI_CSI = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, 'g')
const ANSI_OSC = new RegExp(`${ESC}\\][^${BEL}]*(?:${BEL}|${ESC}\\\\)`, 'g')
const ANSI_SINGLE = new RegExp(`${ESC}[@-_]`, 'g')

export function cleanTerminalText(input: string) {
  return input
    .replace(ANSI_OSC, '')
    .replace(ANSI_CSI, '')
    .replace(ANSI_SINGLE, '')
    .replace(/\r/g, '')
}
