// @ts-check
import * as React from 'react'
import { useMutation, useQuery } from '@apollo/client'
import { useTranslation } from 'react-i18next'
import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'
import Grid2 from '@mui/material/Unstable_Grid2'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

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
 * The game account personal shinies are shown for, presented like the other
 * read-only fields of the profile.
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

  const title = (
    <Grid2 xs={12}>
      <Typography variant="h6" align="center">
        {t('personal_shiny')}
      </Typography>
    </Grid2>
  )

  if (saved) {
    return (
      <Grid2 container alignItems="center" justifyContent="center">
        {title}
        <Grid2 xs={5} textAlign="center" margin="10px 0">
          <TextField
            disabled
            variant="outlined"
            label={t('personal_shiny_trainer')}
            value={saved.label}
          />
        </Grid2>
      </Grid2>
    )
  }

  const helperText = () => {
    if (error) return t(`personal_shiny_error_${error}`)
    if (found) {
      return t('personal_shiny_confirm_trainer', {
        name: found.codename || '',
        level: found.level || 0,
        team: found.team || '',
      })
    }
    return t('personal_shiny_friend_code_help')
  }

  return (
    <Grid2 container alignItems="center" justifyContent="center">
      {title}
      <Grid2 xs={10} textAlign="center" margin="10px 0">
        <TextField
          fullWidth
          variant="outlined"
          label={t('personal_shiny_friend_code')}
          value={formatFriendCode(digits)}
          disabled={looking || confirming}
          error={!!error || (!!digits && !complete)}
          helperText={helperText()}
          inputProps={{ inputMode: 'numeric' }}
          onChange={({ target }) => {
            setCode(friendCodeDigits(target.value).slice(0, FRIEND_CODE_LENGTH))
            setFound(null)
            setError('')
          }}
        />
      </Grid2>
      <Grid2 xs={12} textAlign="center">
        {found ? (
          <ButtonGroup>
            <Button disabled={confirming} onClick={handleConfirm}>
              {t('personal_shiny_confirm')}
            </Button>
            <Button
              color="secondary"
              disabled={confirming}
              onClick={() => {
                setFound(null)
                setError('')
              }}
            >
              {t('cancel')}
            </Button>
          </ButtonGroup>
        ) : (
          <Button disabled={!complete || looking} onClick={handleLookup}>
            {t('personal_shiny_lookup')}
          </Button>
        )}
      </Grid2>
    </Grid2>
  )
}
