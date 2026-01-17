// @ts-check

const NodeCache = require('node-cache')
const { Logger } = require('@rm/logger')
const config = require('@rm/config')

/**
 * @typedef {{
 *   timestamp: number
 *   endpoint: string
 *   category: string
 *   userId: number
 *   username: string
 *   ip: string
 *   userAgent?: string
 *   bbox?: { minLat: number, maxLat: number, minLon: number, maxLon: number }
 *   center?: { lat: number, lon: number }
 *   resultCount?: number
 *   queryComplexity?: number
 * }} RequestRecord
 */

/**
 * @typedef {{
 *   ip: string
 *   userId: number
 *   username: string
 *   bbox: { minLat: number, maxLat: number, minLon: number, maxLon: number }
 *   center: { lat: number, lon: number }
 *   endpoint: string
 *   timestamp: number
 * }} LocationHistoryEntry
 */

class SuspiciousRequestMonitor extends Logger {
  // Track requests per IP (60 minute window)
  #ipRequestCache = new NodeCache({ stdTTL: 60 * 60 })

  // Track requests per user (60 minute window)
  #userRequestCache = new NodeCache({ stdTTL: 60 * 60 })

  // Track location patterns (24 hour window)
  #locationPatternCache = new NodeCache({ stdTTL: 60 * 60 * 24 })

  // Track repeated location queries (1 hour window)
  #repeatedLocationCache = new NodeCache({ stdTTL: 60 * 60 })

  // Track geographical coverage (1 hour window)
  #geographicalCoverageCache = new NodeCache({ stdTTL: 60 * 60 })

  // Alert cache to prevent spam (15 minute cooldown)
  #alertCache = new NodeCache({ stdTTL: 15 * 60 })

  constructor() {
    super('suspicious-monitor')

    // Get known polling intervals from config (convert seconds to milliseconds)
    const pollingConfig = config.getSafe('api.polling', {})
    const knownPollingIntervals = Object.values(pollingConfig)
      .filter((val) => typeof val === 'number' && val > 0)
      .map((seconds) => seconds * 1000) // Convert to milliseconds

    this.config = {
      // Thresholds
      ipRequestThreshold: config.getSafe('api.monitoring.ipRequestThreshold', 500),
      userRequestThreshold: config.getSafe('api.monitoring.userRequestThreshold', 1000),
      geographicalCoverageThreshold: config.getSafe(
        'api.monitoring.geographicalCoverageThreshold',
        1000,
      ), // km²
      repeatedLocationThreshold: config.getSafe(
        'api.monitoring.repeatedLocationThreshold',
        10,
      ),
      repeatedLocationTimeWindow: config.getSafe(
        'api.monitoring.repeatedLocationTimeWindow',
        300000,
      ), // 5 minutes
      locationIntervalTolerance: config.getSafe(
        'api.monitoring.locationIntervalTolerance',
        30000,
      ), // 30 seconds
      fixedIntervalMinRequests: config.getSafe(
        'api.monitoring.fixedIntervalMinRequests',
        30,
      ), // Minimum number of requests before alerting (detect long sessions)
      fixedIntervalMinDuration: config.getSafe(
        'api.monitoring.fixedIntervalMinDuration',
        900000,
      ), // 15 minutes (minimum duration before alerting)
      userVolumeMinDuration: config.getSafe(
        'api.monitoring.userVolumeMinDuration',
        1800000,
      ), // 30 minutes (minimum duration for high volume user alerts)

      // Enabled checks
      enableIpTracking: config.getSafe('api.monitoring.enableIpTracking', true),
      enableUserTracking: config.getSafe('api.monitoring.enableUserTracking', true),
      enableLocationTracking: config.getSafe('api.monitoring.enableLocationTracking', true),
      enableGeographicalTracking: config.getSafe(
        'api.monitoring.enableGeographicalTracking',
        true,
      ),
      discordChannel: config.getSafe('api.monitoring.discordChannel', 'main'),
      monitoredOperationNames: config.getSafe('api.monitoring.monitoredOperationNames', []),

      // Known polling intervals (in milliseconds) - intervals that match these are considered normal
      knownPollingIntervals,
    }
  }

