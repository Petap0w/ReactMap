// @ts-check
const { default: fetch } = require('node-fetch')

const config = require('@rm/config')
const { log, TAGS } = require('@rm/logger')

/**
 * The statuses the resolver answers with. `resolved` carries a profile for the
 * user to confirm; everything else is terminal for this attempt, except
 * `pending`, which means the upstream pool is busy and the same friend code
 * can be sent again.
 * @typedef {'resolved' | 'pending' | 'invalid_friend_code' | 'ineligible' | 'unavailable'} ResolverStatus
 * @typedef {{ status: ResolverStatus, codename?: string, level?: number, team?: string, playerId?: string }} ResolverResult
 */

const FRIEND_CODE = /^\d{12}$/

/**
 * A friend code as the resolver takes it, or '' when it is not one. Players
 * read their code off a screen that groups it in fours, so spaces and dashes
 * are expected rather than a mistake.
 * @param {unknown} input
 * @returns {string}
 */
function normalizeFriendCode(input) {
  const digits = `${input ?? ''}`.replace(/[\s-]/g, '')
  return FRIEND_CODE.test(digits) ? digits : ''
}

/**
 * Asks the player-id service which trainer a friend code belongs to.
 *
 * The player id it returns is the trainer's raw account id, which is what
 * makes a shiny roll personal — so it stays on the server. Only the profile
 * (codename, level, team) is for the caller to show, and neither the code nor
 * the id is ever logged.
 *
 * @param {number} userId the subject this mapping belongs to
 * @param {string} friendCode normalized, 12 digits
 * @returns {Promise<ResolverResult>}
 */
async function resolvePlayerId(userId, friendCode) {
  const settings = config.getSafe('api.playerIdResolver')
  if (!settings.enabled || !settings.url || !settings.apiKey) {
    log.debug(TAGS.fetch, 'player id resolver is not configured')
    return { status: 'unavailable' }
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), settings.timeoutMs)
  try {
    const response = await fetch(
      `${settings.url.replace(/\/+$/, '')}/api/player-id/resolve`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': settings.apiKey,
        },
        body: JSON.stringify({
          subject_id: `${userId}`,
          friend_code: friendCode,
        }),
        signal: controller.signal,
      },
    )
    if (!response.ok) {
      log.warn(
        TAGS.fetch,
        'player id resolver answered',
        response.status,
        response.statusText,
      )
      return { status: 'unavailable' }
    }
    // the service wraps every answer in { success, data }
    const body = await response.json()
    const data = body?.data || {}
    switch (data.status) {
      case 'resolved':
        return data.player_id
          ? {
              status: 'resolved',
              playerId: `${data.player_id}`,
              codename: data.codename ? `${data.codename}` : undefined,
              level: Number.isFinite(data.level) ? data.level : undefined,
              team: data.team ? `${data.team}` : undefined,
            }
          : // resolved without an id means the subject is mapped but the id was
            // withheld, which we cannot act on
            { status: 'unavailable' }
      case 'invalid_friend_code':
      case 'ineligible':
      case 'pending':
        return { status: data.status }
      default:
        log.warn(TAGS.fetch, 'unexpected player id resolver status')
        return { status: 'unavailable' }
    }
  } catch (e) {
    log.warn(
      TAGS.fetch,
      'player id resolver request failed',
      e instanceof Error ? e.message : e,
    )
    return { status: 'unavailable' }
  } finally {
    clearTimeout(timeout)
  }
}

module.exports = { resolvePlayerId, normalizeFriendCode }
