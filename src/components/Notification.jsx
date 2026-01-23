// @ts-check
import * as React from 'react'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import Slide from '@mui/material/Slide'
import AlertTitle from '@mui/material/AlertTitle'
import { useTranslation, Trans } from 'react-i18next'

/** @param {import('@mui/material').SlideProps} props */
function SlideTransition(props) {
  // eslint-disable-next-line react/jsx-props-no-spreading
  return <Slide {...props} direction="up" />
}

/** @type {React.CSSProperties} */
const alertStyle = { textAlign: 'center', color: 'white' }

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
}) {
  const { t } = useTranslation()
  const timerRef = React.useRef(null)

  const handleClose = React.useCallback((event, reason) => {
    // Prevent closing on clickaway
    if (reason === 'clickaway') {
      return
    }
    
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    
    // Delay callback until after transition completes (300ms for Slide transition)
    // This prevents resetting the alert state while the snackbar is still transitioning out
    setTimeout(() => {
      if (cb) cb()
    }, 300)
  }, [cb])

  React.useEffect(() => {
    if (open) {
      // Set auto-hide timer when snackbar opens
      timerRef.current = setTimeout(() => {
        handleClose(null, 'timeout')
      }, 5000)
      return () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current)
          timerRef.current = null
        }
      }
    }
  }, [open, handleClose])

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
        sx={{ textAlign: 'center', color: 'white' }}
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
