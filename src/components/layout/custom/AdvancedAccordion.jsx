import React from 'react'
import ExpandMore from '@mui/icons-material/ExpandMore'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Grid'
import { styled } from '@mui/material/styles'
import { useTranslation } from 'react-i18next'

const StyledAccordion = styled(Accordion)((/* { theme } */) => ({
  marginTop: 5,
  border: 'none',
  boxShadow: 'none',
  borderRadius: 5,
  '&:before': {
    display: 'none',
  },
  '&:expanded': {
    marginTop: 5,
  },
  width: '100%',
}))

const StyledAccordionSummary = styled(AccordionSummary)((/* { theme } */) => ({
  backgroundColor: '#2e2e2e',
  padding: '0px 5px 0px 8px',
  minHeight: 30,
  borderRadius: 5,
  '&:expanded': {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    minHeight: 30,
  },
}))

export default function AdvancedAccordion({ block = null, children }) {
  const { t } = useTranslation()
  return (
    <StyledAccordion>
      <StyledAccordionSummary expandIcon={<ExpandMore />}>
        <Typography variant="caption">{t('advanced')}</Typography>
      </StyledAccordionSummary>
      <AccordionDetails sx={{ py: 0 }}>
        {block ? (
          <Grid
            container
            direction="row"
            justifyContent="center"
            alignItems="center"
          >
            {block}
          </Grid>
        ) : (
          children
        )}
      </AccordionDetails>
    </StyledAccordion>
  )
}
