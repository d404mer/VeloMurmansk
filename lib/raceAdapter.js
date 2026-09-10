const {
  adaptRaceResult,
  extractWiclaxNamedPassings,
  inferCategoryId,
  isRaceResultPayload,
  mapRaceResultAthlete,
  parseRaceResultJson,
} = require('./raceResultAdapter');
const { ingestFallbackCategoryId } = require('./currentRace');
const { extractTimingPassings, parseTimingTextLog } = require('./wiclaxTiming');

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
  const fallback = events.find((e) => e.id === config.activeEventId) || events[0] || null;
  if (raceId == null || String(raceId).trim() === '') {
    return fallback;
  }
  const id = String(raceId).trim();
  return events.find((e) => e.id === id || e.raceGuid === id) || fallback;
}

function resolveCategory(event, categoryId, fallbackCategoryId) {
  const cats = event?.categories || [];
  const requested =
    categoryId != null && String(categoryId).trim() !== ''
      ? String(categoryId).trim()
      : '';
  const found = requested
    ? cats.find((c) => c.id === requested || c.categoryGuid === requested)
    : null;
  if (found) return found;
  const fallback = fallbackCategoryId
    ? cats.find((c) => c.id === fallbackCategoryId || c.categoryGuid === fallbackCategoryId)
    : null;
  if (fallback) return fallback;
  if (cats[0]) return cats[0];
  throw new RaceAdapterError(422, 'categoryId is required');
}

function knownCategoryId(event, categoryId) {
  if (categoryId == null || String(categoryId).trim() === '') return '';
  const id = String(categoryId).trim();
  const found = event?.categories?.find((c) => c.id === id || c.categoryGuid === id);
  return found ? found.id : '';
}

function cleanContestName(...values) {
  for (const value of values) {
    const s = value == null ? '' : String(value).trim();
    if (s) return s;
  }
  return '';
}

function parseRacePayload(body, query, config) {
  let payload = body;
  if (typeof payload === 'string') {
    payload = parseTimingTextLog(payload) || parseRaceResultJson(payload);
  }
  if (payload == null || (typeof payload !== 'object' && !Array.isArray(payload))) {
    throw new RaceAdapterError(400, 'Request body must be a JSON object');
  }

  const timingPassings = extractTimingPassings(payload);
  if (timingPassings) {
    const event = resolveEvent(config, payload.raceId ?? query?.raceId);
    if (!event) {
      throw new RaceAdapterError(422, 'Event not found in config');
    }
    const contestName = cleanContestName(payload.race, payload.eventName, query?.race);
    const category = resolveCategory(
      event,
      knownCategoryId(event, query?.categoryId) || knownCategoryId(event, payload.categoryId),
      ingestFallbackCategoryId(event, config.activeCategoryId)
    );
    return {
      event,
      category,
      categoryId: category.id,
      raceId: event.id,
      athletes: [],
      passings: timingPassings,
      mergePassings: true,
      count: timingPassings.length,
      contestName,
      source: 'wiclax-timing',
    };
  }

  const namedPassings = extractWiclaxNamedPassings(payload);
  if (namedPassings) {
    const event = resolveEvent(config, payload.raceId ?? payload.eventId ?? query?.raceId);
    if (!event) {
      throw new RaceAdapterError(422, 'Event not found in config');
    }
    const contestName = cleanContestName(
      payload.race,
      payload.eventName,
      namedPassings[0]?.race,
      namedPassings[0]?.category
    );
    const inferred = inferCategoryId(
      { race: contestName, ...payload },
      namedPassings,
      config
    );
    const categoryId =
      knownCategoryId(event, query?.categoryId) ||
      knownCategoryId(event, payload.categoryId) ||
      knownCategoryId(event, inferred);
    const category = resolveCategory(
      event,
      categoryId,
      ingestFallbackCategoryId(event, config.activeCategoryId)
    );
    return {
      event,
      category,
      categoryId: category.id,
      raceId: event.id,
      athletes: namedPassings.map((row) => normalizeAthlete(mapRaceResultAthlete(row, row))),
      count: namedPassings.length,
      contestName,
      mergeAthletes: true,
      source: 'wiclax-passing',
      /** Hint for server: may create/switch tab by contest name when not explicitly known. */
      resolveByContest: !knownCategoryId(event, query?.categoryId) && !knownCategoryId(event, payload.categoryId),
    };
  }

  if (isRaceResultPayload(payload)) {
    const adapted = adaptRaceResult(payload, config);
    const raceId = payload.raceId ?? payload.eventId ?? query?.raceId;
    const event = resolveEvent(config, raceId);
    if (!event) {
      throw new RaceAdapterError(422, 'Event not found in config');
    }
    const categoryId =
      knownCategoryId(event, query?.categoryId) ||
      knownCategoryId(event, payload.categoryId) ||
      knownCategoryId(event, adapted.categoryId);
    const category = resolveCategory(
      event,
      categoryId,
      ingestFallbackCategoryId(event, config.activeCategoryId)
    );
    return {
      event,
      category,
      categoryId: category.id,
      raceId: event.id,
      athletes: adapted.athletes.map(normalizeAthlete),
      count: adapted.count,
      contestName: adapted.contestName || '',
      source: 'raceresult',
      resolveByContest:
        !knownCategoryId(event, query?.categoryId) &&
        !knownCategoryId(event, payload.categoryId) &&
        !knownCategoryId(event, adapted.categoryId),
    };
  }

  if (Array.isArray(payload)) {
    throw new RaceAdapterError(400, 'Request body must be a JSON object');
  }

  if (payload.isSuccess !== true) {
    throw new RaceAdapterError(422, 'isSuccess must be true');
  }
  if (!Array.isArray(payload.data)) {
    throw new RaceAdapterError(400, 'data must be an array');
  }

  const raceId = payload.raceId ?? query?.raceId;
  const event = resolveEvent(config, raceId);
  if (!event) {
    throw new RaceAdapterError(422, 'Event not found in config');
  }
  const contestName = cleanContestName(payload.eventName, payload.contestName, payload.race);
  const category = resolveCategory(
    event,
    knownCategoryId(event, payload.categoryId) || knownCategoryId(event, query?.categoryId),
    ingestFallbackCategoryId(event, config.activeCategoryId)
  );
  const athletes = payload.data.map(normalizeAthlete);

  return {
    event,
    category,
    categoryId: category.id,
    raceId: event.id,
    athletes,
    count: athletes.length,
    contestName,
    source: 'native',
    resolveByContest:
      !knownCategoryId(event, payload.categoryId) && !knownCategoryId(event, query?.categoryId),
  };
}

module.exports = {
  RaceAdapterError,
  normalizeAthlete,
  parseRacePayload,
};
