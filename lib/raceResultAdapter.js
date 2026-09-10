/**
 * RaceResult JSON (экспорт / passing) → элементы data для POST /api/race.
 *
 * Конверт экспорта:
 *   { race, starters, ranked, results: [{ rank, name, club, time, race, catrank }, ...] }
 * Passing:
 *   { dataType: "passing", bib, firstname, lastname, splits: [...], ... }
 */

function cleanString(value) {
  if (value == null) return '';
  const s = String(value).trim();
  return s === '-' || s === '—' ? '' : s;
}

function toPosition(value) {
  const s = cleanString(value);
  if (s === '') return '';
  const n = Number(s);
  return Number.isFinite(n) ? n : s;
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

function normalizeTime(value) {
  const s = cleanString(value);
  if (!s) return '';
  return s.split(/[.,]/)[0];
}

function normalizeGap(value) {
  const s = cleanString(value);
  if (!s) return '';
  if (s.startsWith('+') || s.startsWith('-')) return s;
  return `+${s}`;
}

function splitPersonName(name, firstname, lastname) {
  const first = cleanString(firstname);
  const last = cleanString(lastname);
  if (first || last) return { firstName: first, lastName: last };

  const raw = cleanString(name);
  if (!raw) return { firstName: '', lastName: '' };
  if (raw.includes(',')) {
    const [ln, ...rest] = raw.split(',');
    return { lastName: cleanString(ln), firstName: rest.join(',').trim() };
  }
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { lastName: parts[0], firstName: '' };
  return { lastName: parts[0], firstName: parts.slice(1).join(' ') };
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

function isRaceResultRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  const dataType = String(getField(row, 'dataType') || '').toLowerCase();
  if (dataType === 'passing' || dataType === 'result') return true;
  if (getField(row, 'bib', 'realbib', 'nb') != null) return true;
  if (getField(row, 'firstname', 'lastname', 'firstName', 'lastName') != null) return true;
  if (getField(row, 'rank') != null && getField(row, 'name') != null) return true;
  if (getField(row, 'catrank') != null && getField(row, 'name') != null) return true;
  if (Array.isArray(getField(row, 'splits'))) return true;
  return false;
}

function resultRowsFrom(body) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return [];
  const rows = body.rows ?? body.Rows;
  if (Array.isArray(rows)) return rows;
  const direct =
    getField(body, 'results') ||
    getField(body, 'Results') ||
    getField(body, 'participants') ||
    getField(body, 'Participants');
  if (Array.isArray(direct)) return direct;
  if (Array.isArray(body.data) && body.data.length && isRaceResultRow(body.data[0])) {
    return body.data;
  }
  if (isRaceResultRow(body)) return [body];
  return [];
}

function envelopeDataType(body) {
  return String(getField(body, 'dataType') || '')
    .toLowerCase()
    .replace(/[\s_-]/g, '');
}

function isRaceResultPayload(body) {
  if (body == null) return false;
  if (Array.isArray(body)) return body.length > 0 && isRaceResultRow(body[0]);
  if (typeof body !== 'object') return false;
  if (body.isSuccess === true && Array.isArray(body.data) && body.data[0] && !isRaceResultRow(body.data[0])) {
    return false;
  }
  const dt = envelopeDataType(body);
  if (['startlist', 'passing', 'result', 'results', 'livelist'].includes(dt)) return true;
  if (Array.isArray(body.rows) || Array.isArray(body.Rows)) return true;
  if (resultRowsFrom(body).length) return true;
  if (getField(body, 'starters', 'ranked') != null && Array.isArray(getField(body, 'results'))) return true;
  return false;
}

function extractResultRows(body) {
  return resultRowsFrom(body);
}

function isRaceLoopLap(lap) {
  return lap && lap.isOnLap && lap.totalTime && lap.isLoop !== false;
}

function onlyRaceLoopLaps(laps) {
  return (laps || []).filter(isRaceLoopLap);
}

