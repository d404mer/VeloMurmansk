const {
  parseTimeToMs,
  formatTimeFromMs,
  normalizeTime,
  parseRaceResultJson: parseJsonLoose,
} = require('./raceResultAdapter');

const DEFAULT_LOOP_IDS = ['main_loop', 'lap_loop', 'lap', 'laps', 'finish', 'fin', 'finishline'];
const DEFAULT_START_IDS = ['start', 'gun', 'depart', 'старт'];

function cleanString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function getField(obj, ...names) {
  if (!obj || typeof obj !== 'object') return undefined;
  const keys = Object.keys(obj);
  for (const name of names) {
    if (obj[name] != null && obj[name] !== '') return obj[name];
    const want = String(name).toLowerCase();
    const found = keys.find((k) => k.toLowerCase() === want);
    if (found != null && obj[found] != null && obj[found] !== '') return obj[found];
  }
  return undefined;
}

function bibOf(row) {
  const v = getField(row, 'bib', 'realbib', 'number', 'nb', 'participant');
  return v == null ? '' : String(v).trim();
}

function isTimingPassing(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  if (getField(row, 'firstname', 'firstName', 'lastname', 'lastName', 'name')) return false;
  if (Array.isArray(row.splits) || Array.isArray(row.laps)) return false;
  if (!bibOf(row)) return false;
  const time = getField(row, 'time', 'tod', 'passingTime', 'chipTime', 'netto');
  if (!time) return false;
  return (
    getField(row, 'split_id', 'splitId', 'split', 'point', 'location', 'mat', 'antenna') != null ||
    getField(row, 'split_name', 'splitName') != null ||
    getField(row, 'chip') != null ||
    String(getField(row, 'dataType') || '').toLowerCase() === 'timing'
  );
}

function extractTimingPassings(body) {
  if (Array.isArray(body) && body.length && isTimingPassing(body[0])) return body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const rows = body.passings || body.Passings || body.rows || body.Rows || body.log || body.data;
  if (Array.isArray(rows) && rows.length && isTimingPassing(rows[0])) return rows;
  if (isTimingPassing(body)) return [body];
  return null;
}

function isTimingPayload(body) {
  return !!extractTimingPassings(body);
}

function parseTimingTextLog(text) {
  const trimmed = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!trimmed || trimmed.startsWith('{') || trimmed.startsWith('[')) return null;
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (!lines.length) return null;
  const rows = [];
  for (const line of lines) {
    const parts = line.split(/[;\t]/).map((s) => s.trim());
    if (parts.length < 2) return null;
    const head = parts[0].toLowerCase();
    if (head === 'bib' || head === 'chip' || head === 'number') continue;
    if (!parts[1] || !parts[1].includes(':')) return null;
    rows.push({
      bib: parts[0],
      time: parts[1],
      split_id: parts[2] || 'MAIN_LOOP',
      split_name: parts[2] || '',
    });
  }
  return rows.length ? rows : null;
}

function loopIdList(config) {
  const extra = config?.raceResult?.loopSplitIds;
  const ids = Array.isArray(extra) ? extra.map((s) => String(s).toLowerCase()) : [];
  return new Set([...DEFAULT_LOOP_IDS, ...ids]);
}

function splitKey(passing) {
  return cleanString(
    getField(passing, 'split_id', 'splitId', 'split', 'point', 'location') || ''
  ).toLowerCase();
}

function splitNameOf(passing) {
  return cleanString(getField(passing, 'split_name', 'splitName', 'split_id', 'splitId', 'split') || '');
}

function isStartSplit(passing) {
  const id = splitKey(passing);
  return DEFAULT_START_IDS.includes(id);
}

function isLoopSplit(passing, config) {
  if (isStartSplit(passing)) return false;
  const id = splitKey(passing);
  const name = splitNameOf(passing).toLowerCase();
  if (loopIdList(config).has(id)) return true;
  if (/loop|lap|finish|финиш|круг/.test(`${id} ${name}`)) return true;
  if (/^split\d*$/.test(id)) return false;
  return !id || id === 'main';
}

function clockToRaceTime(startClock, clockTime) {
  const clockMs = parseTimeToMs(clockTime);
  if (clockMs == null) return normalizeTime(clockTime);
  const startMs = parseTimeToMs(startClock);
  if (startMs == null) return normalizeTime(clockTime);
  let delta = clockMs - startMs;
  if (delta < 0) delta += 24 * 60 * 60 * 1000;
  return formatTimeFromMs(delta);
}

function stubAthlete(bib) {
  return {
    id: String(bib),
    number: String(bib),
    position: '',
    resultTime: '',
    leaderDifference: '',
    isFinished: false,
    isOnStart: true,
    club: '',
    city: '',
    startTime: '',
    account: { firstName: '', lastName: '', age: '', city: '', club: '' },
    laps: [],
  };
}

function appendSplitLap(athlete, passing, raceTime, isLoop) {
  const name = splitNameOf(passing) || (isLoop ? `Круг ${(athlete.laps || []).filter((l) => l.isLoop !== false).length + 1}` : 'Отсечка');
  const existing = (athlete.laps || []).some(
    (lap) => lap.totalTime === raceTime && (lap.name === name || !name)
  );
  if (existing) return;
  const prev = (athlete.laps || []).slice(-1)[0];
  const prevMs = prev ? parseTimeToMs(prev.totalTime) : 0;
  const totalMs = parseTimeToMs(raceTime);
  let lapTime = raceTime;
  if (totalMs != null && prevMs != null) {
    const delta = totalMs - prevMs;
    lapTime = formatTimeFromMs(delta >= 0 ? delta : totalMs);
  }
  athlete.laps = athlete.laps || [];
  const raceLap = isLoop ? athlete.laps.filter((l) => l.isLoop !== false).length + 1 : 0;
  athlete.laps.push({
    lapNumber: raceLap || athlete.laps.length + 1,
    raceLap,
    name,
    isOnLap: true,
    isLoop,
    totalTime: raceTime,
    lapTime,
    groupRacePosition: '',
    leaderDifference: '',
  });
}

