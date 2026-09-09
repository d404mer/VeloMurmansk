const { parseLimetimeUrl } = require('./parseLimetimeUrl');
const {
  CURRENT_RACE_CATEGORY_ID,
  CURRENT_RACE_CATEGORY,
  ensureCurrentRaceCategory,
  getCurrentRaceCategory,
} = require('./currentRace');

const DEFAULT_CATEGORIES = [
  { id: 'women', name: 'Женщины' },
  { id: 'men', name: 'Мужчины' },
  { id: 'junior_women', name: 'Юниорки 17-18' },
  { id: 'junior_men', name: 'Юниоры 17-18' },
];

const DEFAULT_SERVER = { host: '0.0.0.0', port: 3000 };

function getActiveEvent(config) {
  return config.events.find((e) => e.id === config.activeEventId) || config.events[0];
}

function normalizeDataSource(value) {
  return value === 'http' ? 'http' : 'limetime';
}

function applyIngestSettings(config, payload) {
  if (!payload || typeof payload !== 'object') return config;

  if (payload.dataSource != null) {
    const next = String(payload.dataSource).trim();
    if (next !== 'limetime' && next !== 'http') {
      throw new Error('dataSource должен быть "limetime" или "http"');
    }
    config.dataSource = next;
  }

  const debug = payload.ingestDebug ?? payload.ingest?.debug;
  if (debug != null) {
    if (typeof debug !== 'boolean') {
      throw new Error('ingestDebug должен быть boolean');
    }
    if (!config.ingest) config.ingest = {};
    config.ingest.debug = debug;
  }

  if (payload.server != null) {
    if (typeof payload.server !== 'object' || Array.isArray(payload.server)) {
      throw new Error('server должен быть объектом');
    }
    if (!config.server) config.server = {};
    if (payload.server.host != null) {
      const host = String(payload.server.host).trim();
      if (!host) throw new Error('server.host не может быть пустым');
      config.server.host = host;
    }
    if (payload.server.port != null && payload.server.port !== '') {
      const port = Number(payload.server.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Порт должен быть целым числом от 1 до 65535');
      }
      config.server.port = port;
    }
  }

  return config;
}

function buildCategoryUrl(baseUrl, raceGuid, category) {
  if (!raceGuid || !category.stageGuid || !category.categoryGuid) {
    return '';
  }
  const base = baseUrl.replace(/\/$/, '');
  if (category.categoryGuid.startsWith('REPLACE_')) {
    return '';
  }
  return `${base}/${raceGuid}/${category.stageGuid}/${category.categoryGuid}`;
}

function mergeCategoriesWithDefaults(eventCategories) {
  return DEFAULT_CATEGORIES.map((defaults) => {
    const existing = eventCategories?.find((c) => c.id === defaults.id);
    return {
      id: existing?.id ?? defaults.id,
      name: existing?.name ?? defaults.name,
      totalLaps: existing?.totalLaps ?? '',
      stageGuid: existing?.stageGuid ?? '',
      categoryGuid: existing?.categoryGuid ?? '',
    };
  });
}

function buildSetupView(config) {
  const event = getActiveEvent(config);
  const baseUrl = config.limetime?.baseUrl || '';
  const categories = mergeCategoriesWithDefaults(event?.categories);

  return {
    eventId: event?.id || '',
    eventName: event?.name || '',
    raceGuid: event?.raceGuid || '',
    baseUrl,
    dataSource: normalizeDataSource(config.dataSource),
    ingestDebug: config.ingest?.debug === true,
    server: {
      host: config.server?.host || DEFAULT_SERVER.host,
      port: Number(config.server?.port) || DEFAULT_SERVER.port,
    },
    currentRaceName: getCurrentRaceCategory(event)?.name || CURRENT_RACE_CATEGORY.name,
    currentRaceNameAuto: getCurrentRaceCategory(event)
      ? getCurrentRaceCategory(event).nameAuto !== false
      : true,
    currentRaceIngestName: getCurrentRaceCategory(event)?.ingestName || '',
    categories: categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      url: buildCategoryUrl(baseUrl, event?.raceGuid, cat),
      stageGuid: cat.stageGuid,
      categoryGuid: cat.categoryGuid,
    })),
  };
}

