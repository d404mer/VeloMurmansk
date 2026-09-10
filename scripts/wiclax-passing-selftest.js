const { parseRacePayload } = require('../lib/raceAdapter');
const { mergePassingAthletes } = require('../lib/wiclaxTiming');
const { extractWiclaxNamedPassings, mapRaceResultAthlete } = require('../lib/raceResultAdapter');
const { recomputeStandings } = require('../lib/raceStandings');
const { ensureCategoryForContest, slugCategoryId } = require('../lib/currentRace');
const cp = require('../docs/samples/wiclax-passing-cp.json');
const finish = require('../docs/samples/wiclax-passing-finish.json');
const start = require('../docs/samples/wiclax-startlist.json');

const config = {
  activeEventId: 'e1',
  activeCategoryId: 'current',
  events: [
    {
      id: 'e1',
      categories: [
        { id: 'current', name: 'Текущая' },
        { id: 'women', name: 'Женщины' },
        { id: 'men', name: 'Мужчины' },
      ],
    },
  ],
};

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const named = extractWiclaxNamedPassings(cp);
assert(named && named.length === 1, 'extract CP passing');
assert(!extractWiclaxNamedPassings(start), 'startList is not a named passing');

const mappedCp = mapRaceResultAthlete(cp, cp);
assert(mappedCp.number === '29', 'bib');
assert(mappedCp.account.lastName === 'ЕГОРОВА', 'name');
assert(mappedCp.club === 'Свердловская область', 'subject as club');
assert(mappedCp.nationality === 'СВД', 'nationality code');
assert(mappedCp.isFinished === false, 'CP is not finish');
assert(mappedCp.laps.every((l) => l.isLoop === false), 'CP splits are checkpoints');
assert(mappedCp.resultTime === '00:13:08', 'CP race time');

const mappedFin = mapRaceResultAthlete(finish, finish);
assert(mappedFin.isFinished === true, 'Finish flag');
assert(mappedFin.laps.filter((l) => l.isLoop).length === 2, 'two race loops from lapData');
assert(mappedFin.resultTime === '00:14:14', 'finish time, not brutetime');

const parsedStart = parseRacePayload(start, {}, config);
assert(!parsedStart.mergeAthletes, 'startList replaces');
assert(parsedStart.count === 19, 'startlist size');

const parsedCp = parseRacePayload(cp, {}, config);
assert(parsedCp.mergeAthletes === true, 'CP merges');
assert(parsedCp.source === 'wiclax-passing', 'source');
assert(parsedCp.contestName === 'Женщины', 'contest from race field');
assert(parsedCp.categoryId === 'women', 'inferred women tab');

const mergedCp = mergePassingAthletes(parsedStart.athletes, parsedCp.athletes);
assert(mergedCp.length === 20, `startlist kept + bib 29, got ${mergedCp.length}`);
const vika = mergedCp.find((a) => String(a.number) === '29');
assert(vika && vika.account.firstName === 'Виктория', 'upserted athlete');
assert(mergedCp.find((a) => String(a.number) === '1'), 'bib 1 still there');

const parsedFin = parseRacePayload(finish, {}, config);
const mergedFin = mergePassingAthletes(mergedCp, parsedFin.athletes);
const vikaFin = mergedFin.find((a) => String(a.number) === '29');
assert(vikaFin.isFinished === true, 'finished after merge');
assert(mergedFin.length === 20, 'still 20 athletes');

// Internal standings: two riders on same CP
const second = JSON.parse(JSON.stringify(cp));
second.bib = 7;
second.realbib = '7';
second.firstname = 'Анна';
second.lastname = 'СМИРНОВА';
second.rank = 2;
second.time = '00:13:26';
second.brutetime = '00:13:26';
second.splits = [
  { name: '1CP', time: '00:12:40' },
  { name: '2CP', time: '00:13:10' },
  { name: '3CP', time: '00:13:20' },
  { name: '5CP', time: '00:13:26' },
];
const a1 = mapRaceResultAthlete(cp, cp);
const a2 = mapRaceResultAthlete(second, second);
const standingsCp = recomputeStandings([a1, a2]);
assert(standingsCp.leader.number === '29', 'CP leader is faster bib');
assert(a1.position === 1 && a2.position === 2, 'CP positions');
assert(String(a2.leaderDifference).startsWith('+'), 'CP gap');
assert(standingsCp.bySplit['5CP'] && standingsCp.bySplit['5CP'].rows.length === 2, 'bySplit 5CP');

const standingsFin = recomputeStandings(mergedFin);
assert(Number(vikaFin.position) === 1, `finish leader by loops, got ${vikaFin.position}`);
assert(standingsFin.bySplit['Круг 1'] || standingsFin.bySplit['Круг 2'], 'loop splits in table');

// New race name → new dropdown tab
assert(slugCategoryId('Элита Мужчины') === 'elita_muzhchiny', `slug got ${slugCategoryId('Элита Мужчины')}`);
const cfg2 = JSON.parse(JSON.stringify(config));
const created = ensureCategoryForContest(cfg2, {
  knownCategoryId: '',
  contestName: 'Элита Мужчины',
});
assert(created.created === true, 'creates tab');
assert(created.category.id === 'elita_muzhchiny', 'slug id');
assert(cfg2.events[0].categories.some((c) => c.id === 'elita_muzhchiny'), 'in config list');

const again = ensureCategoryForContest(cfg2, {
  knownCategoryId: '',
  contestName: 'Элита Мужчины',
});
assert(again.created === false, 'reuse tab');
assert(again.category.id === 'elita_muzhchiny', 'same id');

const menPayload = JSON.parse(JSON.stringify(cp));
menPayload.race = 'Совсем Новая Гонка';
const parsedNew = parseRacePayload(menPayload, {}, config);
assert(parsedNew.contestName === 'Совсем Новая Гонка', 'new contest name');
assert(parsedNew.resolveByContest === true, 'resolveByContest');

console.log('wiclax-passing-selftest ok');
