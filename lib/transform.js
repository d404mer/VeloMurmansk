const { formatClubDisplay, regionFlagPathFromClub, normalizeClubNameMode } = require('./regions');
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

function toRow(fields, clubNameMode) {
  const row = {
    место: fields.place ?? '',
    участник: fields.participant ?? '',
    номер: fields.number ?? '',
    возраст: fields.age ?? '',
    клуб: formatClubDisplay(fields.club, {
      mode: clubNameMode,
      nationality: fields.raw?.nationality || fields.nationality || '',
    }),
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
  if (!raw || typeof raw !== 'object') {
    raw = {};
  }
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
    flag:
      raw.flag != null && raw.flag !== ''
        ? raw.flag
        : regionFlagPathFromClub(clubFallback, raw.nationality, [raw.team, raw.club, raw.city]),
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
  if (!athlete.flag) {
    athlete.flag = regionFlagPathFromClub(athlete.club, athlete.raw?.nationality, [
      athlete.raw?.team,
      athlete.raw?.club,
      athlete.raw?.city,
    ]);
  }
  return athlete;
}

function buildStartList(rawAthletes, clubNameMode) {
  const onStart = rawAthletes.filter((a) => a.isOnStart);
  const source = onStart.length ? onStart : rawAthletes;

  return source
    .sort((a, b) => Number(a.number) - Number(b.number))
    .map((a) =>
      toRow(
        {
          place: a.position ?? '',
          participant: a.participant,
          number: a.number,
          age: a.age,
          club: a.club,
          result: '',
          gapToLeader: '',
          raw: a.raw,
        },
        clubNameMode
      )
    );
}

function buildResultsList(rawAthletes, clubNameMode) {
  const ranked = rawAthletes.filter((a) => a.position != null && a.position !== '');

  if (ranked.length) {
    return ranked
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((a) =>
        toRow(
          {
            place: a.position,
            participant: a.participant,
            number: a.number,
            age: a.age,
            club: a.club,
            result: a.resultTime || a.lastLap?.totalTime || '',
            gapToLeader: formatGap(a.leaderDifference),
            raw: a.raw,
          },
          clubNameMode
        )
      );
  }

  return buildStartList(rawAthletes, clubNameMode);
}

function buildLiveList(rawAthletes, clubNameMode) {
  return buildResultsList(rawAthletes, clubNameMode);
}

function buildFinalList(rawAthletes, clubNameMode) {
  return buildResultsList(rawAthletes, clubNameMode);
}

function buildLeaders(rawAthletes, limit = 5, clubNameMode) {
  const ranked = rawAthletes
    .filter((a) => a.position != null && a.position !== '')
    .sort((a, b) => Number(a.position) - Number(b.position));

  return ranked.slice(0, limit).map((a) =>
    toRow(
      {
        place: a.position,
        participant: a.participant,
        number: a.number,
        age: a.age,
        club: a.club,
        result: a.resultTime || a.lastLap?.totalTime || '',
        gapToLeader: formatGap(a.leaderDifference),
        raw: a.raw,
      },
      clubNameMode
    )
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

function transformResults(rawData, mapping, options = {}) {
  const clubNameMode = normalizeClubNameMode(options.clubNameMode);
  const rawAthletes = (rawData || []).map((row, index) => mapRawAthlete(row, index, mapping));
  const mode = detectMode(rawAthletes);

  const startList = buildStartList(rawAthletes, clubNameMode);
  const resultsList = buildResultsList(rawAthletes, clubNameMode);
  const liveList = buildLiveList(rawAthletes, clubNameMode);
  const finalList = buildFinalList(rawAthletes, clubNameMode);
  const leaders = buildLeaders(rawAthletes, 3, clubNameMode);
  const lapDetails = buildLapDetails(rawAthletes);
  const standings = options.standings || null;

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
    standings,
    rawCount: rawAthletes.length,
  };
}

module.exports = {
  COLUMNS,
  transformResults,
  formatGap,
  formatNumber,
};
