// @ts-check
/* eslint-disable react/no-array-index-key */
import * as React from 'react'
import Typography from '@mui/material/Typography'
import Dialog from '@mui/material/Dialog'
import Box from '@mui/material/Box'
import { useQuery } from '@apollo/client'

import { useLayoutStore } from '@hooks/useLayoutStore'
import { useStorage } from '@hooks/useStorage'
import { CUSTOM_COMPONENT, MOTD_CHECK } from '@services/queries/config'
import Utility from '@services/Utility'

import DialogWrapper from '../custom/DialogWrapper'
import CustomTile from '../custom/CustomTile'
import { Loading } from '../general/Loading'

const DEFAULT =
  /** @type {import('@rm/types').Config['map']['messageOfTheDay']} */ ({
    settings: {},
    components: [],
    titles: [],
    footerButtons: [],
    index: 0,
  })

export default function MessageOfTheDay() {
  const clientIndex = useStorage((s) => s.motdIndex)
  const tutorial = useStorage((s) => s.tutorial)

  const open = useLayoutStore((s) => s.motd)

  const { data: check, loading: loadingCheck } = useQuery(MOTD_CHECK, {
    fetchPolicy: 'cache-first',
    variables: { clientIndex },
  })

  const { data, loading } = useQuery(CUSTOM_COMPONENT, {
    fetchPolicy: 'cache-first',
    variables: { component: 'messageOfTheDay' },
    skip: !open,
  })

  const motd = /** @type {typeof DEFAULT} */ (data?.customComponent || DEFAULT)

  const handleMotdClose = React.useCallback(() => {
    if (motd.settings.permanent === false) {
      useStorage.setState({ motdIndex: motd.index })
    }
    useLayoutStore.setState({ motd: false })
  }, [motd])

  React.useEffect(() => {
    if (check?.motdCheck && !open) {
      useLayoutStore.setState({ motd: true })
    }
  }, [check])

  return (
    <Dialog
      open={open && !tutorial}
      maxWidth={motd.dialogMaxWidth || 'sm'}
      onClose={handleMotdClose}
    >
      <DialogWrapper
        configObj={motd}
        defaultTitle="message_of_the_day"
        handleClose={handleMotdClose}
      >
        {loading || loadingCheck ? (
          <Loading />
        ) : (
          motd.components.map((block, i) => (
            <CustomTile
              key={i}
              block={block}
              defaultReturn={block.type ? null : <DefaultMotD block={block} />}
            />
          ))
        )}
      </DialogWrapper>
    </Dialog>
  )
}

const DefaultMotD = ({ block }) =>
  typeof block === 'string' ? (
    <Typography key={block} variant="subtitle1" align="center" margin={3}>
      {block}
    </Typography>
  ) : (
    <Box whiteSpace="pre-line" margin={3} textAlign="center">
      {block.title && (
        <Typography variant="h6">
          {Utility.getBlockContent(block.title)}
        </Typography>
      )}
      {block.body && (
        <Typography variant="subtitle1">
          {Utility.getBlockContent(block.body)}
        </Typography>
      )}
      {block.footer && (
        <Typography variant="caption">
          {Utility.getBlockContent(block.footer)}
        </Typography>
      )}
    </Box>
  )
