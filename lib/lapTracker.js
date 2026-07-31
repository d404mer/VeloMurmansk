const crypto = require('crypto');
const { formatGap } = require('./transform');

const MAX_EVENTS = 50;

function overlayName(account) {
  if (!account) return '';
  const first = account.firstName || '';
  const last = account.lastName || '';
  return `${first} ${last}`.trim().toUpperCase();
}

function lapKey(number, lap) {
  return `${number}:${lap.lapNumber}:${lap.totalTime}`;
}

function buildEvent(categoryId, raw, lap) {
  const at = new Date().toISOString();
  return {
    id: `${categoryId}-${lapKey(raw.number, lap)}-${crypto.randomBytes(4).toString('hex')}`,
    place: lap.groupRacePosition ?? '',
    number: raw.number ?? '',
    name: overlayName(raw.account),
    gap: formatGap(lap.leaderDifference),
    lapNumber: lap.lapNumber ?? '',
    at,
    categoryId,
  };
}

function createLapTracker() {
  const seenLaps = new Map();
  const initialized = new Set();
  const events = new Map();

  function ensureCategory(categoryId) {
    if (!seenLaps.has(categoryId)) {
      seenLaps.set(categoryId, new Set());
    }
    if (!events.has(categoryId)) {
      events.set(categoryId, []);
    }
  }

  function pushEvent(categoryId, event) {
    ensureCategory(categoryId);
    const list = events.get(categoryId);
    list.push(event);
    while (list.length > MAX_EVENTS) {
      list.shift();
    }
    return event;
  }

  function initCategory(categoryId) {
    ensureCategory(categoryId);
    seenLaps.get(categoryId).clear();
    initialized.delete(categoryId);
  }

  function processRawAthletes(categoryId, rawAthletes) {
    ensureCategory(categoryId);
    const seen = seenLaps.get(categoryId);
    const isFirstPoll = !initialized.has(categoryId);
    const newEvents = [];

    for (const raw of rawAthletes || []) {
      for (const lap of raw.laps || []) {
        if (!lap.isOnLap || !lap.totalTime) continue;
        const key = lapKey(raw.number, lap);
        if (seen.has(key)) continue;
        seen.add(key);
        if (isFirstPoll) continue;
        newEvents.push(buildEvent(categoryId, raw, lap));
      }
    }

    initialized.add(categoryId);

    for (const event of newEvents) {
      pushEvent(categoryId, event);
    }

    return newEvents;
  }

  function getRecentEvents(categoryId, limit = 10) {
    ensureCategory(categoryId);
    const list = events.get(categoryId);
    return list.slice(-limit);
  }

  function addManualEvent(categoryId, fields) {
    const event = {
      id: `manual-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      place: fields.place ?? '',
      number: fields.number ?? '',
      name: String(fields.name || '').toUpperCase(),
      gap: formatGap(fields.gap),
      lapNumber: fields.lapNumber ?? '',
      at: new Date().toISOString(),
      categoryId,
    };
    return pushEvent(categoryId, event);
  }

  function publishEvent(categoryId, event) {
    return pushEvent(categoryId, { ...event, categoryId });
  }

  return {
    initCategory,
    processRawAthletes,
    getRecentEvents,
    addManualEvent,
    publishEvent,
  };
}

module.exports = {
  createLapTracker,
  overlayName,
};
