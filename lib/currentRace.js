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

/** Slug for auto-created race tabs in the dropdown. */
function slugCategoryId(name) {
  const raw = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е');
  const map = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'h',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'sch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
  };
  let out = '';
  for (const ch of raw) {
    if (map[ch] != null) out += map[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else if (/\s|_|\+|-/g.test(ch)) out += '_';
  }
  out = out.replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (!out) out = 'race';
  if (out === CURRENT_RACE_CATEGORY_ID) out = 'race_current';
  return out.slice(0, 48);
}

function namesMatch(a, b) {
  const x = String(a || '')
    .trim()
    .toLowerCase();
  const y = String(b || '')
    .trim()
    .toLowerCase();
  return Boolean(x && y && x === y);
}

function findCategoryByRaceName(event, raceName) {
  const name = String(raceName || '').trim();
  if (!name || !event?.categories) return null;
  return (
    event.categories.find(
      (c) =>
        namesMatch(c.ingestName, name) ||
        namesMatch(c.name, name) ||
        (c.id && namesMatch(c.id, name))
    ) || null
  );
}

/**
 * Resolve dropdown tab for an ingest: known id → name match → create new category.
 * Mutates config.events[].categories when creating.
 */
function ensureCategoryForContest(config, { knownCategoryId = '', contestName = '' } = {}) {
  const events = config?.events || [];
  const event = events.find((e) => e.id === config.activeEventId) || events[0];
  if (!event) return { event: null, category: null, created: false };
  if (!Array.isArray(event.categories)) event.categories = [];

  const known = String(knownCategoryId || '').trim();
  if (known) {
    const found = event.categories.find((c) => c.id === known || c.categoryGuid === known);
    if (found) {
      if (contestName && isCategoryNameAuto(found)) {
        found.ingestName = String(contestName).trim();
        found.name = String(contestName).trim();
      }
      return { event, category: found, created: false };
    }
  }

  const name = String(contestName || '').trim();
  if (name) {
    const byName = findCategoryByRaceName(event, name);
    if (byName) {
      byName.ingestName = name;
      if (isCategoryNameAuto(byName)) byName.name = name;
      return { event, category: byName, created: false };
    }

    let id = slugCategoryId(name);
    const used = new Set(event.categories.map((c) => c.id));
    if (used.has(id)) {
      let n = 2;
      while (used.has(`${id}_${n}`)) n += 1;
      id = `${id}_${n}`;
    }
    const category = {
      id,
      name,
      nameAuto: true,
      ingestName: name,
    };
    event.categories.push(category);
    return { event, category, created: true };
  }

  const fallbackId = ingestFallbackCategoryId(event, config.activeCategoryId);
  const fallback =
    event.categories.find((c) => c.id === fallbackId) || event.categories[0] || null;
  return { event, category: fallback, created: false };
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
  slugCategoryId,
  findCategoryByRaceName,
  ensureCategoryForContest,
};
