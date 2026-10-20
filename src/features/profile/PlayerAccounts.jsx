// @ts-check
import * as React from 'react'
import { useMutation, useQuery } from '@apollo/client'
import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import TextField from '@mui/material/TextField'

import { useMemory } from '@store/useMemory'
import { Query } from '@services/queries'

/**
 * @typedef {{ label: string, active: boolean }} PlayerAccount
 * @typedef {{ status: string, codename?: string, level?: number, team?: string }} Resolution
 */

const FRIEND_CODE_LENGTH = 12

/** @param {string} input */
const friendCodeDigits = (input) => input.replace(/\D/g, '')

/** Groups a friend code in fours, the way the game shows it */
const formatFriendCode = (digits) =>
  digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim()

/**
 * The game account personal shinies are shown for.
 *
 * A player is set once and then fixed: the friend code is sent to the map's
 * resolver, which answers with the trainer it belongs to, and the user confirms
 * that trainer before anything is saved. The player id itself never reaches the
 * browser.
 */
export function PlayerAccounts() {
  const { t } = useTranslation()
  const allowed = useMemory(
    (s) => !!s.auth.perms.personalShiny && s.auth.loggedIn,
  )
  const max = useMemory((s) => s.auth.personalShinyMax)

  /** @type {import('@apollo/client').QueryResult<{ playerAccounts: PlayerAccount[] }>} */
  const { data } = useQuery(Query.user('GET_PLAYER_ACCOUNTS'), {
    skip: !allowed,
  })
  const [lookup, { loading: looking }] = useMutation(
    Query.user('RESOLVE_PLAYER_ID'),
  )
  const [confirm, { loading: confirming }] = useMutation(
    Query.user('CONFIRM_PLAYER_ID'),
    { refetchQueries: ['PlayerAccounts'] },
  )

  const [code, setCode] = React.useState('')
  const [found, setFound] = React.useState(
    /** @type {Resolution | null} */ (null),
  )
  const [error, setError] = React.useState('')

  const saved = data?.playerAccounts?.[0]
  const digits = friendCodeDigits(code)
  const complete = digits.length === FRIEND_CODE_LENGTH

  if (!allowed || !data || (!max && !saved)) return null

  /** @param {Resolution | undefined} result */
  const handleResult = (result) => {
    if (result?.status === 'resolved' || result?.status === 'saved') {
      setFound(result.status === 'resolved' ? result : null)
      setError('')
      if (result.status === 'saved') setCode('')
      return
    }
    setFound(null)
    setError(result?.status || 'unavailable')
  }

  const handleLookup = async () => {
    try {
      const { data: result } = await lookup({
        variables: { friendCode: digits },
      })
      handleResult(result?.resolvePlayerId)
    } catch (e) {
      handleResult(undefined)
    }
  }

  const handleConfirm = async () => {
    try {
      const { data: result } = await confirm({
        variables: { friendCode: digits },
      })
      handleResult(result?.confirmPlayerId)
    } catch (e) {
      handleResult(undefined)
    }
  }

  return (
    <Box className="flex-center">
      <List>
        <ListSubheader>{t('personal_shiny')}</ListSubheader>
        {saved ? (
          <ListItem>
            <ListItemText
              primary={t('personal_shiny_player_set', { name: saved.label })}
              secondary={t('personal_shiny_player_locked')}
            />
          </ListItem>
        ) : (
          <>
            <ListItem>
              <ListItemText secondary={t('personal_shiny_friend_code_help')} />
            </ListItem>
            <ListItem>
              <TextField
                size="small"
                fullWidth
                label={t('personal_shiny_friend_code')}
                value={formatFriendCode(digits)}
                disabled={looking || confirming}
                error={!!digits && !complete}
                inputProps={{ inputMode: 'numeric' }}
                onChange={({ target }) => {
                  setCode(
                    friendCodeDigits(target.value).slice(0, FRIEND_CODE_LENGTH),
                  )
                  setFound(null)
                  setError('')
                }}
              />
            </ListItem>
            {!!found && (
              <ListItem>
                <ListItemText
                  primary={t('personal_shiny_confirm_trainer', {
                    name: found.codename || '',
                    level: found.level || 0,
                    team: found.team || '',
                  })}
                  secondary={t('personal_shiny_confirm_warning')}
                />
              </ListItem>
            )}
            {!!error && (
              <ListItem>
                <ListItemText
                  secondary={t(`personal_shiny_error_${error}`)}
                  secondaryTypographyProps={{ color: 'error' }}
                />
              </ListItem>
            )}
            <ListItem>
              {found ? (
                <ButtonGroup fullWidth>
                  <Button
                    disabled={confirming}
                    color="primary"
                    onClick={handleConfirm}
                  >
                    {t('personal_shiny_confirm')}
                  </Button>
                  <Button
                    disabled={confirming}
                    color="secondary"
                    onClick={() => {
                      setFound(null)
                      setError('')
                    }}
                  >
                    {t('cancel')}
                  </Button>
                </ButtonGroup>
              ) : (
                <Button
                  fullWidth
                  disabled={!complete || looking}
                  onClick={handleLookup}
                >
                  {t('personal_shiny_lookup')}
                </Button>
              )}
            </ListItem>
          </>
        )}
      </List>
    </Box>
  )
}
