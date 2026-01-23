// @ts-check
import * as React from 'react'

import { Notification } from '@components/Notification'
import { resetAlert, useWebhookStore } from '@store/useWebhookStore'

export function WebhookNotification() {
  const alert = useWebhookStore((s) => s.alert)
  const [displayMessage, setDisplayMessage] = React.useState('')
  const [displaySeverity, setDisplaySeverity] = React.useState('info')
  const [isVisible, setIsVisible] = React.useState(false)
  
  React.useEffect(() => {
    if (alert.open && alert.message) {
      // Update display values when alert opens with a message
      setDisplayMessage(alert.message)
      setDisplaySeverity(alert.severity || 'info')
      setIsVisible(true)
    } else if (!alert.open && isVisible) {
      // Keep visible during exit transition, then unmount after transition completes
      const timer = setTimeout(() => {
        setIsVisible(false)
        setDisplayMessage('')
      }, 350) // Slightly longer than transition (300ms) to ensure smooth exit
      return () => clearTimeout(timer)
    }
  }, [alert.open, alert.message, alert.severity, isVisible])
  
  // Only render if we have a visible alert
  if (!isVisible || !displayMessage) {
    return null
  }
  
  return (
    <Notification open={alert.open} cb={resetAlert} severity={displaySeverity}>
      {displayMessage}
    </Notification>
  )
}
