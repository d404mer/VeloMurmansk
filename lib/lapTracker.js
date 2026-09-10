const crypto = require('crypto');
const { formatGap } = require('./transform');

const MAX_EVENTS = 50;

function overlayName(account) {
  if (!account) return '';
  const first = account.firstName || '';
  const last = account.lastName || '';
  return `${first} ${last}`.trim().toUpperCase();
}

function athleteKey(raw) {
  if (raw?.id != null && String(raw.id).trim() !== '') {
    return String(raw.id).trim();
  }
  return raw?.number ?? '';
}

function lapKey(raw, lap) {
  return `${athleteKey(raw)}:${lap.lapNumber}:${lap.name || ''}:${lap.totalTime || ''}`;
}

function isRaceLap(lap) {
  return lap && lap.isOnLap && lap.totalTime && lap.isLoop !== false;
}

function visibleLaps(raw) {
  return (raw.laps || []).filter(isRaceLap);
}

function getLastCompletedLap(raw) {
  const completed = visibleLaps(raw);
  return completed.length ? completed[completed.length - 1] : null;
}

function getLastRaceLap(raw) {
  const completed = (raw.laps || []).filter(isRaceLap);
  return completed.length ? completed[completed.length - 1] : null;
}

function clampCurrentLap(completedLap, totalLaps) {
  const n = Number(completedLap) || 0;
  const m = Number(totalLaps) || 0;
  if (n <= 0) return 1;
  const next = n + 1;
  if (m > 0) return Math.min(next, m);
  return next;
}

function formatLapLabel(completedLap, totalLaps) {
  const n = Number(completedLap) || 0;
  const m = Number(totalLaps) || 0;
  if (n <= 0) return 'КРУГ 1';
  const current = clampCurrentLap(n, m);
  if (m > 0) return `КРУГ ${current}/${m}`;
  return `КРУГ ${current}`;
}

function emptyLapState(totalLaps = 0) {
  return {
    completedLap: 0,
    currentLap: 1,
    totalLaps: Number(totalLaps) || 0,
    lapLabel: formatLapLabel(0, totalLaps),
    leaderName: '',
    leaderNumber: '',
    splitTime: '',
    updatedAt: null,
    intermediateBoard: null,
  };
}

function findLeader(rawAthletes) {
  const ranked = (rawAthletes || []).filter(
    (a) => a.position != null && a.position !== ''
  );
  if (!ranked.length) return null;
  ranked.sort((a, b) => Number(a.position) - Number(b.position));
  return ranked[0];
}

function buildLapState(raw, lap, totalLaps) {
  const completedLap = Number(lap.lapNumber) || 0;
  const m = Number(totalLaps) || 0;
  return {
    completedLap,
    currentLap: clampCurrentLap(completedLap, m),
    totalLaps: m,
    lapLabel: formatLapLabel(completedLap, m),
    leaderName: overlayName(raw.account),
    leaderNumber: raw.number ?? '',
    splitTime: lap.totalTime || '',
    updatedAt: new Date().toISOString(),
    intermediateBoard: null,
  };
}

function isZeroGap(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length > 0 && /^0+$/.test(digits);
}

function formatFollowerGap(value) {
  if (value == null || String(value).trim() === '') return '+0:00';
  const formatted = formatGap(value);
  if (!formatted || isZeroGap(formatted)) return '+0:00';
  return formatted;
}

function resolvePlaqueGap({ totalTime, leaderDifference, place, gap: gapOverride }, mode = 'leader') {
  const splitTime = totalTime || '';
  if (mode === 'all') {
    return splitTime || '00:00';
  }
  const isLeader = Number(place) === 1;
  if (isLeader) {
    return splitTime || '00:00';
  }
  if (gapOverride != null && gapOverride !== '') {
    return formatFollowerGap(gapOverride);
  }
  if (leaderDifference != null && leaderDifference !== '') {
    return formatFollowerGap(leaderDifference);
  }
  return '+0:00';
}

/** Live graphics always use race-loop cutoffs only. */
function effectiveSplitsFilter() {
  return 'loop';
}

