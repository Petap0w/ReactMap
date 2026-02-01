// @ts-check

import * as React from 'react'
import { useQuery } from '@apollo/client'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Fab from '@mui/material/Fab'
import { styled } from '@mui/material/styles'
import { DomEvent } from 'leaflet'
import { CUSTOM_BANNERS } from '@services/queries/config'
import { I } from '@components/I'
import { useMemory } from '@store/useMemory'

const StyledBannerStack = styled(Stack)(({ theme }) => ({
  position: 'fixed',
  top: theme.spacing(2),
  right: theme.spacing(2),
  zIndex: 5000,
  alignItems: 'flex-end',
  gap: theme.spacing(1),
  [theme.breakpoints.down('sm')]: {
    top: theme.spacing(1),
    right: theme.spacing(1),
  },
}))

const BannerWrapper = styled(Box)({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
})

const BannerPanel = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'expanded' && prop !== 'backgroundColor' && prop !== 'fabHeight',
})(({ theme, expanded, backgroundColor, fabHeight }) => ({
  position: 'absolute',
  right: 0,
  display: 'flex',
  alignItems: 'center',
  backgroundColor: backgroundColor || theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.shadows[4],
  paddingRight: theme.spacing(1),
  height: fabHeight,
  maxWidth: expanded ? 350 : 0,
  width: expanded ? 'auto' : 0,
  opacity: expanded ? 1 : 0,
  overflow: 'hidden',
  transition: theme.transitions.create(['maxWidth', 'width', 'opacity'], {
    duration: 400,
    easing: theme.transitions.easing.easeInOut,
  }),
  pointerEvents: expanded ? 'auto' : 'none',
  [theme.breakpoints.down('sm')]: {
    maxWidth: expanded ? 280 : 0,
  },
}))

const ContentContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  padding: theme.spacing(1, 1.5),
  minWidth: 0,
  flex: 1,
  overflow: 'hidden',
  justifyContent: 'center',
}))

const TitleText = styled(Typography)(({ theme }) => ({
  fontSize: '0.875rem',
  fontWeight: 600,
  lineHeight: 1.2,
  marginBottom: theme.spacing(0.25),
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}))

const DescriptionText = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  lineHeight: 1.3,
  opacity: 0.9,
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
}))

/**
 * @param {{
 *   banner: {
 *     icon: string
 *     href: string
 *     title: string
 *     description: string
 *     backgroundColor: string
 *     textColor: string
 *     displayTime: number
 *     hideTime: number
 *   }
 *   fabSize: 'small' | 'large'
 *   iconSize: 'small' | 'medium'
 *   fabHeight: number
 * }} props
 */
function BannerItem({ banner, fabSize, iconSize, fabHeight }) {
  const [isExpanded, setIsExpanded] = React.useState(false)
  const timersRef = React.useRef([])

  React.useEffect(() => {
    const cycleBanner = () => {
      // Start expanded
      setIsExpanded(true)

      // Collapse after displayTime
      const collapseTimer = setTimeout(() => {
        setIsExpanded(false)

        // Expand again after hideTime
        const expandTimer = setTimeout(() => {
          cycleBanner()
        }, banner.hideTime || 3000)

        timersRef.current.push(expandTimer)
      }, banner.displayTime || 5000)

      timersRef.current.push(collapseTimer)
    }

    cycleBanner()

    return () => {
      timersRef.current.forEach((timer) => {
        if (timer) {
          clearTimeout(timer)
        }
      })
      timersRef.current = []
    }
  }, [banner.displayTime, banner.hideTime])

  const handleClick = React.useCallback(() => {
    if (banner.href) {
      window.open(banner.href, '_blank', 'noopener,noreferrer')
    }
  }, [banner.href])

  const isImageIcon = banner.icon?.startsWith('http')

  return (
    <BannerWrapper>
      <BannerPanel
        expanded={isExpanded}
        backgroundColor={banner.backgroundColor}
        fabHeight={fabHeight}
        onClick={handleClick}
        sx={{
          cursor: banner.href ? 'pointer' : 'default',
          '&:hover': banner.href
            ? {
                boxShadow: (theme) => theme.shadows[8],
              }
            : {},
        }}
      >
        <ContentContainer>
          <TitleText
            variant="body2"
            sx={{
              color: banner.textColor || 'inherit',
            }}
          >
            {banner.title}
          </TitleText>
          <DescriptionText
            variant="body2"
            component="div"
            sx={{
              color: banner.textColor || 'inherit',
            }}
            dangerouslySetInnerHTML={{ __html: banner.description || '' }}
          />
        </ContentContainer>
      </BannerPanel>
      <Fab
        size={fabSize}
        color="secondary"
        onClick={handleClick}
        sx={{
          position: 'relative',
          zIndex: 1,
          backgroundColor: banner.backgroundColor || undefined,
          color: banner.textColor || undefined,
          '&:hover': {
            backgroundColor: banner.backgroundColor || undefined,
            boxShadow: (theme) => theme.shadows[8],
          },
        }}
      >
        {isImageIcon ? (
          <img
            src={banner.icon}
            alt={banner.title}
            style={{
              width: iconSize === 'small' ? 20 : 24,
              height: iconSize === 'small' ? 20 : 24,
              objectFit: 'contain',
            }}
          />
        ) : (
          <I
            className={banner.icon}
            size={iconSize}
            color={banner.textColor || 'white'}
          />
        )}
      </Fab>
    </BannerWrapper>
  )
}

export function DynamicBanners() {
  const { data } = useQuery(CUSTOM_BANNERS, {
    fetchPolicy: 'cache-first',
  })
  const ref = React.useRef(null)
  const isMobile = useMemory((s) => s.isMobile)

  const banners = React.useMemo(
    () => (Array.isArray(data?.customBanners) ? data.customBanners : []),
    [data?.customBanners],
  )

  const fabSize = isMobile ? 'small' : 'large'
  const iconSize = isMobile ? 'small' : 'medium'
  // Fab heights: small = 40px, large = 56px
  const fabHeight = isMobile ? 40 : 56

  React.useEffect(() => {
    if (ref.current) {
      DomEvent.disableClickPropagation(ref.current)
    }
  }, [])

  if (!banners.length) {
    return null
  }

  return (
    <StyledBannerStack ref={ref} direction="column">
      {banners.map((banner, index) => (
        <BannerItem
          key={`${banner.icon}-${banner.href}-${index}`}
          banner={banner}
          fabSize={fabSize}
          iconSize={iconSize}
          fabHeight={fabHeight}
        />
      ))}
    </StyledBannerStack>
  )
}

export const DynamicBannersMemo = React.memo(DynamicBanners)

