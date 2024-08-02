// @ts-check
const Sentry = require('@sentry/node')

const config = require('@rm/config')

const pkg = require('../../../package.json')

/**
 *
 * @param {import('express').Application} app
 */
function sentryMiddleware(app) {
  const sentry = config.getSafe('sentry.server')
  if (sentry.enabled || process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: sentry.dsn || process.env.SENTRY_DSN,
      debug: sentry.debug || !!process.env.SENTRY_DEBUG,
      environment: process.env.NODE_ENV || 'production',
      integrations: [
        // enable HTTP calls tracing
        new Sentry.Integrations.Http({ tracing: true }),
        // enable Express.js middleware tracing
        new Sentry.Integrations.Express({
          // to trace all requests to the default router
          app,
          // alternatively, you can specify the routes you want to trace:
          // router: someRouter,
        }),
        ...Sentry.autoDiscoverNodePerformanceMonitoringIntegrations(),
      ],
      tracesSampleRate:
        +(process.env.SENTRY_TRACES_SAMPLE_RATE || sentry.tracesSampleRate) ||
        0.1,
      release: pkg.version,
    })

    // RequestHandler creates a separate execution context, so that all
    // transactions/spans/breadcrumbs are isolated across requests
    app.use(Sentry.Handlers.requestHandler())
    // TracingHandler creates a trace for every incoming request
    app.use(Sentry.Handlers.tracingHandler())

    app.use(Sentry.Handlers.errorHandler())
  }
}

/**
 * @param {import('express').Response} res
 * @returns {import('@sentry/node').Transaction | null}
 */
function sentryTransaction(res) {
  const sentry = config.getSafe('sentry.server')

  if (sentry.enabled || process.env.SENTRY_DSN) {
    const transaction =
      // @ts-ignore
      res.__sentry_transaction ??
      Sentry.startTransaction({ name: 'POST /graphql' })
    Sentry.configureScope((scope) => {
      scope.setSpan(transaction)
    })
    return transaction
  }
  return null
}

module.exports = { sentryMiddleware, sentryTransaction }