function buildEvent(categoryId, raw, lap, mode = 'leader') {
  const at = new Date().toISOString();
  const place = lap.groupRacePosition ?? '';
  const splitTime = lap.totalTime || '';
  const gap = resolvePlaqueGap(
    { totalTime: splitTime, leaderDifference: lap.leaderDifference, place },
    mode
  );
  return {
    id: `${categoryId}-${lapKey(raw, lap)}-${crypto.randomBytes(4).toString('hex')}`,
    type: 'add',
    place,
    number: raw.number ?? '',
    name: overlayName(raw.account),
    flag: raw.flag ?? '',
    gap,
    lapNumber: lap.lapNumber ?? '',
    splitTime,
    splitName: lap.name || '',
    isIntermediate: false,
    at,
    categoryId,
  };
}

function createLapTracker() {
  const initialized = new Set();
  const events = new Map();
  const seenPlaques = new Map();
  const lapStates = new Map();
  const lastLeaderLapNumber = new Map();
  const categoryTotalLaps = new Map();

  function ensureCategory(categoryId) {
    if (!events.has(categoryId)) {
      events.set(categoryId, []);
    }
    if (!seenPlaques.has(categoryId)) {
      seenPlaques.set(categoryId, new Set());
    }
    if (!lapStates.has(categoryId)) {
      lapStates.set(categoryId, emptyLapState(categoryTotalLaps.get(categoryId)));
    }
    if (!lastLeaderLapNumber.has(categoryId)) {
      lastLeaderLapNumber.set(categoryId, 0);
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

  function setTotalLaps(categoryId, totalLaps) {
    const m = Number(totalLaps) || 0;
    categoryTotalLaps.set(categoryId, m);
    ensureCategory(categoryId);
    const state = lapStates.get(categoryId);
    lapStates.set(categoryId, {
      ...state,
      totalLaps: m,
      currentLap: clampCurrentLap(state.completedLap, m),
      lapLabel: formatLapLabel(state.completedLap, m),
      intermediateBoard: null,
    });
  }

  function getTotalLaps(categoryId) {
    return categoryTotalLaps.get(categoryId) || 0;
  }

  function initCategory(categoryId) {
    ensureCategory(categoryId);
    initialized.delete(categoryId);
    lastLeaderLapNumber.set(categoryId, 0);
    seenPlaques.get(categoryId).clear();
    lapStates.set(categoryId, emptyLapState(categoryTotalLaps.get(categoryId)));
    events.set(categoryId, []);
  }

  /** Fire-once plaques for race loops (start/finish of lap). */
  function collectLoopPlaqueEvents(categoryId, rawAthletes, isFirstPoll, mode = 'leader') {
    const seen = seenPlaques.get(categoryId);
    const plaqueEvents = [];

    for (const raw of rawAthletes || []) {
      for (const lap of visibleLaps(raw)) {
        const key = lapKey(raw, lap);
        if (seen.has(key)) continue;
        seen.add(key);
        if (isFirstPoll) continue;
        plaqueEvents.push(buildEvent(categoryId, raw, lap, mode));
      }
    }

    return plaqueEvents;
  }

  function updateLeaderCounter(categoryId, rawAthletes, totalLaps, isFirstPoll) {
    const leader = findLeader(rawAthletes);
    if (!leader) return false;

    const lap = getLastRaceLap(leader);
    if (!lap) return false;

    const lapNum = Number(lap.raceLap || lap.lapNumber) || 0;
    const prevLeaderLap = lastLeaderLapNumber.get(categoryId) || 0;

    lapStates.set(categoryId, buildLapState(leader, { ...lap, lapNumber: lapNum }, totalLaps));
    lastLeaderLapNumber.set(categoryId, lapNum);

    if (isFirstPoll || lapNum <= prevLeaderLap) {
      return false;
    }

    return true;
  }

  function processRawAthletes(
    categoryId,
    rawAthletes,
    totalLaps,
    mode = 'leader',
    _splitsFilter = 'loop',
    _standings = null
  ) {
    ensureCategory(categoryId);
    if (totalLaps != null) {
      setTotalLaps(categoryId, totalLaps);
    }
    const m = categoryTotalLaps.get(categoryId) || 0;
    const isFirstPoll = !initialized.has(categoryId);

    const plaqueEvents = collectLoopPlaqueEvents(categoryId, rawAthletes, isFirstPoll, mode);
    const counterUpdated = updateLeaderCounter(categoryId, rawAthletes, m, isFirstPoll);

    const state = lapStates.get(categoryId);
    if (state && state.intermediateBoard != null) {
      lapStates.set(categoryId, { ...state, intermediateBoard: null });
    }

    initialized.add(categoryId);

    for (const event of plaqueEvents) {
      pushEvent(categoryId, event);
    }

    return {
      plaqueEvents,
      counterUpdated,
      intermediateBoard: null,
      effectiveSplitsFilter: 'loop',
    };
  }

  function getRecentEvents(categoryId, limit = 10) {
    ensureCategory(categoryId);
    const list = events.get(categoryId);
    return list.slice(-limit);
  }

  function getLapState(categoryId) {
    ensureCategory(categoryId);
    return { ...lapStates.get(categoryId), intermediateBoard: null };
  }

  function getAllLapStates() {
    const result = {};
    for (const [categoryId] of lapStates.entries()) {
      result[categoryId] = getLapState(categoryId);
    }
    return result;
  }

  function setLapState(categoryId, state) {
    ensureCategory(categoryId);
    lapStates.set(categoryId, { ...state, intermediateBoard: null });
  }

  function simulateLeaderLap(categoryId, fields, mode = 'leader') {
    ensureCategory(categoryId);
    const m = categoryTotalLaps.get(categoryId) || 0;
    const prevCompleted = lastLeaderLapNumber.get(categoryId) || 0;
    let completedLap = Number(fields.completedLap ?? fields.lapNumber ?? prevCompleted + 1);
    if (m > 0) completedLap = Math.min(completedLap, m);
    const splitTime = fields.splitTime ?? fields.time ?? fields.gap ?? '';
    const state = {
      completedLap,
      currentLap: clampCurrentLap(completedLap, m),
      totalLaps: m,
      lapLabel: formatLapLabel(completedLap, m),
      leaderName: String(fields.name || fields.leaderName || 'ТЕСТ ЛИДЕР').toUpperCase(),
      leaderNumber: fields.number ?? fields.leaderNumber ?? '',
      splitTime,
      updatedAt: new Date().toISOString(),
      intermediateBoard: null,
    };
    lastLeaderLapNumber.set(categoryId, completedLap);
    lapStates.set(categoryId, state);

    const place = fields.place ?? 1;
    const event = {
      id: `sim-leader-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      type: 'add',
      place,
      number: state.leaderNumber,
      name: state.leaderName,
      gap: resolvePlaqueGap(
        { totalTime: splitTime, leaderDifference: fields.gap, place, gap: fields.gap },
        mode
      ),
      lapNumber: completedLap,
      splitTime: state.splitTime,
      splitName: '',
      isIntermediate: false,
      at: state.updatedAt,
      categoryId,
    };
    pushEvent(categoryId, event);
    return { plaqueEvents: [event], counterUpdated: true, lapState: state };
  }

  function addManualEvent(categoryId, fields, mode = 'leader') {
    ensureCategory(categoryId);
    const splitTime = fields.splitTime ?? '';
    const place = fields.place ?? '';
    const event = {
      id: `manual-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      type: 'add',
      place,
      number: fields.number ?? '',
      name: String(fields.name || '').toUpperCase(),
      gap: resolvePlaqueGap(
        { totalTime: splitTime, leaderDifference: fields.gap, place, gap: fields.gap },
        mode
      ),
      lapNumber: fields.lapNumber ?? '',
      splitTime,
      splitName: fields.splitName || '',
      isIntermediate: false,
      at: new Date().toISOString(),
      categoryId,
      flag: fields.flag ?? '',
    };
    pushEvent(categoryId, event);
    return event;
  }

  function publishEvent(categoryId, event) {
    return pushEvent(categoryId, event);
  }

  return {
    initCategory,
    processRawAthletes,
    getRecentEvents,
    getLapState,
    getAllLapStates,
    setLapState,
    setTotalLaps,
    getTotalLaps,
    simulateLeaderLap,
    addManualEvent,
    publishEvent,
    findLeader,
    getLastCompletedLap,
    formatLapLabel,
  };
}

module.exports = {
  createLapTracker,
  overlayName,
  athleteKey,
  lapKey,
  findLeader,
  getLastCompletedLap,
  formatLapLabel,
  clampCurrentLap,
  resolvePlaqueGap,
  effectiveSplitsFilter,
};