function validateSetupPayload(payload) {
  const { eventId, eventName, categories } = payload;
  const dataSource = normalizeDataSource(payload.dataSource);

  if (!eventId?.trim()) {
    throw new Error('ID события не может быть пустым');
  }

  if (!eventName?.trim()) {
    throw new Error('Название события не может быть пустым');
  }

  if (!Array.isArray(categories) || categories.length !== 4) {
    throw new Error('Нужно указать ровно 4 категории');
  }

  const ids = new Set();
  const parsedCategories = [];
  let raceGuid = null;

  for (const cat of categories) {
    const label = cat.name || cat.id || 'категория';

    if (!cat.id?.trim()) {
      throw new Error(`Пустой ID у категории «${label}»`);
    }

    if (ids.has(cat.id)) {
      throw new Error(`Дублирующийся ID категории: ${cat.id}`);
    }
    ids.add(cat.id);

    if (!cat.name?.trim()) {
      throw new Error(`Пустое название у категории «${cat.id}»`);
    }

    if (!cat.url?.trim()) {
      if (dataSource === 'http') {
        parsedCategories.push({
          id: cat.id.trim(),
          name: cat.name.trim(),
          stageGuid: '',
          categoryGuid: '',
        });
        continue;
      }
      throw new Error(`Не указана ссылка для «${cat.name}»`);
    }

    let parsed;
    try {
      parsed = parseLimetimeUrl(cat.url);
    } catch (err) {
      throw new Error(`${cat.name}: ${err.message}`);
    }

    if (!raceGuid) {
      raceGuid = parsed.raceGuid;
    } else if (raceGuid !== parsed.raceGuid) {
      throw new Error(
        'Все ссылки должны относиться к одному событию (raceGuid не совпадает)'
      );
    }

    parsedCategories.push({
      id: cat.id.trim(),
      name: cat.name.trim(),
      stageGuid: parsed.stageGuid,
      categoryGuid: parsed.categoryGuid,
    });
  }

  return { eventId: eventId.trim(), eventName: eventName.trim(), raceGuid, parsedCategories };
}

function applySetup(config, payload) {
  applyIngestSettings(config, payload);
  const { eventId, eventName, raceGuid, parsedCategories } = validateSetupPayload(payload);

  const activeEvent = getActiveEvent(config);
  if (!activeEvent) {
    throw new Error('В конфиге нет событий');
  }

  const previousById = new Map((activeEvent.categories || []).map((cat) => [cat.id, cat]));

  const oldEventId = activeEvent.id;
  activeEvent.id = eventId;
  activeEvent.name = eventName;
  if (raceGuid) {
    activeEvent.raceGuid = raceGuid;
  }
  activeEvent.categories = parsedCategories.map((cat) => {
    const prev = previousById.get(cat.id);
    const next = {
      id: cat.id,
      name: cat.name,
      stageGuid: cat.stageGuid || prev?.stageGuid || '',
      categoryGuid: cat.categoryGuid || prev?.categoryGuid || '',
    };
    if (prev?.totalLaps != null && prev.totalLaps !== '') {
      next.totalLaps = prev.totalLaps;
    }
    return next;
  });

  const currentPrev = previousById.get(CURRENT_RACE_CATEGORY_ID);
  const currentRaceName = String(payload.currentRaceName || currentPrev?.name || CURRENT_RACE_CATEGORY.name).trim();
  if (!currentRaceName) {
    throw new Error('Название текущей гонки не может быть пустым');
  }
  const nameAuto =
    payload.currentRaceNameAuto != null
      ? payload.currentRaceNameAuto !== false
      : currentPrev
        ? currentPrev.nameAuto !== false
        : true;
  const currentCat = {
    ...(currentPrev || CURRENT_RACE_CATEGORY),
    id: CURRENT_RACE_CATEGORY_ID,
    name: nameAuto && currentPrev?.ingestName ? currentPrev.ingestName : currentRaceName,
    nameAuto,
    ingestName: currentPrev?.ingestName || '',
  };
  const existingCurrentIdx = activeEvent.categories.findIndex((c) => c.id === CURRENT_RACE_CATEGORY_ID);
  if (existingCurrentIdx >= 0) {
    activeEvent.categories[existingCurrentIdx] = {
      ...activeEvent.categories[existingCurrentIdx],
      ...currentCat,
    };
  } else {
    activeEvent.categories.unshift(currentCat);
  }

  ensureCurrentRaceCategory(config);

  if (config.activeEventId === oldEventId) {
    config.activeEventId = eventId;
  }

  if (
    !config.activeCategoryId ||
    ![CURRENT_RACE_CATEGORY_ID, ...parsedCategories.map((c) => c.id)].includes(config.activeCategoryId)
  ) {
    config.activeCategoryId = CURRENT_RACE_CATEGORY_ID;
  }

  return config;
}

module.exports = {
  DEFAULT_CATEGORIES,
  DEFAULT_SERVER,
  normalizeDataSource,
  applyIngestSettings,
  buildSetupView,
  applySetup,
  parseLimetimeUrl,
};
