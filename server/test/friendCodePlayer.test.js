const assert = require('node:assert/strict')
const { mock, test } = require('node:test')

require('./stateMock')

// the resolvers capture resolvePlayerId at load, so stub the module first
let answer
const calls = []
mock.module(require.resolve('../src/services/PlayerIdResolver'), {
  cache: true,
  namedExports: {
    normalizeFriendCode: require('../src/services/PlayerIdResolver')
      .normalizeFriendCode,
    resolvePlayerId: async (userId, friendCode) => {
      calls.push({ userId, friendCode })
      return answer
    },
  },
})

const { resolvers } = require('../src/graphql/resolvers')

const FRIEND_CODE = '936690717307'
const PLAYER_ID = '8403b61f917ba6a1c26bbc5a'
const PROFILE = {
  status: 'resolved',
  playerId: PLAYER_ID,
  codename: 'Petaw67',
  level: 63,
  team: 'Valor',
}

/**
 * A context whose player rows and resolver answers are scripted, recording
 * every write so a test can assert nothing was saved.
 * @param {{ existing?: object[], answer?: object }} options
 */
const setup = ({ existing = [], reply = PROFILE } = {}) => {
  const writes = []
  calls.length = 0
  answer = reply
  const ctx = {
    req: { user: { id: 7 } },
    perms: { personalShiny: true },
    Db: {
      models: {
        PlayerAccount: {
          getAll: async () => existing,
          replace: async (userId, accounts) => {
            writes.push({ userId, accounts })
            return accounts
          },
        },
      },
    },
  }
  return { writes, calls, ctx }
}

test('a lookup returns the trainer to confirm and saves nothing', async () => {
  const { writes, ctx } = setup()
  assert.deepEqual(
    await resolvers.Mutation.resolvePlayerId(
      null,
      { friendCode: '9366 9071 7307' },
      ctx,
    ),
    { status: 'resolved', codename: 'Petaw67', level: 63, team: 'Valor' },
  )
  // the code reaches the service normalized, and nothing is written yet
  assert.deepEqual(calls, [{ userId: 7, friendCode: FRIEND_CODE }])
  assert.deepEqual(writes, [])
})

test('a lookup never answers with the player id', async () => {
  const { ctx } = setup()
  const result = await resolvers.Mutation.resolvePlayerId(
    null,
    { friendCode: FRIEND_CODE },
    ctx,
  )
  assert.equal('playerId' in result, false)
  assert.equal(JSON.stringify(result).includes(PLAYER_ID), false)
})

test('confirming saves the player under the trainer name', async () => {
  const { writes, ctx } = setup()
  const result = await resolvers.Mutation.confirmPlayerId(
    null,
    { friendCode: FRIEND_CODE },
    ctx,
  )
  assert.equal(result.status, 'saved')
  assert.equal('playerId' in result, false)
  assert.deepEqual(writes, [
    {
      userId: 7,
      accounts: [{ playerId: PLAYER_ID, label: 'Petaw67', active: true }],
    },
  ])
})

test('a player that is already set cannot be looked up or replaced', async () => {
  const existing = [{ label: 'Petaw67', active: true }]
  const lookup = setup({ existing })
  assert.deepEqual(
    await resolvers.Mutation.resolvePlayerId(
      null,
      { friendCode: FRIEND_CODE },
      lookup.ctx,
    ),
    { status: 'already_set' },
  )
  assert.deepEqual(lookup.writes, [])
  const confirm = setup({ existing })
  assert.deepEqual(
    await resolvers.Mutation.confirmPlayerId(
      null,
      { friendCode: FRIEND_CODE },
      confirm.ctx,
    ),
    { status: 'already_set' },
  )
  assert.deepEqual(confirm.writes, [])
  // the service is never even asked, so a swap cannot consume a resolve
  assert.deepEqual(calls, [])
})

test('a malformed friend code is refused before the service is called', async () => {
  const { writes, ctx } = setup()
  assert.deepEqual(
    await resolvers.Mutation.confirmPlayerId(
      null,
      { friendCode: '93669071' },
      ctx,
    ),
    { status: 'invalid_input' },
  )
  assert.deepEqual(calls, [])
  assert.deepEqual(writes, [])
})

test('a status short of resolved saves nothing', async () => {
  const { writes, ctx } = setup({ reply: { status: 'pending' } })
  assert.deepEqual(
    await resolvers.Mutation.confirmPlayerId(
      null,
      { friendCode: FRIEND_CODE },
      ctx,
    ),
    { status: 'pending' },
  )
  assert.deepEqual(writes, [])
})

test('without the perm or a session nothing is resolved', async () => {
  const { ctx } = setup()
  assert.deepEqual(
    await resolvers.Mutation.resolvePlayerId(
      null,
      { friendCode: FRIEND_CODE },
      { ...ctx, perms: { personalShiny: false } },
    ),
    { status: 'no_access' },
  )
  assert.deepEqual(
    await resolvers.Mutation.resolvePlayerId(
      null,
      { friendCode: FRIEND_CODE },
      { ...ctx, req: {} },
    ),
    { status: 'no_access' },
  )
  assert.deepEqual(calls, [])
})

test('the saved players a client can read carry no player id', async () => {
  const ctx = {
    req: { user: { id: 7 } },
    perms: { personalShiny: true },
    Db: {
      models: {
        PlayerAccount: {
          getAll: async () => [
            { playerId: PLAYER_ID, label: 'Petaw67', active: true },
          ],
        },
      },
    },
  }
  const accounts = await resolvers.Query.playerAccounts(null, {}, ctx)
  assert.deepEqual(accounts, [{ label: 'Petaw67', active: true }])
})
