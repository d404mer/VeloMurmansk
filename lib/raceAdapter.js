class RaceAdapterError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'RaceAdapterError';
    this.status = status;
  }
}

function normalizeAthlete(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const next = { ...raw };
  if (next.id != null && String(next.id).trim() !== '') {
    next.id = String(next.id);
  }
  return next;
}

function resolveEvent(config, raceId) {
  const events = config.events || [];
  if (raceId == null || String(raceId).trim() === '') {
    return events.find((e) => e.id === config.activeEventId) || events[0] || null;
  }
  const id = String(raceId).trim();
  const found = events.find((e) => e.id === id || e.raceGuid === id);
  if (!found) {
    throw new RaceAdapterError(422, `Unknown raceId: ${id}`);
  }
  return found;
}

function resolveCategory(event, categoryId, fallbackCategoryId) {
  const cats = event?.categories || [];
  const requested =
    categoryId != null && String(categoryId).trim() !== ''
      ? String(categoryId).trim()
      : fallbackCategoryId;
  if (!requested) {
    throw new RaceAdapterError(422, 'categoryId is required');
  }
  const found = cats.find((c) => c.id === requested || c.categoryGuid === requested);
  if (!found) {
    throw new RaceAdapterError(422, `Unknown categoryId: ${requested}`);
  }
  return found;
}

function parseRacePayload(body, query, config) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new RaceAdapterError(400, 'Request body must be a JSON object');
  }
  if (body.isSuccess !== true) {
    throw new RaceAdapterError(422, 'isSuccess must be true');
  }
  if (!Array.isArray(body.data)) {
    throw new RaceAdapterError(400, 'data must be an array');
  }

  const raceId = body.raceId ?? query?.raceId;
  const categoryId = body.categoryId ?? query?.categoryId;
  const event = resolveEvent(config, raceId);
  if (!event) {
    throw new RaceAdapterError(422, 'Event not found in config');
  }
  const category = resolveCategory(event, categoryId, config.activeCategoryId);
  const athletes = body.data.map(normalizeAthlete);

  return {
    event,
    category,
    categoryId: category.id,
    raceId: event.id,
    athletes,
    count: athletes.length,
  };
}

module.exports = {
  RaceAdapterError,
  normalizeAthlete,
  parseRacePayload,
};
