// @ts-check
import * as React from 'react'

import { Notification } from '@components/Notification'
import { resetAlert, useWebhookStore } from '@store/useWebhookStore'

export function WebhookNotification() {
  const alert = useWebhookStore((s) => s.alert)
  const [hasShown, setHasShown] = React.useState(false)
  
  React.useEffect(() => {
    if (alert.open && alert.message) {
      setHasShown(true)
    } else if (!alert.open && !alert.message) {
      // Reset after transition completes (small delay to allow exit animation)
      const timer = setTimeout(() => {
        setHasShown(false)
      }, 300) // Transition duration
      return () => clearTimeout(timer)
    }
  }, [alert.open, alert.message])
  
  // Only render if we've shown a message (prevents empty snackbar on initial mount)
  // Keep mounted during transition even if message becomes empty
  if (!hasShown) {
    return null
  }
  
  return (
    <Notification open={alert.open} cb={resetAlert} severity={alert.severity}>
      {alert.message || ''}
    </Notification>
  )
}
