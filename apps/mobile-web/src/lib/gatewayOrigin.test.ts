import { describe, expect, it } from 'vitest'

describe('gateway origin fallback', () => {
  it('derives the gateway origin from the current host using port 3101 by default', async () => {
    const { readGatewayOrigin } = await import('./api')

    const originalWindow = globalThis.window
    const localStorage = {
      getItem: () => null,
      setItem: () => undefined,
    }

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: {
          protocol: 'http:',
          hostname: '192.168.50.41',
        },
        localStorage,
      },
    })

    expect(readGatewayOrigin()).toBe('http://192.168.50.41:3101')

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
  })
})
