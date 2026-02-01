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

const ExpandedFab = styled(Fab, {
  shouldForwardProp: (prop) => prop !== 'expanded' && prop !== 'fabHeight' && prop !== 'fabWidth',
})(({ theme, expanded, fabHeight, fabWidth }) => ({
  position: 'relative',
  height: `${fabHeight}px !important`,
  width: expanded ? 'auto' : `${fabWidth}px`,
  minWidth: `${fabWidth}px`,
  maxWidth: expanded ? 350 : `${fabWidth}px`,
  padding: '0 !important',
  margin: '0 !important',
  transition: theme.transitions.create(['width', 'maxWidth'], {
    duration: 600,
    easing: theme.transitions.easing.easeInOut,
  }),
  overflow: 'hidden',
  display: 'flex !important',
  flexDirection: 'row !important',
  alignItems: 'center !important',
  justifyContent: 'flex-start !important',
  transform: 'none !important',
  writingMode: 'horizontal-tb !important',
  [theme.breakpoints.down('sm')]: {
    maxWidth: expanded ? 280 : `${fabWidth}px`,
  },
  '& > *': {
    transform: 'none !important',
  },
}))

const IconContainer = styled(Box)(({ fabWidth, fabHeight }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: `${fabWidth}px`,
  height: `${fabHeight}px`,
  minWidth: `${fabWidth}px`,
  minHeight: `${fabHeight}px`,
  maxWidth: `${fabWidth}px`,
  maxHeight: `${fabHeight}px`,
  position: 'relative',
  transform: 'none',
}))

const ContentContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  padding: theme.spacing(1, 1.5, 1, 1),
  minWidth: 0,
  flex: 1,
  overflow: 'hidden',
  justifyContent: 'center',
  opacity: 0,
  width: 0,
  maxWidth: 0,
  transform: 'none',
  writingMode: 'horizontal-tb',
  transition: theme.transitions.create(['opacity', 'width', 'maxWidth'], {
    duration: 600,
    easing: theme.transitions.easing.easeInOut,
  }),
  '&.expanded': {
    opacity: 1,
    width: 'auto',
    maxWidth: 'none',
  },
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
 *   fabWidth: number
 * }} props
 */
function BannerItem({ banner, fabSize, iconSize, fabHeight, fabWidth }) {
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
      <ExpandedFab
        size={fabSize}
        color="secondary"
        expanded={isExpanded}
        fabHeight={fabHeight}
        fabWidth={fabWidth}
        onClick={handleClick}
        sx={{
          cursor: banner.href ? 'pointer' : 'default',
          backgroundColor: banner.backgroundColor || undefined,
          color: banner.textColor || undefined,
          '&:hover': {
            backgroundColor: banner.backgroundColor || undefined,
            boxShadow: (theme) => theme.shadows[8],
          },
        }}
      >
        <IconContainer fabWidth={fabWidth} fabHeight={fabHeight}>
          {isImageIcon ? (
            <img
              src={banner.icon}
              alt={banner.title}
              style={{
                width: fabHeight,
                height: fabHeight,
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
        </IconContainer>
        <ContentContainer className={isExpanded ? 'expanded' : ''}>
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
      </ExpandedFab>
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
  // Fab dimensions: small = 40px, large = 56px
  const fabHeight = isMobile ? 40 : 56
  const fabWidth = isMobile ? 40 : 56

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
          fabWidth={fabWidth}
        />
      ))}
    </StyledBannerStack>
  )
}

export const DynamicBannersMemo = React.memo(DynamicBanners)

