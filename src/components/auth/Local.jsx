// @ts-check

import * as React from 'react'
import Grid from '@mui/material/Unstable_Grid2'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import OutlinedInput from '@mui/material/OutlinedInput'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import { useTranslation } from 'react-i18next'
import { useLazyQuery } from '@apollo/client'

import { login } from '@services/fetches'
import { Query } from '@services/queries'
import { VisibleToggle } from '@components/inputs/VisibleToggle'

/**
 *
 * @param {{ href?: string, sx?: import("@mui/material").SxProps, style?: React.CSSProperties, horizontal?: boolean, textColor?: string, inputBackgroundColor?: string, buttonBackgroundColor?: string }} props
 * @returns
 */
export function LocalLogin({
  href,
  sx,
  style,
  horizontal = false,
  textColor,
  inputBackgroundColor,
  buttonBackgroundColor,
}) {
  const { t } = useTranslation()
  const [user, setUser] = React.useState({
    username: '',
    password: '',
    showPassword: false,
  })
  const [error, setError] = React.useState('')
  const [submitted, setSubmitted] = React.useState(false)
  const [checkUsername, { data }] = useLazyQuery(Query.user('CHECK_USERNAME'))

  // Check if text should be black (from textColor prop, style.color, or sx.color)
  const textColorBlack = React.useMemo(() => {
    // Explicit textColor prop takes precedence
    if (
      textColor === 'black' ||
      textColor === '#000' ||
      textColor === '#000000'
    ) {
      return true
    }
    // Check style.color
    if (
      style?.color === 'black' ||
      style?.color === '#000' ||
      style?.color === '#000000'
    ) {
      return true
    }
    // Check sx.color (can be object or array)
    if (sx) {
      const sxObj = Array.isArray(sx)
        ? sx.find((s) => s && typeof s === 'object')
        : sx
      if (sxObj && typeof sxObj === 'object') {
        if (
          sxObj.color === 'black' ||
          sxObj.color === '#000' ||
          sxObj.color === '#000000'
        ) {
          return true
        }
      }
    }
    return false
  }, [textColor, style, sx])

  const handleChange = (e) => {
    if (e.target.name === 'username') {
      checkUsername({ variables: { username: e.target.value } })
    }
    setUser({ ...user, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitted(true)
    const resp = await login(user, href)
    if ('ok' in resp && !resp.ok) {
      setError(t('localauth_failed'))
      setSubmitted(false)
    } else if ('url' in resp && resp.url.includes('invalid_credentials')) {
      setError(t('invalid_credentials'))
      setSubmitted(false)
    } else {
      window.location.replace('/')
    }
  }

  return (
    <Box sx={sx} style={style}>
      <form onSubmit={handleSubmit}>
        <Grid
          container
          justifyContent="center"
          alignItems="center"
          direction={horizontal ? { xs: 'column', sm: 'row' } : 'column'}
          spacing={horizontal ? { xs: 2, sm: 1 } : 2}
          flexWrap={horizontal ? { xs: 'wrap', sm: 'nowrap' } : 'wrap'}
        >
          <Grid
            textAlign="center"
            {...(horizontal ? { xs: 12, sm: 'auto' } : { xs: 12 })}
          >
            <FormControl variant="outlined" color="secondary" size="small">
              <InputLabel
                htmlFor="username"
                sx={
                  textColorBlack
                    ? {
                        color: 'black !important',
                        '&.Mui-focused': {
                          color: 'black !important',
                        },
                      }
                    : undefined
                }
              >
                {t('local_username')}
              </InputLabel>
              <OutlinedInput
                id="username"
                name="username"
                type="text"
                value={user.username}
                onChange={handleChange}
                autoComplete="username"
                label={t('local_username')}
                color="secondary"
                sx={{
                  width: horizontal ? { xs: 250, sm: 180 } : 250,
                  ...(inputBackgroundColor && {
                    backgroundColor: inputBackgroundColor,
                  }),
                  ...(textColorBlack && {
                    color: 'black !important',
                    '& .MuiOutlinedInput-input': {
                      color: 'black !important',
                    },
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'rgba(0, 0, 0, 0.23) !important',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'rgba(0, 0, 0, 0.87) !important',
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'black !important',
                    },
                  }),
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit(e)
                }}
              />
            </FormControl>
          </Grid>
          <Grid
            textAlign="center"
            {...(horizontal ? { xs: 12, sm: 'auto' } : { xs: 12 })}
          >
            <FormControl variant="outlined" color="secondary" size="small">
              <InputLabel
                htmlFor="password"
                sx={
                  textColorBlack
                    ? {
                        color: 'black !important',
                        '&.Mui-focused': {
                          color: 'black !important',
                        },
                      }
                    : undefined
                }
              >
                {t('local_password')}
              </InputLabel>
              <OutlinedInput
                id="password"
                name="password"
                type={user.showPassword ? 'text' : 'password'}
                value={user.password}
                onChange={handleChange}
                autoComplete="current-password"
                color="secondary"
                label={t('local_password')}
                sx={{
                  width: horizontal ? { xs: 250, sm: 180 } : 250,
                  ...(inputBackgroundColor && {
                    backgroundColor: inputBackgroundColor,
                  }),
                  ...(textColorBlack && {
                    color: 'black !important',
                    '& .MuiOutlinedInput-input': {
                      color: 'black !important',
                    },
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'rgba(0, 0, 0, 0.23) !important',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'rgba(0, 0, 0, 0.87) !important',
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'black !important',
                    },
                  }),
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit(e)
                }}
                endAdornment={
                  <InputAdornment position="end">
                    <IconButton
                      name="showPassword"
                      onClick={() =>
                        setUser({ ...user, showPassword: !user.showPassword })
                      }
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <VisibleToggle visible={user.showPassword} />
                    </IconButton>
                  </InputAdornment>
                }
              />
            </FormControl>
          </Grid>
          <Grid
            textAlign="center"
            {...(horizontal ? { xs: 12, sm: 'auto' } : { xs: 12 })}
          >
            <Button
              variant="contained"
              color="primary"
              onClick={handleSubmit}
              disabled={
                !user.username ||
                !user.password ||
                !data?.checkUsername ||
                submitted
              }
              sx={{
                minWidth: horizontal ? { xs: 250, sm: 'auto' } : 250,
                ...(buttonBackgroundColor && {
                  '&.Mui-disabled': {
                    backgroundColor: buttonBackgroundColor,
                    opacity: 0.6,
                  },
                }),
              }}
            >
              {t('login')}
            </Button>
          </Grid>
        </Grid>
      </form>
      <Collapse in={!!error}>
        <Typography variant="subtitle2" align="center" color="error" my={2}>
          {error}
        </Typography>
      </Collapse>
    </Box>
  )
}