function raceLapsOf(athlete) {
  return (athlete.laps || []).filter((l) => l.isOnLap && l.totalTime && l.isLoop !== false);
}

function rankByLaps(athletes) {
  const withLaps = athletes.filter((a) => raceLapsOf(a).length);
  withLaps.sort((a, b) => {
    const n = raceLapsOf(b).length - raceLapsOf(a).length;
    if (n) return n;
    const aLast = raceLapsOf(a).slice(-1)[0];
    const bLast = raceLapsOf(b).slice(-1)[0];
    const aMs = parseTimeToMs(aLast?.totalTime) ?? Infinity;
    const bMs = parseTimeToMs(bLast?.totalTime) ?? Infinity;
    return aMs - bMs;
  });
  withLaps.forEach((a, i) => {
    a.position = i + 1;
    a.resultTime = raceLapsOf(a).slice(-1)[0].totalTime;
    a.isOnStart = false;
  });
  if (withLaps.length) {
    const leaderMs = parseTimeToMs(withLaps[0].resultTime);
    for (const a of withLaps) {
      if (a.position === 1) {
        a.leaderDifference = '';
        continue;
      }
      const ms = parseTimeToMs(a.resultTime);
      a.leaderDifference =
        leaderMs != null && ms != null ? `+${formatTimeFromMs(ms - leaderMs)}` : '';
    }
  }
  return athletes;
}

function mergeTimingPassings(existingAthletes, passings, config) {
  const byBib = new Map();
  for (const raw of existingAthletes || []) {
    const bib = String(raw.number || raw.id || '').trim();
    if (!bib) continue;
    byBib.set(bib, {
      ...raw,
      laps: Array.isArray(raw.laps)
        ? raw.laps.filter((l) => l && l.isOnLap && l.totalTime && l.isLoop !== false).map((l) => ({ ...l }))
        : [],
      account: { ...(raw.account || {}) },
    });
  }

  for (const passing of passings || []) {
    const bib = bibOf(passing);
    if (!bib) continue;
    const athlete = byBib.get(bib) || stubAthlete(bib);
    const clock = getField(passing, 'time', 'tod', 'passingTime', 'chipTime', 'netto');
    if (isStartSplit(passing) && !athlete.startTime) {
      athlete.startTime = cleanString(clock);
      byBib.set(bib, athlete);
      continue;
    }
    if (!isStartSplit(passing) && clock) {
      // Intermediate mats are ignored — only loop / finish cutoffs update results.
      if (!isLoopSplit(passing, config)) {
        byBib.set(bib, athlete);
        continue;
      }
      if (!athlete.startTime) athlete.startTime = cleanString(clock);
      const raceTime = clockToRaceTime(athlete.startTime, clock) || '00:00';
      appendSplitLap(athlete, passing, raceTime, true);
      athlete.isOnStart = false;
    }
    byBib.set(bib, athlete);
  }

  return rankByLaps([...byBib.values()]);
}

function loopLapsOnly(laps) {
  return (laps || [])
    .filter((l) => l && l.isOnLap && l.totalTime && l.isLoop !== false)
    .map((l) => ({ ...l }));
}

function mergePassingAthletes(existingAthletes, incomingAthletes) {
  const byBib = new Map();
  for (const raw of existingAthletes || []) {
    const bib = String(raw.number || raw.id || raw.bib || '').trim();
    if (!bib) continue;
    byBib.set(bib, {
      ...raw,
      laps: loopLapsOnly(raw.laps),
      account: { ...(raw.account || {}) },
    });
  }

  for (const inc of incomingAthletes || []) {
    const bib = String(inc.number || inc.id || inc.bib || '').trim();
    if (!bib) continue;
    const nextLoops = loopLapsOnly(inc.laps);
    const prev = byBib.get(bib);
    if (!prev) {
      byBib.set(bib, {
        ...inc,
        laps: nextLoops,
        account: { ...(inc.account || {}) },
      });
      continue;
    }
    byBib.set(bib, {
      ...prev,
      ...inc,
      account: { ...prev.account, ...inc.account },
      club: inc.club || prev.club,
      city: inc.city || prev.city,
      team: inc.team || prev.team,
      nationality: inc.nationality || prev.nationality,
      startTime: prev.startTime || inc.startTime,
      // CP-only packets have empty laps — keep previously completed loops.
      laps: nextLoops.length ? nextLoops : prev.laps,
      resultTime: nextLoops.length
        ? nextLoops[nextLoops.length - 1].totalTime || inc.resultTime || prev.resultTime
        : prev.resultTime,
      position: nextLoops.length ? inc.position || prev.position : prev.position,
    });
  }

  const list = [...byBib.values()];
  if (list.some((a) => raceLapsOf(a).length)) {
    return rankByLaps(list);
  }
  return list;
}

function parseTimingBody(body) {
  if (typeof body === 'string') {
    const json = parseJsonLoose(body);
    if (json != null) return extractTimingPassings(json);
    return parseTimingTextLog(body);
  }
  return extractTimingPassings(body);
}

module.exports = {
  isTimingPassing,
  isTimingPayload,
  extractTimingPassings,
  parseTimingTextLog,
  mergeTimingPassings,
  mergePassingAthletes,
  parseTimingBody,
};
