import test from 'node:test'
import assert from 'node:assert/strict'
import { isPrivateIpv4 } from '../src/config.ts'

test('private ipv4 detection only allows RFC1918 addresses', () => {
  assert.equal(isPrivateIpv4('192.168.1.10'), true)
  assert.equal(isPrivateIpv4('172.16.4.3'), true)
  assert.equal(isPrivateIpv4('10.0.0.7'), true)
  assert.equal(isPrivateIpv4('127.0.0.1'), false)
  assert.equal(isPrivateIpv4('8.8.8.8'), false)
})
