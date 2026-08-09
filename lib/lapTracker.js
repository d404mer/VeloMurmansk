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

function getLastCompletedLap(raw) {
  const completed = (raw.laps || []).filter((lap) => lap.isOnLap && lap.totalTime);
  return completed.length ? completed[completed.length - 1] : null;
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
  };
}

function buildEvent(categoryId, raw, lap) {
  const at = new Date().toISOString();
  const place = lap.groupRacePosition ?? '';
  const splitTime = lap.totalTime || '';
  const isLeader = Number(place) === 1;
  return {
    id: `${categoryId}-${lapKey(raw.number, lap)}-${crypto.randomBytes(4).toString('hex')}`,
    place,
    number: raw.number ?? '',
    name: overlayName(raw.account),
    gap: isLeader ? splitTime : formatGap(lap.leaderDifference),
    lapNumber: lap.lapNumber ?? '',
    splitTime,
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

  function collectPlaqueEvents(categoryId, rawAthletes, isFirstPoll) {
    const seen = seenPlaques.get(categoryId);
    const plaqueEvents = [];

    for (const raw of rawAthletes || []) {
      for (const lap of raw.laps || []) {
        if (!lap.isOnLap || !lap.totalTime) continue;
        const key = lapKey(raw.number, lap);
        if (seen.has(key)) continue;
        seen.add(key);
        if (isFirstPoll) continue;
        plaqueEvents.push(buildEvent(categoryId, raw, lap));
      }
    }

    return plaqueEvents;
  }

  function updateLeaderCounter(categoryId, rawAthletes, totalLaps, isFirstPoll) {
    const leader = findLeader(rawAthletes);
    if (!leader) return false;

    const lap = getLastCompletedLap(leader);
    if (!lap) return false;

    const lapNum = Number(lap.lapNumber) || 0;
    const prevLeaderLap = lastLeaderLapNumber.get(categoryId) || 0;

    lapStates.set(categoryId, buildLapState(leader, lap, totalLaps));
    lastLeaderLapNumber.set(categoryId, lapNum);

    if (isFirstPoll || lapNum <= prevLeaderLap) {
      return false;
    }

    return true;
  }

  function processRawAthletes(categoryId, rawAthletes, totalLaps) {
    ensureCategory(categoryId);
    if (totalLaps != null) {
      setTotalLaps(categoryId, totalLaps);
    }
    const m = categoryTotalLaps.get(categoryId) || 0;
    const isFirstPoll = !initialized.has(categoryId);

    const plaqueEvents = collectPlaqueEvents(categoryId, rawAthletes, isFirstPoll);
    const counterUpdated = updateLeaderCounter(categoryId, rawAthletes, m, isFirstPoll);

    initialized.add(categoryId);

    for (const event of plaqueEvents) {
      pushEvent(categoryId, event);
    }

    return { plaqueEvents, counterUpdated };
  }

  function getRecentEvents(categoryId, limit = 10) {
    ensureCategory(categoryId);
    const list = events.get(categoryId);
    return list.slice(-limit);
  }

  function getLapState(categoryId) {
    ensureCategory(categoryId);
    return { ...lapStates.get(categoryId) };
  }

  function getAllLapStates() {
    const result = {};
    for (const [categoryId, state] of lapStates.entries()) {
      result[categoryId] = { ...state };
    }
    return result;
  }

  function setLapState(categoryId, state) {
    ensureCategory(categoryId);
    lapStates.set(categoryId, { ...state });
  }

  function simulateLeaderLap(categoryId, fields) {
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
    };
    lapStates.set(categoryId, state);
    lastLeaderLapNumber.set(categoryId, completedLap);

    const plaqueEvent = {
      id: `sim-leader-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      place: fields.place ?? '1',
      number: state.leaderNumber,
      name: state.leaderName,
      gap: splitTime || formatGap(fields.gap),
      lapNumber: completedLap,
      splitTime: state.splitTime,
      at: state.updatedAt,
      categoryId,
    };

    return {
      plaqueEvents: [pushEvent(categoryId, plaqueEvent)],
      counterUpdated: completedLap > prevCompleted,
    };
  }

  function addManualEvent(categoryId, fields) {
    const place = fields.place ?? '';
    const splitTime = fields.splitTime ?? '';
    const isLeader = Number(place) === 1;
    const event = {
      id: `manual-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      place,
      number: fields.number ?? '',
      name: String(fields.name || '').toUpperCase(),
      gap: isLeader ? splitTime || fields.gap || '' : formatGap(fields.gap),
      lapNumber: fields.lapNumber ?? '',
      splitTime,
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
  findLeader,
  getLastCompletedLap,
  formatLapLabel,
  clampCurrentLap,
};
