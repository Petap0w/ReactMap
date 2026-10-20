// @ts-check
const { expressMiddleware } = require('@as-integrations/express5')
const { ApolloServerErrorCode } = require('@apollo/server/errors')
const { GraphQLError } = require('graphql')
const { parse } = require('graphql')

const { state } = require('../services/state')
const { version } = require('../../../package.json')
const { DataLimitCheck } = require('../services/DataLimitCheck')
const config = require('@rm/config')

/** Queries the login screen makes before a session exists */
const PUBLIC_ENDPOINTS = new Set([
  'Locales',
  'CustomComponent',
  'CheckUsername',
  'MotdCheck',
])

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

      // A session with no perms is expired or revoked, whatever else it still
      // carries: the only queries it may still make are the ones the login
      // screen itself needs before anyone is logged in.
      if (!perms && !PUBLIC_ENDPOINTS.has(endpoint)) {
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

      // Validate geographical area limits on queries with bbox
      if (definition?.operation === 'query') {
        const variables = req.body.variables || {}
        if (
          variables.minLat != null &&
          variables.minLon != null
        ) {
          const minLat = Number(variables.minLat)
          const maxLat = Number(variables.maxLat ?? variables.minLat)
          const minLon = Number(variables.minLon)
          const maxLon = Number(variables.maxLon ?? variables.minLon)

          const validLat = (val) => !Number.isNaN(val) && val >= -90 && val <= 90
          const validLon = (val) => !Number.isNaN(val) && val >= -180 && val <= 180

          if (
            validLat(minLat) &&
            validLat(maxLat) &&
            validLon(minLon) &&
            validLon(maxLon) &&
            minLat <= maxLat &&
            minLon <= maxLon
          ) {
            const R = 6371
            let latDiff = Math.abs(maxLat - minLat)
            let lonDiff = Math.abs(maxLon - minLon)
            if (lonDiff > 180) lonDiff = 360 - lonDiff
            if (latDiff > 180) latDiff = 180

            const latDiffRad = latDiff * (Math.PI / 180)
            const lonDiffRad = lonDiff * (Math.PI / 180)
            const avgLat = ((maxLat + minLat) / 2) * (Math.PI / 180)

            const areaKm2 = R * latDiffRad * R * Math.cos(avgLat) * lonDiffRad

            const geoLimits = config.getSafe('api.geographicalLimits', {})
            const maxArea = perms?.extendedView
              ? (geoLimits.extendedViewMaxAreaKm2 || 30000)
              : (geoLimits.maxAreaKm2 || 15000)

            if (areaKm2 > maxArea) {
              throw new GraphQLError('query_area_too_large', {
                extensions: {
                  ...errorCtx,
                  http: { status: 400 },
                  code: 'AREA_TOO_LARGE',
                },
              })
            }
          }
        }
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
