// @ts-check
const { expressMiddleware } = require('@apollo/server/express4')
const { ApolloServerErrorCode } = require('@apollo/server/errors')
const { GraphQLError } = require('graphql')
const { parse } = require('graphql')

const { state } = require('../services/state')
const { version } = require('../../../package.json')
const { DataLimitCheck } = require('../services/DataLimitCheck')
const { log, TAGS } = require('@rm/logger')
const config = require('@rm/config')

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

      // Check if auth is enabled with no always-enabled perms and no user
      const authentication = config.getSafe('authentication')
      const hasAuthEnabled =
        authentication?.methods?.length > 0 &&
        !authentication?.alwaysEnabledPerms?.length
      const hasNoUser = !id
      const hasNoPerms =
        !perms ||
        (typeof perms === 'object' &&
          Object.keys(perms).filter(
            (k) =>
              k !== 'areaRestrictions' &&
              k !== 'webhooks' &&
              k !== 'scanner' &&
              perms[k] === true,
          ).length === 0)

      if (hasAuthEnabled && hasNoUser && hasNoPerms) {
        // Allow endpoints needed for login/registration flow
        const publicEndpoints = ['Locales', 'CustomComponent', 'CheckUsername', 'MotdCheck']
        if (!publicEndpoints.includes(endpoint)) {
          throw new GraphQLError('session_expired', {
            extensions: {
              ...errorCtx,
              http: { status: 511 },
              code: 'EXPIRED',
            },
          })
        }
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
            
            // Validate geographical area limits
            const R = 6371 // Earth radius in km
            let latDiff = Math.abs(bbox.maxLat - bbox.minLat)
            let lonDiff = Math.abs(bbox.maxLon - bbox.minLon)
            
            // Handle longitude wrapping
            if (lonDiff > 180) {
              lonDiff = 360 - lonDiff
            }
            if (latDiff > 180) {
              latDiff = 180
            }
            
            const latDiffRad = latDiff * (Math.PI / 180)
            const lonDiffRad = lonDiff * (Math.PI / 180)
            const avgLat = ((bbox.maxLat + bbox.minLat) / 2) * (Math.PI / 180)
            
            const latDistance = R * latDiffRad
            const lonDistance = R * Math.cos(avgLat) * lonDiffRad
            const areaKm2 = latDistance * lonDistance
            
            // Get geographical limits config
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
