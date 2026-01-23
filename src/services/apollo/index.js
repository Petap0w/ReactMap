// @ts-check
import { ApolloClient, InMemoryCache, createHttpLink, from } from '@apollo/client'
import { onError } from '@apollo/client/link/error'

import { AbortableLink } from './AbortableLink'

const abortableLink = new AbortableLink()

// Error link to suppress console errors for handled errors
const errorLink = onError(({ graphQLErrors, networkError, operation }) => {
  if (networkError && 'statusCode' in networkError) {
    // Check if this is a handled error (area too large, data limit, etc.)
    const isHandledError =
      networkError.statusCode === 400 &&
      // @ts-ignore
      (networkError.result?.errors?.[0]?.extensions?.code === 'AREA_TOO_LARGE' ||
        // @ts-ignore
        networkError.result?.errors?.[0]?.message === 'query_area_too_large')
    
    if (isHandledError) {
      // Suppress console error for handled errors - they're shown in snackbar
      return
    }
  }
  
  if (graphQLErrors) {
    const isHandledError = graphQLErrors.some(
      (err) =>
        err.extensions?.code === 'AREA_TOO_LARGE' ||
        err.message === 'query_area_too_large'
    )
    
    if (isHandledError) {
      // Suppress console error for handled errors
      return
    }
  }
  
  // Let other errors be logged normally
})

export const apolloCache = new InMemoryCache({
  typePolicies: {
    Query: {},
    SearchQuest: {
      keyFields: ['id', 'with_ar'],
    },
    PoracleProfile: {
      keyFields: ['uid'],
    },
    PoraclePokemon: {
      keyFields: ['uid'],
    },
    PoracleGym: {
      keyFields: ['uid'],
    },
    PoracleRaid: {
      keyFields: ['uid'],
    },
    PoracleEgg: {
      keyFields: ['uid'],
    },
    PoracleInvasion: {
      keyFields: ['uid'],
    },
    PoracleLure: {
      keyFields: ['uid'],
    },
    PoracleQuest: {
      keyFields: ['uid'],
    },
    PoracleNest: {
      keyFields: ['uid'],
    },
    PoracleWeather: {
      keyFields: ['uid'],
    },
  },
})

export const apolloClient = new ApolloClient({
  uri: '/graphql',
  link: from([errorLink, abortableLink, createHttpLink()]),
  name: encodeURIComponent(CONFIG.client.title),
  version: CONFIG.client.version,
  cache: apolloCache,
})
