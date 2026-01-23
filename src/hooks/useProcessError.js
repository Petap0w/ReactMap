// @ts-check
import { t } from 'i18next'

import { useMemory } from '@store/useMemory'
import { useWebhookStore } from '@store/useWebhookStore'
import React from 'react'

/**
 *
 * @param {import('@apollo/client').ApolloError} error
 */
export const useProcessError = (error) => {
  const [errorState, setErrorState] = React.useState(false)

  React.useEffect(() => {
    if (error) {
      // eslint-disable-next-line no-console
      console.error('useProcessError:', error)
      // Debug: log error structure for area too large
      if (
        error?.graphQLErrors?.[0]?.message === 'query_area_too_large' ||
        error?.graphQLErrors?.[0]?.extensions?.code === 'AREA_TOO_LARGE' ||
        // @ts-ignore
        error?.networkError?.result?.errors?.[0]?.message === 'query_area_too_large' ||
        // @ts-ignore
        error?.networkError?.result?.errors?.[0]?.extensions?.code === 'AREA_TOO_LARGE'
      ) {
        // eslint-disable-next-line no-console
        console.log('Area too large error detected:', {
          graphQLErrors: error.graphQLErrors,
          networkError: error.networkError,
          // @ts-ignore
          networkErrorResult: error?.networkError?.result,
        })
      }
    }
    if (error?.networkError && 'statusCode' in error.networkError) {
      if (error.networkError?.statusCode === 464) {
        useMemory.setState({ clientError: 'old_client' })
        setErrorState(true)
        return
      }
      if (error.networkError?.statusCode === 511) {
        useMemory.setState({ clientError: 'session_expired' })
        setErrorState(true)
        return
      }
      if (error.networkError?.statusCode === 429) {
        const until =
          // @ts-ignore
          error?.networkError?.result?.errors?.[0]?.extensions?.until || 0
        useWebhookStore.setState({
          alert: {
            open: true,
            severity: 'warning',
            message: t('data_limit_reached', {
              until: `${
                new Date(until).toTimeString().split('GMT')[0]
              } (${Math.ceil((until - Date.now()) / 1000)}s)`,
            }).toString(),
          },
        })
        setErrorState(false)
        return
      }
      if (error.networkError?.statusCode === 400) {
        // Check for area too large error in networkError result
        const graphQLError =
          // @ts-ignore
          error?.networkError?.result?.errors?.[0] ||
          error?.graphQLErrors?.[0]
        if (
          graphQLError?.extensions?.code === 'AREA_TOO_LARGE' ||
          graphQLError?.message === 'query_area_too_large'
        ) {
          useWebhookStore.setState({
            alert: {
              open: true,
              severity: 'warning',
              message: t('query_area_too_large').toString(),
            },
          })
          setErrorState(false)
          return
        }
      }
    }
    // Check GraphQL errors directly (for GraphQL errors without networkError)
    const graphQLError = error?.graphQLErrors?.[0]
    if (
      graphQLError?.extensions?.code === 'AREA_TOO_LARGE' ||
      graphQLError?.message === 'query_area_too_large'
    ) {
      useWebhookStore.setState({
        alert: {
          open: true,
          severity: 'warning',
          message: t('query_area_too_large').toString(),
        },
      })
      setErrorState(false)
      return
    }
    setErrorState(false)
  }, [error])

  return errorState
}
