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

function getCurrentRaceCategory(event) {
  return event?.categories?.find((c) => c.id === CURRENT_RACE_CATEGORY_ID) || null;
}

function isCategoryNameAuto(cat) {
  if (!cat) return false;
  if (cat.id === CURRENT_RACE_CATEGORY_ID) return cat.nameAuto !== false;
  return cat.nameAuto === true;
}

function findEventCategory(config, categoryId) {
  const events = config?.events || [];
  const event = events.find((e) => e.id === config.activeEventId) || events[0];
  if (!event) return { event: null, cat: null };
  if (!Array.isArray(event.categories)) event.categories = [];
  return {
    event,
    cat: event.categories.find((c) => c.id === categoryId) || null,
  };
}

function categoryPublicView(cat) {
  if (!cat) return null;
  return {
    id: cat.id,
    name: cat.name,
    nameAuto: isCategoryNameAuto(cat),
    ingestName: cat.ingestName || '',
  };
}

function applyIngestDisplayName(config, categoryId, displayName) {
  const name = String(displayName || '').trim();
  if (!name) return null;
  const id = String(categoryId || '').trim() || CURRENT_RACE_CATEGORY_ID;
  let { event, cat } = findEventCategory(config, id);
  if (!event) return null;
  if (!cat && id === CURRENT_RACE_CATEGORY_ID) {
    cat = { ...CURRENT_RACE_CATEGORY, nameAuto: true };
    event.categories.unshift(cat);
  }
  if (!cat) return null;
  cat.ingestName = name;
  if (!isCategoryNameAuto(cat)) return cat;
  cat.name = name;
  return cat;
}

function setCategoryDisplayName(config, categoryId, name, options = {}) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    throw new Error('Название категории не может быть пустым');
  }
  const id = String(categoryId || '').trim();
  if (!id) {
    throw new Error('Не указан ID категории');
  }
  let { event, cat } = findEventCategory(config, id);
  if (!event) {
    throw new Error('В конфиге нет событий');
  }
  if (!cat && id === CURRENT_RACE_CATEGORY_ID) {
    cat = { ...CURRENT_RACE_CATEGORY };
    event.categories.unshift(cat);
  }
  if (!cat) {
    throw new Error(`Категория не найдена: ${id}`);
  }
  cat.name = trimmed;
  if (options.unlock !== false) {
    cat.nameAuto = false;
  }
  return cat;
}

function setCategoryNameAuto(config, categoryId, auto) {
  const id = String(categoryId || '').trim();
  if (!id) {
    throw new Error('Не указан ID категории');
  }
  let { event, cat } = findEventCategory(config, id);
  if (!event) {
    throw new Error('В конфиге нет событий');
  }
  if (!cat && id === CURRENT_RACE_CATEGORY_ID) {
    cat = { ...CURRENT_RACE_CATEGORY };
    event.categories.unshift(cat);
  }
  if (!cat) {
    throw new Error(`Категория не найдена: ${id}`);
  }
  cat.nameAuto = !!auto;
  if (cat.nameAuto && cat.ingestName) {
    cat.name = cat.ingestName;
  }
  return cat;
}

module.exports = {
  CURRENT_RACE_CATEGORY_ID,
  CURRENT_RACE_CATEGORY,
  ensureCurrentRaceCategory,
  ingestFallbackCategoryId,
  getCurrentRaceCategory,
  isCategoryNameAuto,
  categoryPublicView,
  applyIngestDisplayName,
  setCategoryDisplayName,
  setCategoryNameAuto,
};
