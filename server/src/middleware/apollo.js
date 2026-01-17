// @ts-check
const { expressMiddleware } = require('@apollo/server/express4')
const { ApolloServerErrorCode } = require('@apollo/server/errors')
const { GraphQLError } = require('graphql')
const { parse } = require('graphql')

const { state } = require('../services/state')
const { version } = require('../../../package.json')
const { DataLimitCheck } = require('../services/DataLimitCheck')
const { log, TAGS } = require('@rm/logger')

/**
 *
 * @param {Awaited<ReturnType<import('../graphql/server')['startApollo']>>} server
 * @returns
 */
function apolloMiddleware(server) {
  return expressMiddleware(server, {
    context: async ({ req, res }) => {
      const perms = req.user ? req.user.perms : req.session.perms
      const username = req?.user?.username || ''
      const id = req?.user?.id || 0

      const clientVHeader = req.headers['apollographql-client-version']
      const clientV =
        (typeof clientVHeader === 'string' && clientVHeader.trim()) ||
        version ||
        1
      const serverV = version || 1

      const definition =
        /** @type {import('graphql').OperationDefinitionNode} */ (
          parse(req.body.query).definitions.find(
            (d) => d.kind === 'OperationDefinition',
          )
        )
      const endpoint = definition?.name?.value || ''
      const userDataLimit = new DataLimitCheck(req)

      const errorCtx = {
        id,
        user: username,
        clientV,
        serverV,
        endpoint: userDataLimit.category,
      }

      // Allow the hot-reload dev client to bypass strict version matching
      const isDevClient = clientV === 'development'

      if (clientV && serverV && clientV !== serverV && !isDevClient) {
        throw new GraphQLError('old_client', {
          extensions: {
            ...errorCtx,
            http: { status: 464 },
            code: ApolloServerErrorCode.BAD_USER_INPUT,
          },
        })
      }

      if (!perms && endpoint !== 'Locales') {
        throw new GraphQLError('session_expired', {
          extensions: {
            ...errorCtx,
            http: { status: 511 },
            code: 'EXPIRED',
          },
        })
      }

      if (
        definition?.operation === 'mutation' &&
        !id &&
        endpoint !== 'SetTutorial'
      ) {
        throw new GraphQLError('unauthenticated', {
          extensions: {
            ...errorCtx,
            http: { status: 401 },
            code: 'UNAUTHENTICATED',
          },
        })
      }

      if (await userDataLimit.isOverLimit()) {
        throw new GraphQLError('data_limit_reached', {
          extensions: {
            ...errorCtx,
            until: userDataLimit.until,
            http: { status: 429 },
            code: ApolloServerErrorCode.BAD_REQUEST,
          },
        })
      }

      // Track request for monitoring (async, don't await to avoid blocking)
      if (definition?.operation === 'query' && endpoint) {
        const variables = req.body.variables || {}
        
        // Validate bbox coordinates
        let bbox = undefined
        if (
          variables.minLat !== undefined &&
          variables.minLat !== null &&
          variables.minLon !== undefined &&
          variables.minLon !== null
        ) {
          const minLat = Number(variables.minLat)
          const maxLat = Number(variables.maxLat ?? variables.minLat)
          const minLon = Number(variables.minLon)
          const maxLon = Number(variables.maxLon ?? variables.minLon)

          // Validate coordinate ranges
          const validLat = (val) => !Number.isNaN(val) && val >= -90 && val <= 90
          const validLon = (val) => !Number.isNaN(val) && val >= -180 && val <= 180

          // Check if coordinates are valid and not reversed
          if (
            validLat(minLat) &&
            validLat(maxLat) &&
            validLon(minLon) &&
            validLon(maxLon) &&
            minLat <= maxLat &&
            minLon <= maxLon
          ) {
            bbox = { minLat, maxLat, minLon, maxLon }
          }
        }

        const center = variables.lat && variables.lon
          ? { lat: variables.lat, lon: variables.lon }
          : bbox
            ? {
                lat: (bbox.minLat + bbox.maxLat) / 2,
                lon: (bbox.minLon + bbox.maxLon) / 2,
              }
            : undefined

        state.suspiciousMonitor
          .trackRequest(
            {
              timestamp: Date.now(),
              endpoint,
              category: userDataLimit.category,
              userId: id,
              username,
              ip: state.suspiciousMonitor.getIpAddress(req),
              userAgent: req.headers['user-agent'],
              bbox,
              center,
              queryComplexity: variables ? Object.keys(variables).length : 0,
            },
            state.event,
          )
          .catch((err) => {
            // Log but don't fail the request
            log.error(TAGS.api, 'Error in suspicious request monitoring:', err)
          })
      }

      return {
        userId: id,
        username,
        req,
        res,
        Db: state.db,
        Event: state.event,
        perms,
        token: req.headers.token,
        operation: definition?.operation,
      }
    },
  })
}

module.exports = { apolloMiddleware }
