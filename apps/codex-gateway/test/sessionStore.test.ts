import test from 'node:test'
import assert from 'node:assert/strict'
import { SessionStore } from '../src/services/sessionStore.ts'

test('session store emits monotonic event sequences and snapshots carry the latest cursor', () => {
  const store = new SessionStore()
  store.create('session-1', 'thread-1', '/tmp/project')
  store.setStatus('session-1', 'active')
  store.setDiff('session-1', 'diff')
  const snapshot = store.snapshot('session-1')
  const events = store.eventsSince('session-1', 0)

  assert.equal(snapshot.lastEventSequence, 2)
  assert.deepEqual(events.map((event) => event.sequence), [1, 2])
})