function buildLapsFromSplits(splits, fallbackRank) {
  const laps = [];
  let prevMs = 0;
  let index = 0;
  for (const split of splits || []) {
    if (!split || typeof split !== 'object') continue;
    const name = cleanString(split.name || split.split || '');
    // Intermediate CPs are ignored — only race-loop / finish names.
    if (!isRaceLoopName(name)) continue;
    const totalTime = normalizeTime(split.time || split.totalTime || split.netto || '');
    const totalMs = parseTimeToMs(split.time || split.totalTime || split.netto || '');
    if (!totalTime) continue;
    index += 1;
    let lapTime = cleanString(split.lapTime || split.split || '');
    if (!lapTime && totalMs != null) {
      const delta = totalMs - prevMs;
      lapTime = formatTimeFromMs(delta >= 0 ? delta : totalMs);
    }
    if (totalMs != null) prevMs = totalMs;
    const place = toPosition(split.rank ?? split.groupRacePosition ?? fallbackRank);
    const loopName = name || `Круг ${index}`;
    laps.push({
      lapNumber: Number(split.lapNumber) || index,
      name: loopName,
      isOnLap: true,
      isLoop: true,
      totalTime,
      lapTime: normalizeTime(lapTime) || totalTime,
      groupRacePosition: place === '' ? '' : place,
      leaderDifference: normalizeGap(split.gap || split.leaderDifference || ''),
    });
  }
  return laps;
}

function isCheckpointName(name) {
  const n = cleanString(name).toLowerCase().replace(/\s+/g, '');
  if (!n) return false;
  if (/finish|финиш/.test(n)) return false;
  return /(?:\d+)?cp$|кп\d*|\d+кп/.test(n);
}

function isRaceLoopName(name) {
  const n = cleanString(name).toLowerCase();
  if (!n) return false;
  if (isCheckpointName(n)) return false;
  return /finish|финиш|loop|lap|круг/.test(n);
}

function isFinishPassing(raw) {
  const split = cleanString(getField(raw, 'split')).toLowerCase();
  return /finish|финиш/.test(split);
}

function isNamedWiclaxPassing(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  const dt = String(getField(row, 'dataType') || '').toLowerCase();
  if (dt !== 'passing') return false;
  return getField(row, 'bib', 'realbib', 'nb') != null;
}

function extractWiclaxNamedPassings(body) {
  if (Array.isArray(body) && body.length && body.every(isNamedWiclaxPassing)) return body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (envelopeDataType(body) === 'passing' && isNamedWiclaxPassing(body) && !Array.isArray(body.rows) && !Array.isArray(body.Rows)) {
    return [body];
  }
  const rows = body.rows || body.Rows;
  if (envelopeDataType(body) === 'passing' && Array.isArray(rows) && rows.length && rows.every(isNamedWiclaxPassing)) {
    return rows;
  }
  return null;
}

function buildLapsFromLapData(lapData, fallbackRank) {
  const laps = [];
  let prevMs = 0;
  (lapData || []).forEach((lap, i) => {
    if (!lap || typeof lap !== 'object') return;
    const totalTime = normalizeTime(lap.raceTime || lap.time || '');
    const totalMs = parseTimeToMs(lap.raceTime || lap.time || '');
    if (!totalTime) return;
    let lapTime = normalizeTime(lap.time || '');
    if (totalMs != null && prevMs != null) {
      const delta = totalMs - prevMs;
      if (delta >= 0) lapTime = formatTimeFromMs(delta) || lapTime;
    }
    if (totalMs != null) prevMs = totalMs;
    const num = Number(lap.num) || i + 1;
    laps.push({
      lapNumber: num,
      raceLap: num,
      name: `Круг ${num}`,
      isOnLap: true,
      isLoop: true,
      totalTime,
      lapTime: lapTime || totalTime,
      groupRacePosition: toPosition(fallbackRank) || '',
      leaderDifference: '',
    });
  });
  return laps;
}

function buildLapsFromWiclaxPassing(raw, fallbackRank) {
  const split = cleanString(getField(raw, 'split'));
  const finish = isFinishPassing(raw);
  const lapData = Array.isArray(getField(raw, 'lapData')) ? getField(raw, 'lapData') : [];
  // Only Finish / loop cutoffs. Intermediate CP packets keep athlete identity but no laps.
  if (!finish && !isRaceLoopName(split)) {
    return [];
  }
  if (lapData.length) {
    return buildLapsFromLapData(lapData, fallbackRank);
  }
  return buildLapsFromSingle(
    split || 'Finish',
    getField(raw, 'time', 'chiptime'),
    fallbackRank,
    getField(raw, 'gap')
  ).map((lap) => ({ ...lap, isLoop: true }));
}

