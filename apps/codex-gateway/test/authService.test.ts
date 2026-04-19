import test from 'node:test'
import assert from 'node:assert/strict'
import { AuthService } from '../src/services/authService.ts'

test('auth service issues and validates tokens', () => {
  const auth = new AuthService('secret')
  const token = auth.login('secret')
  assert.equal(auth.verify(token), true)
  assert.equal(auth.verify('bad-token'), false)
})

test('auth service rejects wrong password', () => {
  const auth = new AuthService('secret')
  assert.throws(() => auth.login('wrong'), /Invalid password/)
})
