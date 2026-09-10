/**
 * Internal race standings: overall place + per-split leaders/gaps.
 * Overwrites athlete.position / leaderDifference and lap.groupRacePosition.
 */

function cleanString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function parseTimeToMs(value) {
  const s = cleanString(value).replace(',', '.');
  if (!s) return null;
  const [hms, frac] = s.split('.');
  const parts = hms.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return null;
  let seconds = 0;
  if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
  else if (parts.length === 1) seconds = parts[0];
  else return null;
  const ms = frac ? Number(`0.${frac}`) * 1000 : 0;
  if (!Number.isFinite(ms)) return seconds * 1000;
  return seconds * 1000 + ms;
}

function formatTimeFromMs(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

function formatPlusGap(deltaMs) {
  if (deltaMs == null || !Number.isFinite(deltaMs)) return '+0:00';
  if (deltaMs <= 0) return '+0:00';
  return `+${formatTimeFromMs(deltaMs)}`;
}

function overlayName(account) {
  if (!account) return '';
  const first = account.firstName || '';
  const last = account.lastName || '';
  return `${first} ${last}`.trim().toUpperCase();
}

function isRaceLoop(lap) {
  return lap && lap.isOnLap && lap.totalTime && lap.isLoop !== false;
}

function isIntermediate(lap) {
  return lap && lap.isOnLap && lap.totalTime && lap.isLoop === false;
}

function raceLoopsOf(athlete) {
  return (athlete?.laps || []).filter(isRaceLoop);
}

function completedLapsOf(athlete) {
  return (athlete?.laps || []).filter((lap) => lap && lap.isOnLap && lap.totalTime);
}

function findLapByName(athlete, name) {
  const target = cleanString(name).toLowerCase();
  if (!target) return null;
  const laps = completedLapsOf(athlete);
  for (let i = laps.length - 1; i >= 0; i -= 1) {
    if (cleanString(laps[i].name).toLowerCase() === target) return laps[i];
  }
  return null;
}

function collectSplitNames(athletes) {
  const order = [];
  const seen = new Set();
  for (const a of athletes || []) {
    for (const lap of completedLapsOf(a)) {
      const name = cleanString(lap.name);
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      order.push(name);
    }
  }
  return order;
}

function buildSplitTable(athletes, splitName) {
  const rows = [];
  for (const a of athletes || []) {
    const lap = findLapByName(a, splitName);
    if (!lap) continue;
    rows.push({
      athlete: a,
      lap,
      ms: parseTimeToMs(lap.totalTime),
    });
  }
  rows.sort((x, y) => (x.ms ?? Infinity) - (y.ms ?? Infinity));
  if (!rows.length) return null;

  const leaderMs = rows[0].ms;
  const leader = rows[0].athlete;
  const tableRows = rows.map((row, index) => {
    const place = index + 1;
    const gap =
      place === 1 || leaderMs == null || row.ms == null
        ? ''
        : formatPlusGap(row.ms - leaderMs);
    row.lap.groupRacePosition = place;
    row.lap.leaderDifference = place === 1 ? '' : gap;
    return {
      place,
      number: row.athlete.number ?? '',
      name: overlayName(row.athlete.account),
      time: row.lap.totalTime || '',
      gap: place === 1 ? row.lap.totalTime || '' : gap,
    };
  });

  return {
    splitName,
    leaderNumber: leader.number ?? '',
    leaderName: overlayName(leader.account),
    leaderTime: rows[0].lap.totalTime || '',
    rows: tableRows,
  };
}

/**
 * Overall ranking:
 * 1) more race loops wins;
 * 2) else fewer last-loop time;
 * 3) if no loops — more intermediates, then time on the deepest shared intermediate.
 */
function rankOverall(athletes) {
  const list = (athletes || []).filter((a) => completedLapsOf(a).length > 0);
  list.sort((a, b) => {
    const aLoops = raceLoopsOf(a);
    const bLoops = raceLoopsOf(b);
    if (bLoops.length !== aLoops.length) return bLoops.length - aLoops.length;
    if (aLoops.length) {
      const aMs = parseTimeToMs(aLoops[aLoops.length - 1].totalTime) ?? Infinity;
      const bMs = parseTimeToMs(bLoops[bLoops.length - 1].totalTime) ?? Infinity;
      return aMs - bMs;
    }
    const aInter = completedLapsOf(a).filter(isIntermediate);
    const bInter = completedLapsOf(b).filter(isIntermediate);
    if (bInter.length !== aInter.length) return bInter.length - aInter.length;
    const aLast = aInter[aInter.length - 1] || completedLapsOf(a).slice(-1)[0];
    const bLast = bInter[bInter.length - 1] || completedLapsOf(b).slice(-1)[0];
    const aMs = parseTimeToMs(aLast?.totalTime) ?? Infinity;
    const bMs = parseTimeToMs(bLast?.totalTime) ?? Infinity;
    return aMs - bMs;
  });

  const leaderMs = list.length
    ? parseTimeToMs(
        (() => {
          const loops = raceLoopsOf(list[0]);
          if (loops.length) return loops[loops.length - 1].totalTime;
          const inter = completedLapsOf(list[0]).filter(isIntermediate);
          return (inter[inter.length - 1] || completedLapsOf(list[0]).slice(-1)[0])?.totalTime;
        })()
      )
    : null;

  const overall = list.map((a, index) => {
    const place = index + 1;
    const loops = raceLoopsOf(a);
    const resultLap = loops.length
      ? loops[loops.length - 1]
      : completedLapsOf(a).filter(isIntermediate).slice(-1)[0] || completedLapsOf(a).slice(-1)[0];
    const resultTime = resultLap?.totalTime || a.resultTime || '';
    const ms = parseTimeToMs(resultTime);
    const gap = place === 1 ? '' : formatPlusGap(leaderMs != null && ms != null ? ms - leaderMs : null);
    a.position = place;
    a.resultTime = resultTime;
    a.leaderDifference = gap;
    a.isOnStart = false;
    return {
      place,
      number: a.number ?? '',
      name: overlayName(a.account),
      time: resultTime,
      gap: place === 1 ? resultTime : gap,
      loops: loops.length,
    };
  });

  return overall;
}

/**
 * Recompute standings in-place on athletes. Returns standings snapshot.
 */
function recomputeStandings(athletes) {
  const list = Array.isArray(athletes) ? athletes : [];
  const bySplit = {};
  for (const splitName of collectSplitNames(list)) {
    const table = buildSplitTable(list, splitName);
    if (table) bySplit[splitName] = table;
  }

  const overall = rankOverall(list);

  for (const a of list) {
    if (!completedLapsOf(a).length) {
      a.position = '';
      a.leaderDifference = '';
    }
  }

  const leader = overall[0] || null;
  return {
    updatedAt: new Date().toISOString(),
    overall,
    bySplit,
    leader: leader
      ? {
          number: leader.number,
          name: leader.name,
          time: leader.time,
          place: 1,
        }
      : null,
  };
}

function standingsBoardForSplit(standings, splitName, { completedLap = 0, mode = 'leader' } = {}) {
  if (!standings?.bySplit || !splitName) return null;
  const key = Object.keys(standings.bySplit).find(
    (k) => k.toLowerCase() === String(splitName).toLowerCase()
  );
  const table = key ? standings.bySplit[key] : null;
  if (!table) return null;
  return {
    splitName: table.splitName,
    splitTime: table.leaderTime || '',
    lapNumber: completedLap,
    rows: (table.rows || []).map((row) => ({
      place: row.place,
      number: row.number,
      name: row.name,
      gap: mode === 'all' ? row.time : row.gap,
      splitTime: row.time,
      lapNumber: completedLap,
      splitName: table.splitName,
      isIntermediate: true,
    })),
    updatedAt: standings.updatedAt || new Date().toISOString(),
  };
}

module.exports = {
  recomputeStandings,
  standingsBoardForSplit,
  parseTimeToMs,
  formatTimeFromMs,
  findLapByName,
  collectSplitNames,
};
