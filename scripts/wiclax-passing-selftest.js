const { parseRacePayload } = require('../lib/raceAdapter');
const { mergePassingAthletes } = require('../lib/wiclaxTiming');
const { extractWiclaxNamedPassings, mapRaceResultAthlete } = require('../lib/raceResultAdapter');
const cp = require('../docs/samples/wiclax-passing-cp.json');
const finish = require('../docs/samples/wiclax-passing-finish.json');
const start = require('../docs/samples/wiclax-startlist.json');

const config = {
  activeEventId: 'e1',
  activeCategoryId: 'current',
  events: [{ id: 'e1', categories: [{ id: 'current', name: 'Текущая' }, { id: 'women', name: 'Женщины' }] }],
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

const mergedCp = mergePassingAthletes(parsedStart.athletes, parsedCp.athletes);
assert(mergedCp.length === 20, `startlist kept + bib 29, got ${mergedCp.length}`);
const vika = mergedCp.find((a) => String(a.number) === '29');
assert(vika && vika.account.firstName === 'Виктория', 'upserted athlete');
assert(mergedCp.find((a) => String(a.number) === '1'), 'bib 1 still there');

const parsedFin = parseRacePayload(finish, {}, config);
const mergedFin = mergePassingAthletes(mergedCp, parsedFin.athletes);
const vikaFin = mergedFin.find((a) => String(a.number) === '29');
assert(vikaFin.isFinished === true, 'finished after merge');
assert(vikaFin.position === 1, 'rank by loops');
assert(mergedFin.length === 20, 'still 20 athletes');

console.log('wiclax-passing-selftest ok');