function buildLapsFromSingle(splitName, time, rank, gap) {
  const totalTime = normalizeTime(time);
  if (!totalTime) return [];
  const place = toPosition(rank);
  return [
    {
      lapNumber: 1,
      name: cleanString(splitName) || 'Круг 1',
      isOnLap: true,
      isLoop: isRaceLoopName(splitName) || !isCheckpointName(splitName),
      totalTime,
      lapTime: totalTime,
      groupRacePosition: place === '' ? '' : place,
      leaderDifference: normalizeGap(gap),
    },
  ];
}

function fillGapsFromLeader(athletes) {
  const ranked = athletes.filter((a) => a.position !== '' && a.resultTime);
  if (!ranked.length) return athletes;
  ranked.sort((a, b) => Number(a.position) - Number(b.position));
  const leaderMs = parseTimeToMs(ranked[0].resultTime);
  if (leaderMs == null) return athletes;
  for (const a of athletes) {
    if (a.leaderDifference || !a.resultTime) continue;
    if (Number(a.position) === Number(ranked[0].position)) {
      a.leaderDifference = '';
      continue;
    }
    const ms = parseTimeToMs(a.resultTime);
    if (ms == null) continue;
    a.leaderDifference = `+${formatTimeFromMs(ms - leaderMs)}`;
  }
  return athletes;
}

function listConfigCategories(config) {
  const events = config?.events || [];
  const event = events.find((e) => e.id === config.activeEventId) || events[0];
  return event?.categories || [];
}

function matchMappedCategory(text, config) {
  const map = config?.raceResult?.categoryMap;
  if (!map || typeof map !== 'object') return '';
  const key = cleanString(text);
  if (!key) return '';
  if (map[key]) return String(map[key]).trim();
  const lower = key.toLowerCase();
  for (const [from, to] of Object.entries(map)) {
    if (String(from).toLowerCase() === lower) return String(to).trim();
  }
  return '';
}

function inferCategoryId(body, rows, config) {
  const cats = listConfigCategories(config);
  const ids = new Set(cats.map((c) => c.id));
  const hintStrings = [body.race, rows[0]?.race, rows[0]?.category, rows[0]?.contest]
    .map(cleanString)
    .filter((s) => s.length >= 4);

  for (const hint of hintStrings) {
    const mapped = matchMappedCategory(hint, config);
    if (mapped && ids.has(mapped)) return mapped;
  }

  const blob = [...hintStrings, cleanString(rows[0]?.sex)].join(' ').toLowerCase();

  for (const hint of hintStrings) {
    const h = hint.toLowerCase();
    for (const cat of cats) {
      const name = cleanString(cat.name).toLowerCase();
      if (name && (name.includes(h) || h.includes(name))) return cat.id;
    }
  }

  const female = /(^|\s)(f|w|ж)(\s|$)|жен|девуш|girl|women|female/.test(blob);
  const junior = /15|16|юн.?ор|junior/.test(blob);
  const youth = /13|14/.test(blob);
  if (female && junior && ids.has('junior_women')) return 'junior_women';
  if (female && (youth || !junior) && ids.has('women')) return 'women';
  if (!female && junior && ids.has('junior_men')) return 'junior_men';
  if (!female && youth && ids.has('men')) return 'men';
  return '';
}

