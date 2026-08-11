// @ts-check
import * as React from 'react'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import Slide from '@mui/material/Slide'
import AlertTitle from '@mui/material/AlertTitle'
import { useTranslation, Trans } from 'react-i18next'

import { setLongTimeout } from '@utils/setLongTimeout'

/** @param {import('@mui/material').SlideProps} props */
function SlideTransition(props) {
  // eslint-disable-next-line react/jsx-props-no-spreading
  return <Slide {...props} direction="up" />
}

/** @type {React.CSSProperties} */
const alertStyle = { textAlign: 'center', color: 'white' }
const DEFAULT_AUTO_HIDE_DURATION = 5000

/**
 *
 * @template T
 * @param {{
 *  open?: boolean
 *  severity: import('@mui/material').AlertProps['severity']
 *  i18nKey?: T
 *  messages?: T extends string ? { key: string, variables: string[] }[] : React.ReactNode
 *  children?: T extends string ? never : React.ReactNode
 *  cb?: () => void
 *  title?: string
 *  autoHideDuration?: number | null
 *  ignoreClickaway?: boolean
 *  closable?: boolean
 * }} props
 * @returns
 */
export function Notification({
  open,
  severity,
  i18nKey,
  messages,
  children,
  cb,
  title,
  autoHideDuration = DEFAULT_AUTO_HIDE_DURATION,
  ignoreClickaway = false,
  closable = true,
}) {
  const { t } = useTranslation()
  const timerRef = React.useRef(null)

  const handleClose = React.useCallback(
    (event, reason) => {
      if (reason === 'clickaway' && ignoreClickaway) return
      if (!closable) return

      if (timerRef.current) {
        timerRef.current()
        timerRef.current = null
      }

      // Delay callback until after transition completes
      setTimeout(() => {
        if (cb) cb()
      }, 300)
    },
    [cb, closable, ignoreClickaway],
  )

  React.useEffect(() => {
    if (open && typeof autoHideDuration === 'number') {
      timerRef.current = setLongTimeout(() => {
        timerRef.current = null
        handleClose(null, 'timeout')
      }, autoHideDuration)
      return () => {
        if (timerRef.current) {
          timerRef.current()
          timerRef.current = null
        }
      }
    }
    return undefined
  }, [open])

  return (
    <Snackbar
      open={open}
      onClose={handleClose}
      TransitionComponent={SlideTransition}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        onClose={handleClose}
        severity={severity}
        variant="filled"
        style={alertStyle}
      >
        {title && <AlertTitle>{t(title)}</AlertTitle>}
        {typeof i18nKey === 'string' && Array.isArray(messages)
          ? messages.map((message, i) => (
              <React.Fragment key={message.key}>
                <Trans i18nKey={`${i18nKey}_${i}`}>
                  <>
                    {message.variables.map((variable, j) => ({
                      [`variable_${j}`]: t(variable),
                    }))}
                  </>
                </Trans>
                <br />
              </React.Fragment>
            ))
          : children}
      </Alert>
    </Snackbar>
  )
}
