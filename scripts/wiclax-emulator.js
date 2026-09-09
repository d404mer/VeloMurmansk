/**
 * Эмулятор HTTP-ретранслятора Wiclax → POST /api/race
 *
 * Шлёт и обычные отсечки (1CP…5CP), и финальные Finish по кругам.
 *
 *   node scripts/wiclax-emulator.js
 *   node scripts/wiclax-emulator.js http://localhost:3000/api/race 800
 *   node scripts/wiclax-emulator.js https://xxxx.ru.tuna.am/api/race 1500 --skip-startlist
 *   node scripts/wiclax-emulator.js http://localhost:3000/api/race 800 --laps 3
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const samplesDir = path.join(__dirname, '..', 'docs', 'samples');
const url = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : 'http://localhost:3000/api/race';
const delayMs = Number(process.argv.find((a, i) => i >= 2 && /^\d+$/.test(a)) || 1500);
const skipStartlist = process.argv.includes('--skip-startlist');
const skipEmpty = process.argv.includes('--skip-empty');
const lapsArgIdx = process.argv.indexOf('--laps');
const totalLaps = Math.max(1, Number(lapsArgIdx >= 0 ? process.argv[lapsArgIdx + 1] : 3) || 3);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadSample(file) {
  return JSON.parse(fs.readFileSync(path.join(samplesDir, file), 'utf8'));
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatRaceTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

/** Two riders so intermediate board can show leader + gap. */
const RIDERS = [
  {
    bib: 29,
    realbib: '29',
    firstname: 'Виктория',
    lastname: 'ЕГОРОВА',
    sex: 'F',
    nationality: 'СВД',
    year: '2008',
    'Квал.': 'КМС',
    СубьектРФ: 'Свердловская область',
    РейтингФВСР: '16',
    baseOffsetSec: 0,
  },
  {
    bib: 7,
    realbib: '7',
    firstname: 'Анна',
    lastname: 'СМИРНОВА',
    sex: 'F',
    nationality: 'МУР',
    year: '2009',
    'Квал.': 'КМС',
    СубьектРФ: 'Мурманская область',
    РейтингФВСР: '22',
    baseOffsetSec: 18,
  },
];

const CP_OFFSETS = [
  { name: '1CP', offset: 0 },
  { name: '2CP', offset: 37 },
  { name: '3CP', offset: 43 },
  { name: '5CP', offset: 47 },
];

const FIRST_LAP_SEC = 805;
const OTHER_LAP_SEC = 49;
const FIRST_CP_BASE = 741; // 12:21 on lap 1 for leader

async function post(label, body) {
  const res = await axios.post(url, body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    timeout: 15000,
    validateStatus: () => true,
  });
  const data = typeof res.data === 'object' ? JSON.stringify(res.data) : String(res.data);
  console.log(`[${label}] ${res.status} ${data}`);
  if (res.status >= 400) {
    throw new Error(`${label} failed: ${res.status} ${data}`);
  }
}

function riderBase(rider) {
  return {
    dataType: 'passing',
    bib: rider.bib,
    realbib: rider.realbib,
    firstname: rider.firstname,
    lastname: rider.lastname,
    race: 'Женщины',
    category: '',
    sex: rider.sex,
    nationality: rider.nationality,
    year: rider.year,
    team: '',
    'Квал.': rider['Квал.'],
    СубьектРФ: rider.СубьектРФ,
    РейтингФВСР: rider.РейтингФВСР,
    chiptime: '',
    distance: 0,
  };
}

function lapStartSec(rider, lapNum) {
  let t = rider.baseOffsetSec;
  for (let n = 1; n < lapNum; n += 1) {
    t += n === 1 ? FIRST_LAP_SEC : OTHER_LAP_SEC;
  }
  return t;
}

function buildCpPassing(rider, lapNum, cpIndex, rank) {
  const start = lapStartSec(rider, lapNum);
  const cp = CP_OFFSETS[cpIndex];
  const raceSec = start + FIRST_CP_BASE + cp.offset;
  const splits = CP_OFFSETS.slice(0, cpIndex + 1).map((item) => ({
    name: item.name,
    time: formatRaceTime(start + FIRST_CP_BASE + item.offset),
  }));
  return {
    ...riderBase(rider),
    rank,
    rankbycat: rank,
    rankbysex: rank,
    split: cp.name,
    time: formatRaceTime(raceSec),
    brutetime: formatRaceTime(raceSec),
    gap: rank === 1 ? '' : `+${formatRaceTime(rider.baseOffsetSec)}`,
    lapData: [{ num: lapNum, time: formatRaceTime(raceSec - start), raceTime: formatRaceTime(raceSec) }],
    splits,
  };
}

function buildFinishPassing(rider, lapNum, rank) {
  const lapData = [];
  let cumulative = rider.baseOffsetSec;
  for (let n = 1; n <= lapNum; n += 1) {
    const lapSec = n === 1 ? FIRST_LAP_SEC : OTHER_LAP_SEC;
    cumulative += lapSec;
    lapData.push({
      num: n,
      time: formatRaceTime(lapSec),
      raceTime: formatRaceTime(cumulative),
    });
  }
  const finishSec = cumulative;
  const start = lapStartSec(rider, lapNum);
  const splits = CP_OFFSETS.map((item) => ({
    name: item.name,
    time: formatRaceTime(start + FIRST_CP_BASE + item.offset),
  }));
  return {
    ...riderBase(rider),
    rank,
    rankbycat: rank,
    rankbysex: rank,
    split: 'Finish',
    time: formatRaceTime(finishSec),
    brutetime: formatRaceTime(finishSec),
    laps: lapNum,
    lastlap: formatRaceTime(lapData[lapData.length - 1].time),
    bestlap: formatRaceTime(OTHER_LAP_SEC),
    gap: rank === 1 ? '' : `+${formatRaceTime(rider.baseOffsetSec)}`,
    avgSpeed: 26.31,
    distance: Number((3.121 * lapNum).toFixed(3)),
    lapData,
    splits,
  };
}

async function main() {
  console.log(`Wiclax emulator → ${url} (delay ${delayMs} ms, laps ${totalLaps})`);
  if (!skipEmpty) {
    await post('inRace empty', loadSample('wiclax-inrace-empty.json'));
    await sleep(delayMs);
  }
  if (!skipStartlist) {
    await post('startList', loadSample('wiclax-startlist.json'));
    await sleep(delayMs);
  }

  for (let lap = 1; lap <= totalLaps; lap += 1) {
    for (let cpIndex = 0; cpIndex < CP_OFFSETS.length; cpIndex += 1) {
      for (let r = 0; r < RIDERS.length; r += 1) {
        const rider = RIDERS[r];
        const body = buildCpPassing(rider, lap, cpIndex, r + 1);
        await post(`L${lap} ${CP_OFFSETS[cpIndex].name} bib ${rider.bib}`, body);
        await sleep(delayMs);
      }
    }
    for (let r = 0; r < RIDERS.length; r += 1) {
      const rider = RIDERS[r];
      const body = buildFinishPassing(rider, lap, r + 1);
      await post(`L${lap} Finish bib ${rider.bib}`, body);
      await sleep(delayMs);
    }
  }

  console.log('done');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
