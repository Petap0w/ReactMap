/* eslint-disable import/prefer-default-export */
import { capitalize } from '@mui/material'

export function fromSnakeCase(str, separator = ' ') {
  return capitalize(str)
    .replace(/_/g, separator)
    .replace(/([a-z\d])([A-Z])/g, `$1${separator}$2`)
    .replace(/([A-Z]+)([A-Z][a-z\d]+)/g, `$1${separator}$2`)
}
