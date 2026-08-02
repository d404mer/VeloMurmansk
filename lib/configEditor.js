const { parseLimetimeUrl } = require('./parseLimetimeUrl');

const DEFAULT_CATEGORIES = [
  { id: 'women', name: 'Женщины' },
  { id: 'men', name: 'Мужчины' },
  { id: 'junior_women', name: 'Юниорки 17-18' },
  { id: 'junior_men', name: 'Юниоры 17-18' },
];

function getActiveEvent(config) {
  return config.events.find((e) => e.id === config.activeEventId) || config.events[0];
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
  const { eventId, eventName, raceGuid, parsedCategories } = validateSetupPayload(payload);

  const activeEvent = getActiveEvent(config);
  if (!activeEvent) {
    throw new Error('В конфиге нет событий');
  }

  const oldEventId = activeEvent.id;
  activeEvent.id = eventId;
  activeEvent.name = eventName;
  activeEvent.raceGuid = raceGuid;
  activeEvent.categories = parsedCategories;

  if (config.activeEventId === oldEventId) {
    config.activeEventId = eventId;
  }

  if (!config.activeCategoryId || !parsedCategories.some((c) => c.id === config.activeCategoryId)) {
    config.activeCategoryId = parsedCategories[0].id;
  }

  return config;
}

module.exports = {
  DEFAULT_CATEGORIES,
  buildSetupView,
  applySetup,
  parseLimetimeUrl,
};
