/**
 * Эмулятор HTTP-ретранслятора Wiclax → POST /api/race
 *
 *   node scripts/wiclax-emulator.js
 *   node scripts/wiclax-emulator.js http://localhost:3000/api/race 1500
 *   node scripts/wiclax-emulator.js https://xxxx.ru.tuna.am/api/race 2000 --skip-startlist
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadSample(file) {
  return JSON.parse(fs.readFileSync(path.join(samplesDir, file), 'utf8'));
}

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

async function main() {
  console.log(`Wiclax emulator → ${url} (delay ${delayMs} ms)`);
  if (!skipEmpty) {
    await post('inRace empty', loadSample('wiclax-inrace-empty.json'));
    await sleep(delayMs);
  }
  if (!skipStartlist) {
    await post('startList', loadSample('wiclax-startlist.json'));
    await sleep(delayMs);
  }
  await post('passing 5CP', loadSample('wiclax-passing-cp.json'));
  await sleep(delayMs);
  await post('passing Finish', loadSample('wiclax-passing-finish.json'));
  console.log('done');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
