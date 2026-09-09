const CURRENT_RACE_CATEGORY_ID = 'current';
const CURRENT_RACE_CATEGORY = {
  id: CURRENT_RACE_CATEGORY_ID,
  name: 'Текущая гонка',
};

function ensureCurrentRaceCategory(config) {
  if (!config || typeof config !== 'object') return config;
  for (const event of config.events || []) {
    if (!Array.isArray(event.categories)) event.categories = [];
    const exists = event.categories.some((c) => c.id === CURRENT_RACE_CATEGORY_ID);
    if (!exists) {
      event.categories.unshift({ ...CURRENT_RACE_CATEGORY });
    }
  }
  return config;
}

function ingestFallbackCategoryId(event, activeCategoryId) {
  if (event?.categories?.some((c) => c.id === CURRENT_RACE_CATEGORY_ID)) {
    return CURRENT_RACE_CATEGORY_ID;
  }
  return activeCategoryId || '';
}

module.exports = {
  CURRENT_RACE_CATEGORY_ID,
  CURRENT_RACE_CATEGORY,
  ensureCurrentRaceCategory,
  ingestFallbackCategoryId,
};
