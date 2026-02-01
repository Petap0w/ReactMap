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

const BannerWrapper = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'expanded' && prop !== 'fabWidth' && prop !== 'measuredWidth',
})(({ theme, expanded, fabWidth, measuredWidth }) => ({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start', // Align container to left so icon (leftmost part) is visible
  width: expanded ? `${measuredWidth}px` : `${fabWidth}px`,
  maxWidth: expanded ? 300 : `${fabWidth}px`, // Reduced from 350 to 300
  overflow: 'hidden',
  backgroundColor: 'transparent',
  border: 'none',
  boxShadow: 'none',
  transition: theme.transitions.create(['width', 'maxWidth'], {
    duration: 3000,
    easing: theme.transitions.easing.easeInOut,
  }),
  [theme.breakpoints.down('sm')]: {
    maxWidth: expanded ? 240 : `${fabWidth}px`, // Reduced from 280 to 240
  },
}))

const BannerContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'expanded' && prop !== 'fabHeight' && prop !== 'fabWidth',
})(({ theme, expanded, fabHeight, fabWidth }) => ({
  position: 'relative',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  height: `${fabHeight}px`,
  width: 'auto',
  maxWidth: expanded ? 300 : 'none', // Reduced to match wrapper
  // No transform needed - wrapper width will clip the container
  // When collapsed: wrapper is 40px, shows only leftmost 40px (icon)
  // When expanded: wrapper expands, shows full container (icon + text)
  backgroundColor: 'transparent',
  border: 'none',
  boxShadow: 'none',
  padding: 0,
  margin: 0,
  transition: theme.transitions.create(['maxWidth'], {
    duration: 3000,
    easing: theme.transitions.easing.easeInOut,
  }),
  [theme.breakpoints.down('sm')]: {
    maxWidth: expanded ? 240 : 'none', // Reduced to match wrapper
  },
}))

const TextBanner = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'fabHeight',
})(({ theme, fabHeight }) => ({
  display: 'flex',
  flexDirection: 'column',
  padding: theme.spacing(0.5, 1.5, 0.5, 1), // Reduced vertical padding to prevent text cutoff
  height: `${fabHeight}px`,
  backgroundColor: 'inherit',
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.shadows[4],
  justifyContent: 'center',
  minWidth: 0,
  whiteSpace: 'nowrap',
  marginRight: theme.spacing(0.5),
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(0.25, 1, 0.25, 0.75), // Even less padding on mobile
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
  const containerRef = React.useRef(null)
  const [measuredWidth, setMeasuredWidth] = React.useState(fabWidth)

  // Measure the container width when expanded
  React.useEffect(() => {
    if (isExpanded && containerRef.current) {
      const width = containerRef.current.scrollWidth
      setMeasuredWidth(width)
    }
  }, [isExpanded])

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
    <BannerWrapper
      expanded={isExpanded}
      fabWidth={fabWidth}
      measuredWidth={measuredWidth}
    >
      <BannerContainer
        ref={containerRef}
        expanded={isExpanded}
        fabHeight={fabHeight}
        fabWidth={fabWidth}
      >
        <Fab
          size={fabSize}
          color="secondary"
          onClick={handleClick}
          sx={{
            flexShrink: 0,
            cursor: banner.href ? 'pointer' : 'default',
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
        </Fab>
        <TextBanner
          fabHeight={fabHeight}
          sx={{
            backgroundColor: banner.backgroundColor || undefined,
            cursor: banner.href ? 'pointer' : 'default',
            '&:hover': banner.href
              ? {
                  boxShadow: (theme) => theme.shadows[8],
                }
              : {},
          }}
          onClick={handleClick}
        >
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
        </TextBanner>
      </BannerContainer>
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

