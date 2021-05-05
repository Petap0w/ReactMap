import getAllDevices from './queries/device'
import { getAllGyms, getAllRaids } from './queries/gym'
import * as pokestopIndex from './queries/pokestop'
import getAllPokemon from './queries/pokemon'
import getAllSpawnpoints from './queries/spawnpoint'
import getAllPortals from './queries/portal'
import getAllWeather from './queries/weather'
import getAllS2Cells from './queries/s2Cell'
import getAllSubmissionCells from './queries/submissionCells'

class Query {
  static getAllDevices() {
    return getAllDevices
  }

  static getAllGyms() {
    return getAllGyms
  }

  static getAllPokestops(filters, perms) {
    const permObj = {
      Lures: filters.lures && perms.lures,
      Quests: filters.quests && perms.quests,
      Invasions: filters.invasions && perms.invasions,
    }
    const allPerms = Object.values(permObj).every(val => val === false)
    let query = 'get'

    Object.keys(permObj).forEach(keyPerm => {
      if (permObj[keyPerm]) query += keyPerm
    })
    if (allPerms) query += 'Pokestops'

    return pokestopIndex[query]
  }

  static getAllPokemon() {
    return getAllPokemon
  }

  static getAllPortals() {
    return getAllPortals
  }

  static getAllRaids() {
    return getAllRaids
  }

  static getAllS2Cells() {
    return getAllS2Cells
  }

  static getAllSpawnpoints() {
    return getAllSpawnpoints
  }

  static getAllSubmissionCells() {
    return getAllSubmissionCells
  }

  static getAllWeather() {
    return getAllWeather
  }
}

export default Query