  /**
   * Check if an endpoint/operation should be monitored
   * @param {string} endpoint - GraphQL operation name (e.g., "Gyms", "PokemonIVs", "GymsRaids")
   * @returns {boolean}
   */
  shouldMonitorEndpoint(endpoint) {
    // If no filter configured, monitor all endpoints
    if (
      !this.config.monitoredOperationNames ||
      this.config.monitoredOperationNames.length === 0
    ) {
      return true
    }
    // If filter configured, only monitor operation names in the list
    return this.config.monitoredOperationNames.includes(endpoint)
  }

  /**
   * Extract IP address from request
   * @param {import('express').Request} req
   * @returns {string}
   */
  getIpAddress(req) {
    // When behind Cloudflare, CF-Connecting-IP is the most reliable header
    // It contains the original client IP address and cannot be spoofed
    return (
      req.headers['cf-connecting-ip'] ||
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      'unknown'
    )
  }

  /**
   * Calculate bounding box area in km²
   * @param {{ minLat: number, maxLat: number, minLon: number, maxLon: number }} bbox
   * @returns {number}
   */
  calculateBboxArea(bbox) {
    const R = 6371 // Earth radius in km
    
    // Handle cases where coordinates might wrap around (e.g., -180 to 180)
    let latDiff = Math.abs(bbox.maxLat - bbox.minLat)
    let lonDiff = Math.abs(bbox.maxLon - bbox.minLon)
    
    // If longitude difference is > 180, it wraps around the globe
    if (lonDiff > 180) {
      lonDiff = 360 - lonDiff
    }
    
    // Cap latitude difference at 180 (shouldn't happen but safety check)
    if (latDiff > 180) {
      latDiff = 180
    }
    
    const latDiffRad = latDiff * (Math.PI / 180)
    const lonDiffRad = lonDiff * (Math.PI / 180)
    const avgLat = ((bbox.maxLat + bbox.minLat) / 2) * (Math.PI / 180)

    const latDistance = R * latDiffRad
    const lonDistance = R * Math.cos(avgLat) * lonDiffRad

    return latDistance * lonDistance
  }

