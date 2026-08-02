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
  return {
    место: fields.place ?? '',
    участник: fields.participant ?? '',
    номер: fields.number ?? '',
    возраст: fields.age ?? '',
    клуб: fields.club ?? '',
    результат: fields.result ?? '',
    доЛидера: fields.gapToLeader ?? '',
  };
}

function mapRawAthlete(raw, index) {
  const lastLap = getLastCompletedLap(raw.laps);
  return {
    raw,
    index,
    number: raw.number,
    participant: participantName(raw.account),
    age: raw.account?.age || '',
    club: raw.club || '',
    isFinished: !!raw.isFinished,
    isOnStart: !!raw.isOnStart,
    hasProgress: hasRaceProgress(raw),
    lastLap,
    position: raw.position,
    resultTime: raw.resultTime || '',
    leaderDifference: raw.leaderDifference || '',
  };
}

function buildStartList(rawAthletes) {
  return rawAthletes
    .filter((a) => a.isOnStart)
    .sort((a, b) => Number(a.number) - Number(b.number))
    .map((a, idx) =>
      toRow({
        place: idx + 1,
        participant: a.participant,
        number: a.number,
        age: a.age,
        club: a.club,
        result: '',
        gapToLeader: '',
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

function transformResults(rawData) {
  const rawAthletes = (rawData || []).map(mapRawAthlete);
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
};
