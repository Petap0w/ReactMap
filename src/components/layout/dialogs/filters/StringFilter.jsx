// @ts-check
import * as React from 'react'
import { ListItem, TextField } from '@mui/material'
import { useTranslation } from 'react-i18next'
import dlv from 'dlv'

import { useStorage } from '@hooks/useStorage'
import { setDeep } from '@services/functions/setDeep'
import Utility from '@services/Utility'

/**
 * Expert string input field for filters
 * @param {{ field: string } & import('@mui/material').ListItemProps} props
 * @returns
 */
export function StringFilter({ field, ...props }) {
  const { t } = useTranslation()
  const value = useStorage((s) => dlv(s, `${field}.adv`))

  const [validation, setValidation] = React.useState({
    status: false,
    label: t('iv_or_filter'),
    message: t('overwrites'),
  })

  const validationCheck =
    /** @type {import('@mui/material').TextFieldProps['onChange']} */ (
      React.useCallback(
        (event) => {
          const newValue = event.target.value
          Utility.analytics('Filtering', newValue, 'Legacy')
          if (Utility.checkAdvFilter(newValue)) {
            setValidation({
              label: t('valid'),
              status: false,
              message: t('valid_filter'),
            })
          } else if (newValue === '') {
            setValidation({
              label: t('iv_or_filter'),
              status: false,
              message: t('overwrites'),
            })
          } else {
            setValidation({
              label: t('invalid'),
              status: true,
              message: t('invalid_filter'),
            })
          }
          useStorage.setState((prev) => setDeep(prev, `${field}.adv`, newValue))
        },
        [field],
      )
    )

  return (
    <ListItem {...props}>
      <TextField
        error={validation.status}
        label={validation.label}
        helperText={validation.message}
        value={value || ''}
        onChange={validationCheck}
        color={validation.status ? 'primary' : 'secondary'}
        fullWidth
        autoComplete="off"
      />
    </ListItem>
  )
}

export const StringFilterMemo = React.memo(StringFilter)
