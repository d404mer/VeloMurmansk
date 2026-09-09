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

function buildLapsFromSplits(splits, fallbackRank) {
  const laps = [];
  let prevMs = 0;
  let index = 0;
  for (const split of splits || []) {
    if (!split || typeof split !== 'object') continue;
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
    laps.push({
      lapNumber: Number(split.lapNumber) || index,
      name: cleanString(split.name || split.split || `Круг ${index}`),
      isOnLap: true,
      totalTime,
      lapTime: normalizeTime(lapTime) || totalTime,
      groupRacePosition: place === '' ? '' : place,
      leaderDifference: normalizeGap(split.gap || split.leaderDifference || ''),
    });
  }
  return laps;
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
  const club = cleanString(getField(raw, 'club', 'team', 'nationality', 'city') ?? '');
  const { firstName, lastName } = splitPersonName(
    getField(raw, 'name'),
    getField(raw, 'firstname', 'firstName'),
    getField(raw, 'lastname', 'lastName')
  );
  const age = cleanString(getField(raw, 'year', 'age', 'birthyear') ?? '');
  const city = cleanString(getField(raw, 'city', 'team') ?? club);
  const status = cleanString(getField(raw, 'status', 'finishedstatus') || '').toUpperCase();
  const dns = raw.DNS === true || raw.dns === true || status === 'DNS';

  const splits = Array.isArray(getField(raw, 'splits')) ? getField(raw, 'splits') : [];
  const position = isStartList
    ? ''
    : toPosition(getField(raw, 'rank', 'catrank', 'rankbycat', 'position') ?? '');
  const laps =
    isStartList || dns
      ? []
      : splits.length
        ? buildLapsFromSplits(splits, position)
        : buildLapsFromSingle(getField(raw, 'split'), getField(raw, 'time', 'chiptime'), position, getField(raw, 'gap'));

  const lastLap = laps.length ? laps[laps.length - 1] : null;
  const isFinished =
    !isStartList &&
    !dns &&
    (raw.finished === true ||
      raw.isFinished === true ||
      status === 'FIN' ||
      status === 'FINISHED');
  const isOnStart = isStartList ? !dns : !dns && !resultTime && laps.length === 0;

  const mapped = {
    id: number || cleanString(raw.id),
    number,
    position,
    resultTime: resultTime || lastLap?.totalTime || '',
    leaderDifference: isStartList
      ? ''
      : normalizeGap(raw.gap ?? raw.leaderDifference ?? lastLap?.leaderDifference ?? ''),
    isFinished,
    isOnStart,
    club,
    city,
    firstname: firstName,
    lastname: lastName,
    team: cleanString(getField(raw, 'team') ?? club),
    nationality: cleanString(getField(raw, 'nationality') ?? ''),
    year: age,
    bib: number,
    account: {
      firstName,
      lastName,
      age,
      city,
      club,
    },
    laps,
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
  parseRaceResultJson,
  sanitizeRaceResultJson,
  normalizeTime,
  normalizeGap,
  parseTimeToMs,
  formatTimeFromMs,
};
