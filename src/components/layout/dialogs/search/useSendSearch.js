import { useState, useCallback, useMemo, useEffect } from 'react'
import { useLazyQuery } from '@apollo/client'
import { useTranslation } from 'react-i18next'
import { debounce } from 'lodash'

import Query from '@services/Query'
import Utility from '@services/Utility'
import { useStorage } from '@hooks/useStorage'
import { useMemory } from '@hooks/useMemory'
import { useMapStore } from '@hooks/useMapStore'

/**
 * @param {string} search
 * @param {boolean} open
 * @returns {{
 *  loading: boolean
 *  options: import('@mui/material').AutocompleteProps['options'],
 *  handleInputChange: import('@mui/material').AutocompleteProps['onInputChange']
 * }}
 */
export function useSendSearch(search, open) {
  const [options, setOptions] = useState([])
  const searchTab = useStorage((s) => s.searchTab)

  const { i18n } = useTranslation()
  const { map } = useMapStore()

  const [callSearch, { data, previousData, loading }] = useLazyQuery(
    Query.search(searchTab),
    { fetchPolicy: 'cache-and-network' },
  )

  const sendToServer = useCallback(
    (/** @type {string} */ newSearch) => {
      const { lat, lng } = map.getCenter()
      const { areas } = useStorage.getState().filters.scanAreas?.filter || {
        areas: [],
      }
      callSearch({
        variables: {
          search: newSearch,
          category: searchTab,
          lat,
          lon: lng,
          locale: i18n.language,
          onlyAreas: areas || [],
        },
      })
    },
    [i18n.language, searchTab],
  )

  const debounceChange = useMemo(
    () => debounce(sendToServer, 250),
    [sendToServer],
  )

  /** @type {import('@mui/material').AutocompleteProps['onInputChange']} */
  const handleInputChange = useCallback(
    (e, newValue) => {
      if (
        e?.type === 'change' &&
        (/^[0-9\s\p{L}]+$/u.test(newValue) || newValue === '')
      ) {
        useStorage.setState({ search: newValue.toLowerCase() })
        debounceChange(newValue.toLowerCase())
      }
    },
    [debounceChange],
  )

  useEffect(() => {
    setOptions(
      search
        ? (
            (data || previousData)?.[
              searchTab === 'quests'
                ? 'searchQuest'
                : searchTab === 'lures'
                ? 'searchLure'
                : searchTab === 'invasions'
                ? 'searchInvasion'
                : 'search'
            ] || []
          ).map((option, index) => ({ ...option, index }))
        : [],
    )
    Utility.analytics('Global Search', `Search Value: ${search}`, searchTab)
  }, [data])

  useEffect(() => {
    useMemory.setState({ searchLoading: loading })
  }, [loading])

  useEffect(() => {
    if (search && open) sendToServer(search)
    if (open) map.closePopup()
  }, [open])

  useEffect(() => {
    if (open) {
      sendToServer(search)
    }
  }, [searchTab])

  useEffect(() => {
    if (search === '' && open) {
      setOptions([])
    }
  }, [search, open])

  return { loading, options, handleInputChange }
}