  /**
   * Calculate distance between two points in km (Haversine formula)
   * @param {{ lat: number, lon: number }} point1
   * @param {{ lat: number, lon: number }} point2
   * @returns {number}
   */
  calculateDistance(point1, point2) {
    const R = 6371 // Earth radius in km
    const dLat = (point2.lat - point1.lat) * (Math.PI / 180)
    const dLon = (point2.lon - point1.lon) * (Math.PI / 180)
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(point1.lat * (Math.PI / 180)) *
        Math.cos(point2.lat * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  /**
   * Normalize bounding box to a grid cell for pattern matching
   * @param {{ minLat: number, maxLat: number, minLon: number, maxLon: number }} bbox
   * @param {number} precision - Decimal places to round to
   * @returns {string}
   */
  normalizeBbox(bbox, precision = 3) {
    return `${bbox.minLat.toFixed(precision)},${bbox.maxLat.toFixed(precision)},${bbox.minLon.toFixed(precision)},${bbox.maxLon.toFixed(precision)}`
  }

  /**
   * Track and analyze a GraphQL request
   * @param {RequestRecord} record
   * @param {import('./state').EventManager} event
   * @returns {Promise<void>}
   */
  async trackRequest(record, event) {
    const { ip, userId, endpoint, bbox, center, category } = record

    // Check if this endpoint should be monitored
    if (!this.shouldMonitorEndpoint(endpoint)) {
      return
    }

    // 1. Check IP-based high volume requests
    if (this.config.enableIpTracking && ip !== 'unknown') {
      await this.#checkIpVolume(record, event)
    }

    // 2. Check user-based high volume requests
    if (this.config.enableUserTracking && userId) {
      await this.#checkUserVolume(record, event)
    }

    // 3. Check repeated location queries (only for authenticated users)
    if (this.config.enableLocationTracking && bbox && userId) {
      await this.#checkRepeatedLocation(record, event)
    }

    // 4. Check geographical coverage (only for authenticated users)
    if (this.config.enableGeographicalTracking && bbox && userId) {
      await this.#checkGeographicalCoverage(record, event)
    }

    // 5. Check fixed interval patterns (only for authenticated users)
    if (this.config.enableLocationTracking && center && userId) {
      await this.#checkFixedIntervalPattern(record, event)
    }
  }

  /**
   * Check for high volume requests from same IP
   * @private
   */
  async #checkIpVolume(record, event) {
    const { ip, userId, username, endpoint } = record
    const key = `ip:${ip}`

    const requests = this.#ipRequestCache.get(key) || []
    requests.push({
      timestamp: record.timestamp,
      endpoint,
      userId,
      username,
    })
    this.#ipRequestCache.set(key, requests)

    // Check threshold
    const recentRequests = requests.filter(
      (r) => record.timestamp - r.timestamp < 60 * 60 * 1000,
    )

    if (recentRequests.length >= this.config.ipRequestThreshold) {
      const alertKey = `ip-volume:${ip}`
      if (!this.#alertCache.has(alertKey)) {
        this.#alertCache.set(alertKey, true)

        // Collect unique users with usernames
        const userMap = new Map()
        recentRequests.forEach((r) => {
          if (r.userId && r.username) {
            if (!userMap.has(r.userId)) {
              userMap.set(r.userId, r.username)
            }
          }
        })
        const usersList = Array.from(userMap.entries()).map(
          ([userId, username]) => `${username} (ID: ${userId})`,
        )

        this.log.warn(
          `High volume detected from IP ${ip}:`,
          recentRequests.length,
          'requests in last hour',
        )

        await this.#sendAlert(event, {
          type: 'HIGH_VOLUME_IP',
          severity: 'warning',
          ip,
          endpoint: record.endpoint,
          requestCount: recentRequests.length,
          timeWindow: '1 hour',
          uniqueUsers: userMap.size,
          usersList,
          topEndpoints: this.#getTopEndpoints(recentRequests),
        })
      }
    }
  }

  /**
   * Check for high volume requests from same user
   * @private
   */
  async #checkUserVolume(record, event) {
    const { userId, username, endpoint, category } = record
    const key = `user:${userId}`

    const requests = this.#userRequestCache.get(key) || []
    requests.push({
      timestamp: record.timestamp,
      endpoint,
      category,
    })
    this.#userRequestCache.set(key, requests)

    const recentRequests = requests.filter(
      (r) => record.timestamp - r.timestamp < 60 * 60 * 1000,
    )

    if (recentRequests.length >= this.config.userRequestThreshold) {
      // Calculate total duration from first to last request
      const firstRequestTime = recentRequests[0].timestamp
      const lastRequestTime = recentRequests[recentRequests.length - 1].timestamp
      const totalDuration = lastRequestTime - firstRequestTime

      // Only alert if user has maintained high volume for minimum duration (long session)
      if (totalDuration >= this.config.userVolumeMinDuration) {
        const alertKey = `user-volume:${userId}`
        if (!this.#alertCache.has(alertKey)) {
          this.#alertCache.set(alertKey, true)

          this.log.warn(
            `High volume detected from user ${username} (${userId}):`,
            recentRequests.length,
            `requests over ${(totalDuration / 1000 / 60).toFixed(0)} minutes`,
          )

          await this.#sendAlert(event, {
            type: 'HIGH_VOLUME_USER',
            severity: 'warning',
            userId,
            username,
            endpoint: record.endpoint,
            requestCount: recentRequests.length,
            duration: totalDuration,
            timeWindow: '1 hour',
            topEndpoints: this.#getTopEndpoints(recentRequests),
            topCategories: this.#getTopCategories(recentRequests),
          })
        }
      }
    }
  }

  /**
   * Check for repeated queries to same location
   * @private
   */
  async #checkRepeatedLocation(record, event) {
    const { userId, username, ip, endpoint, bbox } = record
    const normalizedBbox = this.normalizeBbox(bbox)
    const key = `location:${normalizedBbox}:${userId || ip}`

    const history = this.#repeatedLocationCache.get(key) || []
    history.push({
      timestamp: record.timestamp,
      endpoint,
      bbox,
    })
    this.#repeatedLocationCache.set(key, history)

    // Check for repeated requests in time window
    const recentHistory = history.filter(
      (h) =>
        record.timestamp - h.timestamp < this.config.repeatedLocationTimeWindow,
    )

    if (recentHistory.length >= this.config.repeatedLocationThreshold) {
      const alertKey = `repeated-location:${key}`
      if (!this.#alertCache.has(alertKey)) {
        this.#alertCache.set(alertKey, true)

        this.log.warn(
          `Repeated location queries detected:`,
          `${userId ? `User ${username}` : `IP ${ip}`}`,
          `queried location ${recentHistory.length} times in ${this.config.repeatedLocationTimeWindow / 1000}s`,
        )

        await this.#sendAlert(event, {
          type: 'REPEATED_LOCATION',
          severity: 'medium',
          userId,
          username,
          ip,
          requestCount: recentHistory.length,
          timeWindow: `${this.config.repeatedLocationTimeWindow / 1000}s`,
          bbox,
          endpoint,
        })
      }
    }
  }

  /**
   * Check for high geographical coverage (scanning large areas)
   * @private
   */
  async #checkGeographicalCoverage(record, event) {
    const { userId, username, ip, bbox, endpoint } = record
    const key = `coverage:${userId || ip}`

    const coverageHistory = this.#geographicalCoverageCache.get(key) || {
      totalArea: 0,
      requests: [],
    }

    const area = this.calculateBboxArea(bbox)
    coverageHistory.totalArea += area
    coverageHistory.requests.push({
      timestamp: record.timestamp,
      bbox,
      area,
    })

    // Keep only last hour
    const oneHourAgo = record.timestamp - 60 * 60 * 1000
    coverageHistory.requests = coverageHistory.requests.filter(
      (r) => r.timestamp > oneHourAgo,
    )
    coverageHistory.totalArea = coverageHistory.requests.reduce(
      (sum, r) => sum + r.area,
      0,
    )

    this.#geographicalCoverageCache.set(key, coverageHistory)

    if (
      coverageHistory.totalArea >= this.config.geographicalCoverageThreshold
    ) {
      const alertKey = `coverage:${key}`
      if (!this.#alertCache.has(alertKey)) {
        this.#alertCache.set(alertKey, true)

        this.log.warn(
          `High geographical coverage detected:`,
          `${userId ? `User ${username}` : `IP ${ip}`}`,
          `queried ${coverageHistory.totalArea.toFixed(2)} km² in last hour`,
        )

        await this.#sendAlert(event, {
          type: 'HIGH_GEOGRAPHICAL_COVERAGE',
          severity: 'medium',
          userId,
          username,
          ip,
          endpoint,
          totalArea: coverageHistory.totalArea,
          requestCount: coverageHistory.requests.length,
          timeWindow: '1 hour',
        })
      }
    }
  }

  /**
   * Check for fixed interval patterns (automated scraping)
   * @private
   */
  async #checkFixedIntervalPattern(record, event) {
    const { userId, username, ip, center, endpoint } = record
    const key = `interval:${userId || ip}:${endpoint}`

    const locationHistory = this.#locationPatternCache.get(key) || []
    locationHistory.push({
      timestamp: record.timestamp,
      center,
      endpoint,
    })

    // Keep only last 24 hours
    const oneDayAgo = record.timestamp - 24 * 60 * 60 * 1000
    const recentHistory = locationHistory.filter((h) => h.timestamp > oneDayAgo)

    this.#locationPatternCache.set(key, recentHistory)

    // Check for fixed interval pattern - detect long static sessions (likely automation/scraping)
    // Need minimum requests to indicate a long session
    if (recentHistory.length >= this.config.fixedIntervalMinRequests) {
      const intervals = []
      for (let i = 1; i < recentHistory.length; i++) {
        intervals.push(
          recentHistory[i].timestamp - recentHistory[i - 1].timestamp,
        )
      }

      // Check if intervals are similar (within tolerance)
      const avgInterval =
        intervals.reduce((a, b) => a + b, 0) / intervals.length
      const variance =
        intervals.reduce(
          (sum, interval) => sum + Math.pow(interval - avgInterval, 2),
          0,
        ) / intervals.length
      const stdDev = Math.sqrt(variance)

      // If standard deviation is low, intervals are regular (suspicious)
      // Alert even if it matches known polling intervals (could be scraping with matching intervals)
      if (stdDev < this.config.locationIntervalTolerance && avgInterval > 0) {
        // Also check if same location is being queried repeatedly
        const sameLocation = recentHistory.every(
          (h) => this.calculateDistance(h.center, center) < 0.01, // Within 10 meters
        )

        if (sameLocation) {
          // Calculate total duration from first to last request
          const firstRequestTime = recentHistory[0].timestamp
          const lastRequestTime = recentHistory[recentHistory.length - 1].timestamp
          const totalDuration = lastRequestTime - firstRequestTime

          // Only alert if pattern has persisted for minimum duration (long static session)
          if (totalDuration >= this.config.fixedIntervalMinDuration) {
            const alertKey = `fixed-interval:${key}:${center.lat.toFixed(4)},${center.lon.toFixed(4)}`
            if (!this.#alertCache.has(alertKey)) {
              this.#alertCache.set(alertKey, true)

              this.log.warn(
                `Fixed interval pattern detected:`,
                `${userId ? `User ${username}` : `IP ${ip}`}`,
                `querying same location every ${(avgInterval / 1000).toFixed(0)}s for ${(totalDuration / 1000).toFixed(0)}s`,
              )

              await this.#sendAlert(event, {
                type: 'FIXED_INTERVAL_PATTERN',
                severity: 'high',
                userId,
                username,
                ip,
                interval: avgInterval,
                duration: totalDuration,
                requestCount: recentHistory.length,
                location: center,
                endpoint,
              })
            }
          }
        }
      }
    }
  }

  /**
   * Get top endpoints from requests
   * @private
   */
  #getTopEndpoints(requests) {
    const counts = {}
    requests.forEach((r) => {
      counts[r.endpoint] = (counts[r.endpoint] || 0) + 1
    })
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([endpoint, count]) => ({ endpoint, count }))
  }

  /**
   * Get top categories from requests
   * @private
   */
  #getTopCategories(requests) {
    const counts = {}
    requests.forEach((r) => {
      if (r.category) {
        counts[r.category] = (counts[r.category] || 0) + 1
      }
    })
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }))
  }

  /**
   * Send alert via chat log system
   * @private
   */
  async #sendAlert(event, alertData) {
    const severityColors = {
      low: 0x3498db, // Blue
      medium: 0xf39c12, // Orange
      high: 0xe74c3c, // Red
      warning: 0xf39c12, // Orange
    }

    const color = severityColors[alertData.severity] || 0x95a5a6

    let description = `**Type:** ${alertData.type}\n`
    description += `**Severity:** ${alertData.severity.toUpperCase()}\n`
    if (alertData.endpoint) {
      description += `**Operation:** ${alertData.endpoint}\n`
    }
    description += '\n'

    if (alertData.userId) {
      description += `**User:** ${alertData.username} (ID: ${alertData.userId})\n`
    }
    if (alertData.ip && alertData.ip !== 'unknown') {
      description += `**IP:** ${alertData.ip}\n`
    }
    if (alertData.requestCount) {
      description += `**Request Count:** ${alertData.requestCount}\n`
    }
    if (alertData.timeWindow) {
      description += `**Time Window:** ${alertData.timeWindow}\n`
    }
    if (alertData.totalArea) {
      description += `**Total Area:** ${alertData.totalArea.toFixed(2)} km²\n`
    }
    if (alertData.bbox) {
      description += `**BBox:** [${alertData.bbox.minLat.toFixed(4)}, ${alertData.bbox.maxLat.toFixed(4)}, ${alertData.bbox.minLon.toFixed(4)}, ${alertData.bbox.maxLon.toFixed(4)}]\n`
    }
    if (alertData.location) {
      description += `**Location:** [${alertData.location.lat.toFixed(4)}, ${alertData.location.lon.toFixed(4)}]\n`
    }
    if (alertData.interval) {
      description += `**Interval:** ${(alertData.interval / 1000).toFixed(0)}s\n`
    }
    if (alertData.duration) {
      description += `**Duration:** ${(alertData.duration / 1000).toFixed(0)}s\n`
    }
    if (alertData.message) {
      description += `\n**Details:** ${alertData.message}\n`
    }

    const fields = []
    if (alertData.topEndpoints) {
      fields.push({
        name: 'Top Endpoints',
        value:
          alertData.topEndpoints.map((e) => `${e.endpoint}: ${e.count}`).join('\n') || 'None',
        inline: true,
      })
    }
    if (alertData.topCategories) {
      fields.push({
        name: 'Top Categories',
        value:
          alertData.topCategories
            .map((c) => `${c.category}: ${c.count}`)
            .join('\n') || 'None',
        inline: true,
      })
    }
    if (alertData.uniqueUsers !== undefined) {
      const usersValue = alertData.usersList
        ? alertData.usersList.join('\n') || 'None'
        : String(alertData.uniqueUsers)
      fields.push({
        name: `Unique Users${alertData.usersList ? '' : `: ${alertData.uniqueUsers}`}`,
        value: usersValue,
        inline: false,
      })
    }

    await event.chatLog(this.config.discordChannel, {
      title: `⚠️ Suspicious Request Detected`,
      description,
      color,
      fields,
      timestamp: new Date().toISOString(),
    })
  }
}

module.exports = { SuspiciousRequestMonitor }

