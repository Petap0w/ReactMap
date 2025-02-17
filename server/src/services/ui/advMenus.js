// @ts-check
const { Event } = require('../initialization')

const CATEGORIES = /** @type {const} */ ({
  gyms: ['teams', 'eggs', 'raids', 'pokemon'],
  pokestops: [
    'lures',
    'items',
    'quest_reward_12',
    'invasions',
    'pokemon',
    'rocket_pokemon',
    'showcase',
    'quest_reward_4',
    'quest_reward_9',
    'quest_reward_3',
    'quest_reward_1',
    'general',
  ],
  pokemon: ['pokemon'],
  nests: ['pokemon'],
})

const BASE_RARITY = /** @type {const} */ ([
  'common',
  'uncommon',
  'rare',
  'ultraRare',
  'regional',
  'ultraBeast',
  'legendary',
  'mythical',
  'never',
])

function buildMenus() {
  const menuFilters = {}
  const returnedItems = {}

  const rarityTiers = new Set(
    Object.values(Event.masterfile.pokemon).map((val) => val.rarity),
  )
  const historicalTiers = new Set(
    Object.values(Event.masterfile.pokemon).map((val) => val.historic),
  )

  const pokemonFilters = {
    generations: [
      ...new Set(
        Object.values(Event.masterfile.pokemon).map(
          (val) => `generation_${val.genId}`,
        ),
      ),
    ].filter((val) => val !== undefined),
    types: Object.keys(Event.masterfile.types)
      .map((key) => `poke_type_${key}`)
      .filter((val) => val !== 'poke_type_0'),
    rarity: BASE_RARITY.filter((tier) => rarityTiers.has(tier)),
    historicRarity: BASE_RARITY.filter((tier) => historicalTiers.has(tier)),
    forms: ['normalForms', 'altForms', 'Alola', 'Galarian'],
    others: ['reverse', 'selected', 'unselected', 'onlyAvailable'],
  }

  Object.entries(pokemonFilters).forEach(([key, items]) => {
    menuFilters[key] = Object.fromEntries(items.map((item) => [item, false]))
  })

  Object.entries(CATEGORIES).forEach(([key, items]) => {
    returnedItems[key] = {
      categories: items,
      filters: {
        ...menuFilters,
        others: {
          ...menuFilters.others,
          onlyAvailable: true,
        },
        categories: Object.fromEntries(items.map((item) => [item, false])),
      },
    }
  })
  return returnedItems
}

module.exports = buildMenus
