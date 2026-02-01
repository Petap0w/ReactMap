// @ts-check

import * as React from 'react'
import { useQuery } from '@apollo/client'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { styled } from '@mui/material/styles'
import { DomEvent } from 'leaflet'
import { CUSTOM_BANNERS } from '@services/queries/config'
import { I } from '@components/I'

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

const BannerContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'expanded' && prop !== 'backgroundColor',
})(({ theme, expanded, backgroundColor }) => ({
  display: 'flex',
  alignItems: 'center',
  borderRadius: theme.shape.borderRadius,
  backgroundColor: backgroundColor || theme.palette.background.paper,
  boxShadow: theme.shadows[4],
  overflow: 'hidden',
  maxWidth: expanded ? 350 : 56,
  width: expanded ? 'auto' : 56,
  transition: theme.transitions.create(['maxWidth', 'width'], {
    duration: theme.transitions.duration.enteringScreen,
    easing: theme.transitions.easing.easeOut,
  }),
  [theme.breakpoints.down('sm')]: {
    maxWidth: expanded ? 280 : 48,
    width: expanded ? 'auto' : 48,
  },
}))

const IconContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 56,
  height: 56,
  flexShrink: 0,
  [theme.breakpoints.down('sm')]: {
    minWidth: 48,
    height: 48,
  },
}))

const ContentContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  padding: theme.spacing(1, 1.5),
  minWidth: 0,
  flex: 1,
  overflow: 'hidden',
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
 * }} props
 */
function BannerItem({ banner }) {
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
    <BannerContainer
      expanded={isExpanded}
      backgroundColor={banner.backgroundColor}
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
      <IconContainer>
        {isImageIcon ? (
          <img
            src={banner.icon}
            alt={banner.title}
            style={{
              width: 24,
              height: 24,
              objectFit: 'contain',
            }}
          />
        ) : (
          <I
            className={banner.icon}
            size="medium"
            color={banner.textColor || 'inherit'}
          />
        )}
      </IconContainer>
      <ContentContainer
        sx={{
          opacity: isExpanded ? 1 : 0,
          width: isExpanded ? 'auto' : 0,
          transition: (theme) =>
            theme.transitions.create(['opacity', 'width'], {
              duration: theme.transitions.duration.enteringScreen,
              easing: theme.transitions.easing.easeOut,
            }),
          pointerEvents: isExpanded ? 'auto' : 'none',
        }}
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
      </ContentContainer>
    </BannerContainer>
  )
}

export function DynamicBanners() {
  const { data } = useQuery(CUSTOM_BANNERS, {
    fetchPolicy: 'cache-first',
  })
  const ref = React.useRef(null)

  const banners = React.useMemo(
    () => (Array.isArray(data?.customBanners) ? data.customBanners : []),
    [data?.customBanners],
  )

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
        <BannerItem key={`${banner.icon}-${banner.href}-${index}`} banner={banner} />
      ))}
    </StyledBannerStack>
  )
}

export const DynamicBannersMemo = React.memo(DynamicBanners)