function mapRaceResultAthlete(raw, envelope) {
  const envelopeType = envelopeDataType(envelope);
  const isStartList = envelopeType === 'startlist';
  const number = cleanString(getField(raw, 'bib', 'realbib', 'number', 'nb') ?? '');
  const resultTime = isStartList
    ? ''
    : normalizeTime(getField(raw, 'time', 'chiptime', 'netto', 'resultTime') ?? '');
  const subject = cleanString(getField(raw, 'СубьектРФ', 'СубъектРФ', 'subjectRf', 'region') ?? '');
  const teamName = cleanString(getField(raw, 'team') ?? '');
  const nationality = cleanString(getField(raw, 'nationality') ?? '');
  const club = cleanString(getField(raw, 'club') ?? '') || teamName || subject || nationality;
  const { firstName, lastName } = splitPersonName(
    getField(raw, 'name'),
    getField(raw, 'firstname', 'firstName'),
    getField(raw, 'lastname', 'lastName')
  );
  const age = cleanString(getField(raw, 'year', 'age', 'birthyear') ?? '');
  const city = cleanString(getField(raw, 'city') ?? '') || teamName || subject || club;
  const status = cleanString(getField(raw, 'status', 'finishedstatus') || '').toUpperCase();
  const dns = raw.DNS === true || raw.dns === true || status === 'DNS';

  const splits = Array.isArray(getField(raw, 'splits')) ? getField(raw, 'splits') : [];
  const position = isStartList
    ? ''
    : toPosition(getField(raw, 'rank', 'catrank', 'rankbycat', 'position') ?? '');
  const namedPassing = isNamedWiclaxPassing(raw) || envelopeType === 'passing';
  const laps =
    isStartList || dns
      ? []
      : namedPassing
        ? buildLapsFromWiclaxPassing(raw, position)
        : splits.length
          ? buildLapsFromSplits(splits, position)
          : buildLapsFromSingle(getField(raw, 'split'), getField(raw, 'time', 'chiptime'), position, getField(raw, 'gap'));

  const loopLaps = onlyRaceLoopLaps(laps);
  const lastLoop = loopLaps.length ? loopLaps[loopLaps.length - 1] : null;
  const isFinished =
    !isStartList &&
    !dns &&
    (raw.finished === true ||
      raw.isFinished === true ||
      status === 'FIN' ||
      status === 'FINISHED' ||
      isFinishPassing(raw));
  // Intermediate times do not count as result until a race loop exists.
  const mappedResultTime = lastLoop?.totalTime || (isFinished ? resultTime : '') || '';
  const isOnStart = isStartList ? !dns : !dns && !mappedResultTime && loopLaps.length === 0;

  const mapped = {
    id: number || cleanString(raw.id),
    number,
    position: loopLaps.length ? position : '',
    resultTime: mappedResultTime,
    leaderDifference: isStartList
      ? ''
      : normalizeGap(raw.gap ?? raw.leaderDifference ?? lastLoop?.leaderDifference ?? ''),
    isFinished,
    isOnStart,
    club,
    city,
    firstname: firstName,
    lastname: lastName,
    team: teamName || club,
    nationality,
    year: age,
    bib: number,
    account: {
      firstName,
      lastName,
      age,
      city,
      club,
    },
    laps: loopLaps,
  };

  const extras = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    if (mapped[key] !== undefined) continue;
    extras[key] = value;
  }
  return { ...extras, ...mapped };
}

function adaptRaceResult(body, config) {
  const source = body && typeof body === 'object' ? body : {};
  const rows = extractResultRows(source);
  const athletes = fillGapsFromLeader(rows.map((row) => mapRaceResultAthlete(row, source)));
  return {
    categoryId: inferCategoryId(source, rows, config),
    contestName: cleanString(source.eventName || source.EventName || source.race || rows[0]?.race || ''),
    athletes,
    count: athletes.length,
  };
}

function sanitizeRaceResultJson(text) {
  return String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/,(\s*[}\]])/g, '$1')
    .replace(/([,{[]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
}

function parseRaceResultJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    /* try RaceResult-style */
  }
  try {
    return JSON.parse(sanitizeRaceResultJson(trimmed));
  } catch (_) {
    return null;
  }
}

module.exports = {
  adaptRaceResult,
  mapRaceResultAthlete,
  isRaceResultPayload,
  extractWiclaxNamedPassings,
  isNamedWiclaxPassing,
  parseRaceResultJson,
  sanitizeRaceResultJson,
  normalizeTime,
  normalizeGap,
  parseTimeToMs,
  formatTimeFromMs,
  inferCategoryId,
};
