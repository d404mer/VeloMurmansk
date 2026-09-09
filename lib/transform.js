const { formatRegionClub, regionFlagPath } = require('./regions');
const { resolveAthleteValue } = require('./fieldMapping');

const COLUMNS = ['место', 'участник', 'номер', 'возраст', 'клуб', 'результат', 'доЛидера'];

function participantName(account) {
  if (!account) return '';
  const last = account.lastName || '';
  const first = account.firstName || '';
  return `${last} ${first}`.trim();
}

function formatGap(gap) {
  if (gap == null || gap === '') return '';
  const value = String(gap).trim();
  if (!value) return '';
  if (value.startsWith('+') || value.startsWith('-')) return value;
  return `+${value}`;
}

function formatNumber(number) {
  if (number == null || number === '') return '';
  return `№${number}`;
}

function getCompletedLaps(laps) {
  if (!Array.isArray(laps)) return [];
  return laps.filter((lap) => lap.isOnLap && lap.totalTime);
}

function getLastCompletedLap(laps) {
  const completed = getCompletedLaps(laps);
  return completed.length ? completed[completed.length - 1] : null;
}

function hasRaceProgress(raw) {
  return getCompletedLaps(raw.laps || []).length > 0;
}

function toRow(fields) {
  const row = {
    место: fields.place ?? '',
    участник: fields.participant ?? '',
    номер: fields.number ?? '',
    возраст: fields.age ?? '',
    клуб: formatRegionClub(fields.club),
    результат: fields.result ?? '',
    доЛидера: fields.gapToLeader ?? '',
  };
  if (fields.raw != null) row.raw = fields.raw;
  return row;
}

function mappedValue(athlete, key, mapping, fallback) {
  if (!mapping || !mapping[key]) return fallback;
  const value = resolveAthleteValue(athlete, key, mapping);
  return value !== '' ? value : fallback;
}

function mapRawAthlete(raw, index, mapping) {
  const account = raw.account || {};
  const lastLap = getLastCompletedLap(raw.laps);
  const clubFallback = raw.club || raw.team || raw.nationality || account.city || account.club || raw.city || '';
  const athlete = {
    raw,
    index,
    number: raw.number != null && raw.number !== '' ? String(raw.number) : '',
    participant: participantName(account),
    age: account.age != null && account.age !== '' ? String(account.age) : '',
    club: clubFallback,
    flag: raw.flag != null && raw.flag !== '' ? raw.flag : regionFlagPath(clubFallback),
    isFinished: !!raw.isFinished,
    isOnStart: !!raw.isOnStart,
    hasProgress: hasRaceProgress(raw),
    lastLap,
    position: raw.position,
    resultTime: raw.resultTime || '',
    leaderDifference: raw.leaderDifference || '',
  };
  athlete.number = mappedValue(athlete, 'num', mapping, athlete.number);
  athlete.participant = mappedValue(athlete, 'name', mapping, athlete.participant);
  athlete.age = mappedValue(athlete, 'age', mapping, athlete.age);
  athlete.club = mappedValue(athlete, 'city', mapping, athlete.club);
  athlete.position = mappedValue(athlete, 'place', mapping, athlete.position);
  athlete.resultTime = mappedValue(athlete, 'result', mapping, athlete.resultTime);
  athlete.leaderDifference = mappedValue(athlete, 'gap', mapping, athlete.leaderDifference);
  if (!athlete.flag) athlete.flag = regionFlagPath(athlete.club);
  return athlete;
}

function buildStartList(rawAthletes) {
  const onStart = rawAthletes.filter((a) => a.isOnStart);
  const source = onStart.length ? onStart : rawAthletes;

  return source
    .sort((a, b) => Number(a.number) - Number(b.number))
    .map((a) =>
      toRow({
        place: a.position ?? '',
        participant: a.participant,
        number: a.number,
        age: a.age,
        club: a.club,
        result: '',
        gapToLeader: '',
        raw: a.raw,
      })
    );
}

function buildResultsList(rawAthletes) {
  const ranked = rawAthletes.filter((a) => a.position != null && a.position !== '');

  if (ranked.length) {
    return ranked
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((a) =>
        toRow({
          place: a.position,
          participant: a.participant,
          number: a.number,
          age: a.age,
          club: a.club,
          result: a.resultTime || a.lastLap?.totalTime || '',
          gapToLeader: formatGap(a.leaderDifference),
          raw: a.raw,
        })
      );
  }

  return buildStartList(rawAthletes);
}

function buildLiveList(rawAthletes) {
  return buildResultsList(rawAthletes);
}

function buildFinalList(rawAthletes) {
  return buildResultsList(rawAthletes);
}

function buildLeaders(rawAthletes, limit = 5) {
  const ranked = rawAthletes
    .filter((a) => a.position != null && a.position !== '')
    .sort((a, b) => Number(a.position) - Number(b.position));

  return ranked.slice(0, limit).map((a) =>
    toRow({
      place: a.position,
      participant: a.participant,
      number: a.number,
      age: a.age,
      club: a.club,
      result: a.resultTime || a.lastLap?.totalTime || '',
      gapToLeader: formatGap(a.leaderDifference),
      raw: a.raw,
    })
  );
}

function buildLapDetails(rawAthletes) {
  const rows = [];
  for (const athlete of rawAthletes) {
    for (const lap of athlete.raw.laps || []) {
      if (!lap.isOnLap) continue;
      rows.push({
        номер: athlete.number,
        участник: athlete.participant,
        lapNumber: lap.lapNumber,
        lapName: lap.name,
        totalTime: lap.totalTime || '',
        lapTime: lap.lapTime || '',
        groupRacePosition: lap.groupRacePosition ?? '',
        leaderDifference: formatGap(lap.leaderDifference),
      });
    }
  }
  return rows;
}

function detectMode(rawAthletes) {
  if (!rawAthletes.length) return 'start';
  const allFinished = rawAthletes.every((a) => a.isFinished);
  if (allFinished) return 'final';
  const anyRanked = rawAthletes.some((a) => a.position != null && a.position !== '');
  if (anyRanked) return 'live';
  return 'start';
}

function transformResults(rawData, mapping) {
  const rawAthletes = (rawData || []).map((row, index) => mapRawAthlete(row, index, mapping));
  const mode = detectMode(rawAthletes);

  const startList = buildStartList(rawAthletes);
  const resultsList = buildResultsList(rawAthletes);
  const liveList = buildLiveList(rawAthletes);
  const finalList = buildFinalList(rawAthletes);
  const leaders = buildLeaders(rawAthletes, 3);
  const lapDetails = buildLapDetails(rawAthletes);

  let displayList = startList;
  if (mode === 'live' || mode === 'final') displayList = resultsList;

  return {
    mode,
    columns: COLUMNS,
    startList,
    liveList,
    finalList,
    displayList,
    resultsList,
    leaders,
    lapDetails,
    rawCount: rawAthletes.length,
  };
}

module.exports = {
  COLUMNS,
  transformResults,
  formatGap,
  formatNumber,
};
