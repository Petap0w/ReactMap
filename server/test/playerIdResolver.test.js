const assert = require('node:assert/strict')
const http = require('node:http')
const { mock, test } = require('node:test')

const config = require('@rm/config')

require('./stateMock')

let settings = {
  enabled: true,
  url: '',
  apiKey: 'test-key',
  timeoutMs: 2000,
}

const { getSafe } = config
mock.method(config, 'getSafe', (key) =>
  key === 'api.playerIdResolver' ? settings : getSafe(key),
)

const {
  resolvePlayerId,
  normalizeFriendCode,
} = require('../src/services/PlayerIdResolver')

const FRIEND_CODE = '936690717307'

/**
 * A stand-in for the player-id service. `handler` receives the parsed request
 * body and returns [status, body].
 */
async function serve(handler) {
  const requests = []
  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      const body = JSON.parse(raw || '{}')
      requests.push({ body, headers: req.headers, url: req.url })
      const [status, answer] = handler(body)
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(answer))
    })
  })
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  settings = {
    ...settings,
    url: `http://127.0.0.1:${server.address().port}`,
  }
  return {
    requests,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve)
      }),
  }
}

const ok = (data) => [200, { success: true, data }]

test('a friend code is accepted however the player spaced it', () => {
  assert.equal(normalizeFriendCode(FRIEND_CODE), FRIEND_CODE)
  assert.equal(normalizeFriendCode('9366 9071 7307'), FRIEND_CODE)
  assert.equal(normalizeFriendCode('9366-9071-7307'), FRIEND_CODE)
  assert.equal(normalizeFriendCode(` ${FRIEND_CODE} `), FRIEND_CODE)
})

test('anything that is not twelve digits is not a friend code', () => {
  const inputs = [
    '93669071730',
    '9366907173070',
    'abcdefghijkl',
    '',
    null,
    undefined,
    {},
  ]
  inputs.forEach((input) => {
    assert.equal(normalizeFriendCode(input), '', `${JSON.stringify(input)}`)
  })
})

test('a resolved code yields the profile and the player id', async () => {
  const service = await serve(() =>
    ok({
      status: 'resolved',
      player_id: '8403b61f917ba6a1c26bbc5a',
      codename: 'Petaw67',
      level: 63,
      team: 'Valor',
    }),
  )
  try {
    assert.deepEqual(await resolvePlayerId(42, FRIEND_CODE), {
      status: 'resolved',
      playerId: '8403b61f917ba6a1c26bbc5a',
      codename: 'Petaw67',
      level: 63,
      team: 'Valor',
    })
    assert.deepEqual(service.requests[0].body, {
      subject_id: '42',
      friend_code: FRIEND_CODE,
    })
    assert.equal(service.requests[0].headers['x-api-key'], 'test-key')
    assert.equal(service.requests[0].url, '/api/player-id/resolve')
  } finally {
    await service.close()
  }
})

test('the service statuses a user can act on are passed through', async () => {
  // sequentially, so each case has the stand-in service to itself
  await ['pending', 'invalid_friend_code', 'ineligible'].reduce(
    async (previous, status) => {
      await previous
      const service = await serve(() => ok({ status }))
      try {
        assert.deepEqual(await resolvePlayerId(42, FRIEND_CODE), { status })
      } finally {
        await service.close()
      }
    },
    Promise.resolve(),
  )
})

test('an answer we cannot act on is unavailable, not a resolution', async () => {
  const cases = [
    // mapped subject, but the id was withheld
    ok({ status: 'resolved' }),
    ok({ status: 'need_friend_code' }),
    ok({ status: 'unknown_subject' }),
    [503, { success: false, error: 'External resolver pool is not available' }],
    [401, { success: false, error: 'Invalid API key' }],
  ]
  await cases.reduce(async (previous, answer) => {
    await previous
    const service = await serve(() => answer)
    try {
      assert.deepEqual(await resolvePlayerId(42, FRIEND_CODE), {
        status: 'unavailable',
      })
    } finally {
      await service.close()
    }
  }, Promise.resolve())
})

test('an unconfigured resolver never calls out', async () => {
  const service = await serve(() => ok({ status: 'resolved' }))
  const configured = settings
  try {
    await [{ enabled: false }, { url: '' }, { apiKey: '' }].reduce(
      async (previous, override) => {
        await previous
        settings = { ...configured, ...override }
        assert.deepEqual(await resolvePlayerId(42, FRIEND_CODE), {
          status: 'unavailable',
        })
      },
      Promise.resolve(),
    )
    assert.equal(service.requests.length, 0)
  } finally {
    settings = configured
    await service.close()
  }
})
