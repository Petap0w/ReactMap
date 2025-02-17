// @ts-check
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'

import { useStorage } from '@hooks/useStorage'

const STYLE = { margin: '3px 0' }

export default function LocaleSelection() {
  const { t, i18n } = useTranslation()
  return (
    <FormControl size="small" fullWidth style={STYLE}>
      <InputLabel>{t('locale_selection')}</InputLabel>
      <Select
        autoFocus
        label={t('locale_selection')}
        value={i18n.language}
        onChange={(event) => {
          i18n.changeLanguage(event.target.value)
          useStorage.setState((prev) => ({
            settings: { ...prev.settings, locale: event.target.value },
          }))
        }}
        fullWidth
      >
        {CONFIG.client.locales.map((option) => (
          <MenuItem key={option} value={option} dense>
            {t(`locale_selection_${option}`)}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}
