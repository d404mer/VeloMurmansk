const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const express = require('express');
const { ConnectionTCP } = require('node-vmix');
const { fetchResults } = require('./lib/limetime');
const { transformResults } = require('./lib/transform');
const { exportDataFile, lapStateToArray } = require('./lib/excelExport');
const { createSetupRoutes } = require('./lib/setupRoutes');
const { createLapTracker, resolvePlaqueGap } = require('./lib/lapTracker');
const { createVmixPusher, buildVmixPayload, groupPayloadByInput } = require('./lib/vmixPush');
const { buildPlaquesView, applyPlaquesToConfig, AVAILABLE_SOURCE_FIELDS, DEFAULT_FIELD_MAPPING } = require('./lib/vmixPlaques');
const { getTemplatesView, validateTemplatesUpdate, applyTemplatesUpdate } = require('./lib/vmixTemplates');
const { resolveVmixConfig, normalizeNumberTrim } = require('./lib/vmixConfig');
const { buildSetupView, applyIngestSettings } = require('./lib/configEditor');
const { parseRacePayload, RaceAdapterError } = require('./lib/raceAdapter');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const EXPORTS_DIR = path.join(__dirname, 'exports');
const DEBUG_DUMP_PATH = path.join(__dirname, 'debug', 'last-race.json');
const INGEST_CACHE_PATH = path.join(__dirname, 'debug', 'ingest-cache.json');

let configMtimeMs = 0;

function readConfigFile() {
  const text = fs.readFileSync(CONFIG_PATH, 'utf8');
  try {
    configMtimeMs = fs.statSync(CONFIG_PATH).mtimeMs;
  } catch (_) {
    /* ignore */
  }
  return JSON.parse(text);
}

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(express.urlencoded({ extended: true }));
app.use(
  express.json({
    limit: '2mb',
    type: ['json', 'application/json', 'application/*+json', 'text/json', 'text/plain'],
  })
);

let config = readConfigFile();
let connection = null;
let vmixConnected = false;
let raceData = emptyRaceData();
let dataFrozen = false;
let frozenSnapshot = null;
let pollTimer = null;
let isFetching = false;
const lapTracker = createLapTracker();
const sseClients = [];
let replayTimer = null;
let lastCategoryResults = new Map();
let lastCategoryRaw = new Map();
let lastIngestAt = null;
let lastIngestCount = 0;
let lastIngestCategoryId = null;
let actualListen = { host: '0.0.0.0', port: 3000 };

const vmixPusher = createVmixPusher(() => ({
  connected: vmixConnected,
  client: connection,
  onError: (err) => {
    vmixConnected = false;
    console.error('[vmix] error', err?.message || err);
  },
}));

function emptyRaceData() {
  return {
    mode: 'start',
    startList: [],
    liveList: [],
    finalList: [],
    displayList: [],
    leaders: [],
    lapDetails: [],
    rawCount: 0,
    lastUpdated: null,
    lastError: null,
    lastExport: null,
  };
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function getDisplayData() {
  if (dataFrozen && frozenSnapshot) return frozenSnapshot;
  return raceData;
}

function loadConfig() {
  return readConfigFile();
}

/** If config.json changed on disk (another process / IDE), refresh memory first. */
function reloadConfigFromDisk() {
  try {
    const mtime = fs.statSync(CONFIG_PATH).mtimeMs;
    if (mtime === configMtimeMs) return false;
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    configMtimeMs = mtime;
    console.log('[config] reloaded from disk');
    return true;
  } catch (err) {
    console.warn('[config] reload failed:', err.message || err);
    return false;
  }
}

function snapshotFieldMaps(cfg) {
  return JSON.stringify({
    indexedFields: cfg?.vmix?.indexedFields || {},
    singleFields: cfg?.vmix?.singleFields || {},
  });
}

function diffFieldMaps(beforeJson, afterJson) {
  try {
    const before = JSON.parse(beforeJson);
    const after = JSON.parse(afterJson);
    const lines = [];
    for (const group of ['indexedFields', 'singleFields']) {
      const b = before[group] || {};
      const a = after[group] || {};
      const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
      for (const key of keys) {
        if (b[key] === a[key]) continue;
        lines.push(`${group}.${key}: ${JSON.stringify(b[key] ?? null)} → ${JSON.stringify(a[key] ?? null)}`);
      }
    }
    return lines;
  } catch (_) {
    return ['(diff unavailable)'];
  }
}

function saveConfig(newConfig) {
  if (newConfig) {
    config = newConfig;
  }
  const payload = `${JSON.stringify(config, null, 2)}\n`;
  const tmpPath = `${CONFIG_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, payload, 'utf8');
  fs.renameSync(tmpPath, CONFIG_PATH);
  try {
    configMtimeMs = fs.statSync(CONFIG_PATH).mtimeMs;
  } catch (_) {
    /* ignore */
  }
}

/**
 * Reload disk → mutate → write only if something actually changed.
 * Avoids rewriting config.json on no-op field-mapping saves (fights the IDE / looks like “self-revert”).
 */
function updateConfig(mutator, reason = 'update') {
  reloadConfigFromDisk();
  const beforeAll = JSON.stringify(config);
  const beforeMaps = snapshotFieldMaps(config);
  const result = mutator(config);
  const afterAll = JSON.stringify(config);
  const afterMaps = snapshotFieldMaps(config);

  if (beforeMaps !== afterMaps) {
    const lines = diffFieldMaps(beforeMaps, afterMaps);
    console.log(`[config] field maps changed via "${reason}"`);
    for (const line of lines) console.log(`  ${line}`);
  }

  if (beforeAll === afterAll) {
    console.log(`[config] skip write via "${reason}" (no changes)`);
    return result;
  }

  saveConfig();
  console.log(`[config] wrote via "${reason}"`);
  return result;
}

function getActiveEvent() {
  return config.events.find((e) => e.id === config.activeEventId);
}

function getActiveCategory(event) {
  if (!event) return null;
  return event.categories.find((c) => c.id === config.activeCategoryId);
}

function getDataSource() {
  return config.dataSource === 'http' ? 'http' : 'limetime';
}

function isHttpSource() {
  return getDataSource() === 'http';
}

function getListenConfig() {
  const host = process.env.HOST || config.server?.host || '0.0.0.0';
  const port = Number(process.env.PORT || config.server?.port || 3000);
  return { host, port: Number.isFinite(port) && port > 0 ? port : 3000 };
}

function getActualListen() {
  return { ...actualListen };
}

function listLanIPv4() {
  const ips = [];
  const ifaces = os.networkInterfaces();
  for (const addrs of Object.values(ifaces || {})) {
    for (const addr of addrs || []) {
      const family = addr.family;
      if (family !== 'IPv4' && family !== 4) continue;
      if (addr.internal) continue;
      const ip = addr.address;
      if (!ip || ip === '127.0.0.1') continue;
      if (ip.startsWith('169.254.')) continue;
      ips.push(ip);
    }
  }
  const rank = (ip) => {
    if (ip.startsWith('192.168.')) return 3;
    if (ip.startsWith('10.')) return 2;
    const parts = ip.split('.').map(Number);
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return 1;
    return 0;
  };
  return [...new Set(ips)].sort((a, b) => rank(b) - rank(a) || a.localeCompare(b));
}

function getIngestUrls() {
  const { host, port } = getActualListen();
  const ips =
    host && host !== '0.0.0.0' && host !== '::' && host !== '::0'
      ? [host]
      : listLanIPv4();
  return ips.map((ip) => `http://${ip}:${port}/api/race`);
}

function ensureInboundFirewall(port) {
  if (process.platform !== 'win32') return;
  const name = `VELO HTTP ${port}`;
  execFile(
    'netsh',
    ['advfirewall', 'firewall', 'show', 'rule', `name=${name}`],
    { windowsHide: true },
    (showErr, stdout) => {
      const exists = !showErr && stdout && /Rule Name/i.test(stdout) && stdout.includes(name);
      if (exists) {
        console.log(`[race] firewall: правило «${name}» уже есть`);
        return;
      }
      execFile(
        'netsh',
        [
          'advfirewall',
          'firewall',
          'add',
          'rule',
          `name=${name}`,
          'dir=in',
          'action=allow',
          'protocol=TCP',
          `localport=${String(port)}`,
          'profile=any',
          'enable=yes',
        ],
        { windowsHide: true },
        (addErr) => {
          if (addErr) {
            console.warn(
              `[race] firewall: не удалось открыть TCP ${port} (нужны права администратора). Выполните:`
            );
            console.warn(
              `  netsh advfirewall firewall add rule name="${name}" dir=in action=allow protocol=TCP localport=${port} profile=any`
            );
            return;
          }
          console.log(`[race] firewall: открыт входящий TCP ${port} («${name}»)`);
        }
      );
    }
  );
}

function isRaceDebugEnabled() {
  return process.env.RACE_DEBUG === '1' || config.ingest?.debug === true;
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.warn(`[race] failed to read ${path.basename(filePath)}:`, err.message || err);
    return null;
  }
}

function persistIngestSnapshot(lastPayload) {
  try {
    const categories = {};
    for (const [categoryId, athletes] of lastCategoryRaw) {
      categories[categoryId] = athletes;
    }
    writeJsonAtomic(INGEST_CACHE_PATH, {
      savedAt: new Date().toISOString(),
      lastUpdated: raceData.lastUpdated,
      lastIngestAt,
      lastIngestCount,
      lastIngestCategoryId,
      categories,
    });
    if (lastPayload != null) {
      writeJsonAtomic(DEBUG_DUMP_PATH, lastPayload);
    }
  } catch (err) {
    console.warn('[race] persist failed:', err.message || err);
  }
}

function dumpLastRacePayload(payload) {
  persistIngestSnapshot(payload);
}

function ingestAthletesFromLegacyDump(dump) {
  if (!dump || typeof dump !== 'object' || Array.isArray(dump)) return null;
  if (dump.isSuccess === true && Array.isArray(dump.data)) {
    const categoryId = dump.categoryId || config.activeCategoryId;
    if (!categoryId) return null;
    return { categories: { [categoryId]: dump.data }, lastIngestCategoryId: categoryId };
  }
  if (dump.categories && typeof dump.categories === 'object') return dump;
  return null;
}

async function restoreIngestSnapshot() {
  const cache = ingestAthletesFromLegacyDump(readJsonIfExists(INGEST_CACHE_PATH))
    || ingestAthletesFromLegacyDump(readJsonIfExists(DEBUG_DUMP_PATH));
  if (!cache?.categories) return;

  const entries = Object.entries(cache.categories).filter(([, athletes]) => Array.isArray(athletes));
  if (!entries.length) return;

  if (cache.lastIngestAt) lastIngestAt = cache.lastIngestAt;
  if (cache.lastIngestCount != null) lastIngestCount = cache.lastIngestCount;
  if (cache.lastIngestCategoryId) lastIngestCategoryId = cache.lastIngestCategoryId;

  let restored = 0;
  for (const [categoryId, athletes] of entries) {
    try {
      lastCategoryRaw.set(categoryId, athletes);
      await applyCategoryRaw(categoryId, athletes, { skipExcel: true });
      restored += 1;
    } catch (err) {
      console.warn(`[race] restore skip ${categoryId}:`, err.message || err);
    }
  }

  if (cache.lastUpdated && raceData.rawCount) {
    raceData.lastUpdated = cache.lastUpdated;
  }
  if (!lastIngestAt && cache.savedAt) lastIngestAt = cache.savedAt;
  if (!lastIngestCount && restored) {
    lastIngestCount = lastCategoryResults.get(config.activeCategoryId)?.rawCount
      || lastCategoryResults.get(lastIngestCategoryId)?.rawCount
      || 0;
  }

  console.log(`[race] restored ${restored} categor${restored === 1 ? 'y' : 'ies'} from disk`);
}

function vmixHost() {
  return config.vmix?.host || 'localhost';
}

function markVmixDisconnected(reason) {
  if (vmixConnected) {
    console.warn('[vmix] disconnected', reason || '');
  }
  vmixConnected = false;
}

function patchVmixSend(client) {
  if (!client || client._veloSendPatched) return;
  client._veloSendPatched = true;
  client._sendMessageToSocket = async (message) => {
    const socket = client._socket;
    if (!socket || socket.destroyed || !socket.writable) {
      markVmixDisconnected('socket not writable');
      return;
    }
    try {
      socket.write(message, (err) => {
        if (!err) return;
        markVmixDisconnected(err.message || err);
        console.error('[vmix] send failed:', err.message || err);
      });
    } catch (err) {
      markVmixDisconnected(err.message || err);
      console.error('[vmix] send failed:', err.message || err);
    }
  };
}

function initVmix() {
  if (connection) return;
  let lastErrorLog = '';
  connection = new ConnectionTCP(vmixHost(), { autoReconnect: true });
  patchVmixSend(connection);

  connection.on('connect', () => {
    lastErrorLog = '';
    vmixConnected = true;
    console.log(`vMix Connected! (${vmixHost()})`);
    vmixPusher.resetCache();
    try {
      pushResultsToVmix(getDisplayData(), lastCategoryResults);
    } catch (err) {
      console.error('[vmix] push after connect failed:', err.message || err);
    }
  });

  connection.on('close', () => {
    markVmixDisconnected('connection closed, reconnecting…');
  });

  connection.on('end', () => {
    markVmixDisconnected('connection ended');
  });

  connection.on('error', (err) => {
    vmixConnected = false;
    const msg = err?.message || String(err);
    if (msg === lastErrorLog) return;
    lastErrorLog = msg;
    console.error('[vmix]', msg);
  });
}

process.on('uncaughtException', (err) => {
  const code = err?.code;
  const stack = String(err?.stack || '');
  const fromVmix = stack.includes('node-vmix') || stack.includes('connection-tcp');
  if (fromVmix && (code === 'EPIPE' || code === 'ECONNRESET' || code === 'ERR_STREAM_WRITE_AFTER_END')) {
    markVmixDisconnected(err.message || err);
    console.error('[vmix] socket error (kept running):', err.message || err);
    return;
  }
  console.error(err);
  process.exit(1);
});

function buildCategoryStartlists(event, categoryResults) {
  if (!event) return [];
  const activeId = config.activeCategoryId;
  const activeCategory = event.categories.find((category) => category.id === activeId);
  if (!activeCategory) return [];

  return [
    {
      categoryId: activeCategory.id,
      categoryName: activeCategory.name,
      startList: categoryResults.get(activeCategory.id)?.startList ?? [],
    },
  ];
}

function buildVmixMeta(event, category) {
  return {
    eventName: event?.name ?? '',
    categoryName: category?.name ?? '',
    lapState: lapTracker.getLapState(config.activeCategoryId),
  };
}

function pushResultsToVmix(data, categoryResults) {
  const event = getActiveEvent();
  const activeCategory = getActiveCategory(event);
  const startlists = buildCategoryStartlists(event, categoryResults || lastCategoryResults);
  if (process.env.VMIX_LOG_TEMPLATES === '1') {
    const vcfg = resolveVmixConfig(config);
    console.log('[vmix/push] templates:', vcfg.templates);
  }
  vmixPusher.pushAll(
    config,
    { ...data, meta: buildVmixMeta(event, activeCategory) },
    startlists
  );
}

async function fetchCategoryRaw(event, category) {
  if (isHttpSource()) {
    throw new Error('Limetime disabled (dataSource=http)');
  }
  return fetchResults(
    config.limetime,
    event.raceGuid,
    category.stageGuid,
    category.categoryGuid
  );
}

async function applyCategoryRaw(categoryId, rawAthletes, { skipExcel = false } = {}) {
  const event = getActiveEvent();
  const category = event?.categories.find((c) => c.id === categoryId);
  if (!event || !category) {
    throw new Error(`Category not found: ${categoryId}`);
  }

  lastCategoryRaw.set(categoryId, rawAthletes);

  const transformed = transformResults(rawAthletes);
  lastCategoryResults.set(categoryId, transformed);

  const isActive = categoryId === config.activeCategoryId;
  if (isActive) {
    raceData = {
      ...transformed,
      lastUpdated: new Date().toISOString(),
      lastError: null,
      lastExport: raceData.lastExport,
    };
    if (dataFrozen && frozenSnapshot) {
      frozenSnapshot.lastExport = raceData.lastExport;
    }
    pushResultsToVmix(getDisplayData(), lastCategoryResults);
  }

  if (!dataFrozen) {
    const result = lapTracker.processRawAthletes(
      categoryId,
      rawAthletes,
      getCategoryTotalLaps(category),
      getLapsMode()
    );
    if (isActive) {
      handleLapPollResult(categoryId, result);
    }
  }

  if (!skipExcel && isExcelExportEnabled()) {
    await saveExcel(event, lastCategoryResults);
    if (isActive && dataFrozen && frozenSnapshot) {
      frozenSnapshot.lastExport = raceData.lastExport;
    }
  }

  return transformed;
}

function extractRawAthletes(transformed) {
  const list = transformed?.displayList?.length
    ? transformed.displayList
    : transformed?.startList || [];
  return list.map((row) => row.raw).filter(Boolean);
}

function showCachedActiveCategory() {
  const event = getActiveEvent();
  const activeCategory = getActiveCategory(event);
  if (!event || !activeCategory) {
    raceData.lastError = 'Event or category not found in config';
    return raceData;
  }

  const cached = lastCategoryResults.get(activeCategory.id);
  if (cached) {
    raceData = {
      ...cached,
      lastUpdated: raceData.lastUpdated,
      lastError: null,
      lastExport: raceData.lastExport,
    };
    const raw = extractRawAthletes(cached);
    if (raw.length && !dataFrozen) {
      const result = lapTracker.processRawAthletes(
        activeCategory.id,
        raw,
        getCategoryTotalLaps(activeCategory),
        getLapsMode()
      );
      handleLapPollResult(activeCategory.id, result);
    }
  } else {
    raceData = {
      ...emptyRaceData(),
      lastExport: raceData.lastExport,
      lastUpdated: raceData.lastUpdated,
    };
  }
  pushResultsToVmix(getDisplayData(), lastCategoryResults);
  return raceData;
}

function resolveCategoryId(requestedId) {
  return requestedId || config.activeCategoryId;
}

function getLapsMode() {
  return config.laps?.mode === 'all' ? 'all' : 'leader';
}

const DEFAULT_LAPS_FONTS = { base: 18, name: 18, number: 13 };

function clampFontSize(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(48, Math.max(8, Math.round(n)));
}

function getLapsFonts() {
  const fonts = config.laps?.fonts || {};
  return {
    base: clampFontSize(fonts.base, DEFAULT_LAPS_FONTS.base),
    name: clampFontSize(fonts.name, DEFAULT_LAPS_FONTS.name),
    number: clampFontSize(fonts.number, DEFAULT_LAPS_FONTS.number),
  };
}

function isHideTeamWord() {
  return config.laps?.hideTeamWord === true;
}

function isExcelExportEnabled() {
  return config.excelExportEnabled !== false;
}

function isFlowerCeremony() {
  return config.vmix?.flowerCeremony !== false;
}

function isBreakAfterBullet() {
  return config.vmix?.breakAfterBullet !== false;
}

function getNumberTrim() {
  return normalizeNumberTrim(config.vmix?.numberTrim);
}

function broadcastLapEvent(event) {
  if (dataFrozen) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    if (client.categoryId && client.categoryId !== event.categoryId) continue;
    client.res.write(payload);
  }
}

function deliverLapEvent(event) {
  if (dataFrozen) return;
  lapTracker.publishEvent(event.categoryId, event);
  broadcastLapEvent(event);
}

function broadcastLapEvents(newEvents) {
  if (dataFrozen) return;
  for (const event of newEvents) {
    broadcastLapEvent(event);
  }
}

function participantToOverlayName(participant) {
  const parts = String(participant || '')
    .trim()
    .split(/\s+/);
  if (parts.length >= 2) {
    return `${parts.slice(1).join(' ')} ${parts[0]}`.toUpperCase();
  }
  return String(participant || '').toUpperCase();
}

function overlayNameFromRow(row) {
  if (!row) return '';
  const account = row.raw?.account;
  if (account) {
    const first = account.firstName || '';
    const last = account.lastName || '';
    return `${first} ${last}`.trim().toUpperCase();
  }
  return participantToOverlayName(row.участник || row.participant || '');
}

function rowToPlaqueFields(row) {
  if (!row) return null;
  return {
    place: row.место ?? row.place ?? '',
    number: row.номер ?? row.number ?? '',
    name: overlayNameFromRow(row),
    gap: row.доЛидера ?? row.gapToLeader ?? '',
    splitTime: row.результат ?? row.result ?? '',
  };
}

function getAthletesForCategory(categoryId) {
  const id = resolveCategoryId(categoryId);
  if (id === config.activeCategoryId) {
    const data = getDisplayData();
    if (data.displayList?.length) return data.displayList;
    if (data.startList?.length) return data.startList;
    return [];
  }
  const cached = lastCategoryResults.get(id);
  if (!cached) return [];
  if (cached.displayList?.length) return cached.displayList;
  if (cached.startList?.length) return cached.startList;
  return [];
}

function pickLeaderPlaqueFields(categoryId) {
  const id = resolveCategoryId(categoryId);
  if (id === config.activeCategoryId) {
    const leaders = getDisplayData().leaders || [];
    if (leaders[0]) return rowToPlaqueFields(leaders[0]);
  } else {
    const cached = lastCategoryResults.get(id);
    if (cached?.leaders?.[0]) return rowToPlaqueFields(cached.leaders[0]);
  }

  const athletes = getAthletesForCategory(id);
  const byPlace = athletes.find((row) => Number(row.место ?? row.place) === 1);
  return rowToPlaqueFields(byPlace || athletes[0] || null);
}

function pickRandomPlaqueFields(categoryId) {
  const athletes = getAthletesForCategory(categoryId);
  if (!athletes.length) return null;
  const nonLeaders = athletes.filter((row) => Number(row.место ?? row.place) !== 1);
  const pool = nonLeaders.length ? nonLeaders : athletes;
  const row = pool[Math.floor(Math.random() * pool.length)];
  return rowToPlaqueFields(row);
}

function lapDetailToEvent(categoryId, row, index) {
  const splitTime = row.totalTime ?? '';
  const place = row.groupRacePosition ?? '1';
  return {
    id: `replay-${categoryId}-${index}-${row.номер}-${row.lapNumber}`,
    place,
    number: row.номер ?? '',
    name: participantToOverlayName(row.участник),
    gap: resolvePlaqueGap(
      {
        totalTime: splitTime,
        leaderDifference: row.leaderDifference,
        place,
        gap: row.leaderDifference,
      },
      getLapsMode()
    ),
    lapNumber: row.lapNumber ?? '',
    splitTime,
    at: new Date(Date.now() + index).toISOString(),
    categoryId,
  };
}

function getCategoryTotalLaps(category) {
  const value = Number(category?.totalLaps);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function syncLapTrackerFromConfig() {
  const event = getActiveEvent();
  if (!event) return;
  for (const category of event.categories) {
    lapTracker.setTotalLaps(category.id, getCategoryTotalLaps(category));
  }
}

function handleLapPollResult(categoryId, result) {
  if (dataFrozen || !result) return;
  if (result.plaqueEvents?.length) {
    broadcastLapEvents(result.plaqueEvents);
  }
}

async function saveExcel(event, categoryResults) {
  if (!event) return null;

  const categories = event.categories.map((category) => {
    const result = categoryResults.get(category.id);
    return {
      sheetName: category.name,
      rows: result?.displayList ?? [],
    };
  });

  const activeCategory = getActiveCategory(event);
  const broadcastRows = activeCategory
    ? [lapStateToArray(activeCategory.name, lapTracker.getLapState(activeCategory.id))]
    : [];

  try {
    const exportResult = await exportDataFile(categories, EXPORTS_DIR, broadcastRows);
    raceData.lastExport = exportResult;
    return exportResult;
  } catch (err) {
    if (err.code === 'EBUSY') {
      console.warn('data.xlsx занят — закройте файл в Excel');
      return null;
    }
    throw err;
  }
}

async function refreshData() {
  if (isHttpSource()) {
    return showCachedActiveCategory();
  }
  if (isFetching) return raceData;
  isFetching = true;

  const event = getActiveEvent();
  const activeCategory = getActiveCategory(event);
  if (!event || !activeCategory) {
    raceData.lastError = 'Event or category not found in config';
    isFetching = false;
    return raceData;
  }

  try {
    const fetched = await Promise.all(
      event.categories.map(async (category) => {
        if (isHttpSource()) return { category, raw: null };
        try {
          const raw = await fetchCategoryRaw(event, category);
          return { category, raw };
        } catch (err) {
          if (isHttpSource()) return { category, raw: null };
          console.error(`${category.name}: ${err.message || err}`);
          return { category, raw: null };
        }
      })
    );

    if (isHttpSource()) {
      return showCachedActiveCategory();
    }

    let appliedActive = false;
    for (const { category, raw } of fetched) {
      if (!raw) continue;
      if (isHttpSource()) break;
      await applyCategoryRaw(category.id, raw, { skipExcel: true });
      if (category.id === activeCategory.id) appliedActive = true;
    }

    if (isHttpSource()) {
      return showCachedActiveCategory();
    }

    if (!appliedActive) {
      raceData.lastError = `Failed to load ${activeCategory.name}`;
    }

    if (isExcelExportEnabled()) {
      await saveExcel(event, lastCategoryResults);
      if (dataFrozen && frozenSnapshot) {
        frozenSnapshot.lastExport = raceData.lastExport;
      }
    }
  } catch (err) {
    if (!isHttpSource()) {
      console.error(err.message || err);
      raceData.lastError = err.message || String(err);
    }
  } finally {
    isFetching = false;
  }

  return raceData;
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling() {
  stopPolling();
  if (isHttpSource()) {
    console.log('[race] Limetime poll stopped');
    return;
  }
  pollTimer = setInterval(refreshData, config.pollIntervalMs || 5000);
  console.log(`[race] Limetime poll every ${config.pollIntervalMs || 5000} ms`);
}

async function onConfigSaved() {
  syncLapTrackerFromConfig();
  startPolling();
  if (isHttpSource()) {
    showCachedActiveCategory();
    return;
  }
  await refreshData();
}

app.use(
  createSetupRoutes({
    getConfig: () => config,
    getListenConfig: getActualListen,
    getIngestUrls,
    beginConfigUpdate: reloadConfigFromDisk,
    saveConfig,
    onConfigSaved,
  })
);

app.get('/config', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'config.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/config', (req, res) => {
  const event = getActiveEvent();
  const display = getDisplayData();
  const setup = buildSetupView(config);
  const activeCategorySetup = setup.categories.find((c) => c.id === config.activeCategoryId);
  res.json({
    activeEventId: config.activeEventId,
    activeCategoryId: config.activeCategoryId,
    activeCategoryUrl: activeCategorySetup?.url || '',
    pollIntervalMs: config.pollIntervalMs,
    dataFrozen,
    events: config.events.map((e) => ({
      id: e.id,
      name: e.name,
      categories: e.categories.map((c) => ({ id: c.id, name: c.name })),
    })),
    activeEventName: event?.name || '',
    mode: display.mode,
    liveMode: raceData.mode,
    lastUpdated: raceData.lastUpdated,
    frozenAt: dataFrozen ? frozenSnapshot?.lastUpdated || null : null,
    lastError: raceData.lastError,
    lastExport: raceData.lastExport,
    resultCount: display.displayList?.length ?? 0,
    lapState: lapTracker.getLapState(config.activeCategoryId),
    totalLaps: getCategoryTotalLaps(getActiveCategory(event)),
    lapsMode: getLapsMode(),
    lapsFonts: getLapsFonts(),
    hideTeamWord: isHideTeamWord(),
    excelExportEnabled: isExcelExportEnabled(),
    flowerCeremony: isFlowerCeremony(),
    breakAfterBullet: isBreakAfterBullet(),
    numberTrim: getNumberTrim(),
    dataSource: getDataSource(),
    ingestDebug: config.ingest?.debug === true,
    server: {
      host: config.server?.host || '0.0.0.0',
      port: Number(config.server?.port) || 3000,
    },
    listen: getActualListen(),
    ingestUrls: getIngestUrls(),
    lastIngestAt,
    lastIngestCount,
  });
});

app.get('/api/race', (req, res) => {
  const { host, port } = getActualListen();
  res.json({
    success: true,
    dataSource: getDataSource(),
    lastIngestAt,
    lastCount: lastIngestCount,
    lastCategoryId: lastIngestCategoryId,
    lastUpdated: raceData.lastUpdated,
    listen: { host, port },
    ingestUrls: getIngestUrls(),
  });
});

app.post('/api/race', async (req, res) => {
  const receivedAt = new Date().toISOString();
  try {
    const parsed = parseRacePayload(req.body, req.query, config);
    console.log(`[race] ${receivedAt} category=${parsed.categoryId} count=${parsed.count}`);

    if (parsed.count === 0 && lastCategoryResults.has(parsed.categoryId)) {
      lastIngestAt = receivedAt;
      lastIngestCount = 0;
      lastIngestCategoryId = parsed.categoryId;
      dumpLastRacePayload(req.body);
      console.log(`[race] empty payload kept previous state for ${parsed.categoryId}`);
      res.json({
        success: true,
        categoryId: parsed.categoryId,
        count: lastCategoryResults.get(parsed.categoryId)?.rawCount ?? 0,
        skipped: 'empty',
      });
      return;
    }

    await applyCategoryRaw(parsed.categoryId, parsed.athletes);
    lastIngestAt = receivedAt;
    lastIngestCount = parsed.count;
    lastIngestCategoryId = parsed.categoryId;
    dumpLastRacePayload(req.body);
    console.log(
      `[race] ok category=${parsed.categoryId} count=${parsed.count} updated=${raceData.lastUpdated}`
    );
    res.json({
      success: true,
      categoryId: parsed.categoryId,
      count: parsed.count,
    });
  } catch (err) {
    if (err instanceof RaceAdapterError) {
      console.warn(`[race] validation ${err.status}: ${err.message}`);
      res.status(err.status).json({ success: false, error: err.message });
      return;
    }
    console.error('[race] processing error', err.message || err);
    raceData.lastError = err.message || String(err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

app.post('/api/freeze', (req, res) => {
  const frozen = !!req.body?.frozen;
  dataFrozen = frozen;
  if (frozen) {
    frozenSnapshot = cloneData(raceData);
    pushResultsToVmix(frozenSnapshot);
  } else {
    frozenSnapshot = null;
    vmixPusher.resetCache();
    pushResultsToVmix(raceData);
  }
  res.json({
    ok: true,
    dataFrozen,
    frozenAt: frozenSnapshot?.lastUpdated || null,
    mode: getDisplayData().mode,
  });
});

app.post('/api/category', async (req, res) => {
  const { eventId, categoryId } = req.body;
  updateConfig((cfg) => {
    if (eventId) cfg.activeEventId = eventId;
    if (categoryId) cfg.activeCategoryId = categoryId;
  }, 'category');
  if (categoryId) {
    lapTracker.initCategory(categoryId);
    vmixPusher.resetCache();
    const cat = getActiveCategory(getActiveEvent());
    if (cat) lapTracker.setTotalLaps(categoryId, getCategoryTotalLaps(cat));
  }
  await refreshData();
  res.json({
    ok: true,
    mode: getDisplayData().mode,
    count: getDisplayData().displayList.length,
  });
});

app.post('/sheet1', (req, res) => {
  res.send(getDisplayData().displayList);
});

app.post('/export', async (req, res) => {
  try {
    await refreshData();
    if (isHttpSource()) {
      const event = getActiveEvent();
      if (event) {
        await saveExcel(event, lastCategoryResults);
      }
    }
    res.json({ ok: true, export: raceData.lastExport });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

app.post('/api/data-source', async (req, res) => {
  const requested = req.body?.dataSource;
  if (requested !== 'limetime' && requested !== 'http') {
    res.status(400).json({ ok: false, error: 'dataSource must be "limetime" or "http"' });
    return;
  }
  try {
    updateConfig((cfg) => {
      applyIngestSettings(cfg, { dataSource: requested });
    }, 'data-source');
    startPolling();
    if (isHttpSource()) {
      showCachedActiveCategory();
    } else {
      await refreshData();
    }
    res.json({ ok: true, dataSource: getDataSource() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || String(err) });
  }
});

app.post('/api/ingest-debug', (req, res) => {
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ ok: false, error: 'enabled must be a boolean' });
    return;
  }
  try {
    updateConfig((cfg) => {
      applyIngestSettings(cfg, { ingestDebug: enabled });
    }, 'ingest-debug');
    res.json({ ok: true, ingestDebug: config.ingest?.debug === true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || String(err) });
  }
});

app.post('/api/server', (req, res) => {
  const host = req.body?.host;
  const port = req.body?.port;
  if (host == null && port == null) {
    res.status(400).json({ ok: false, error: 'Expected host and/or port' });
    return;
  }
  try {
    updateConfig((cfg) => {
      applyIngestSettings(cfg, { server: { host, port } });
    }, 'server');
    const nextHost = config.server?.host || '0.0.0.0';
    const nextPort = Number(config.server?.port) || 3000;
    const nextListen = getListenConfig();
    const current = getActualListen();
    const restartRequired = current.host !== nextListen.host || current.port !== nextListen.port;
    res.json({
      ok: true,
      server: { host: nextHost, port: nextPort },
      listen: current,
      restartRequired,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || String(err) });
  }
});

app.post('/api/excel-export', (req, res) => {
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ ok: false, error: 'enabled must be a boolean' });
    return;
  }
  updateConfig((cfg) => {
    cfg.excelExportEnabled = enabled;
  }, 'excel-export');
  res.json({ ok: true, excelExportEnabled: isExcelExportEnabled() });
});

app.post('/api/flower-ceremony', (req, res) => {
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ ok: false, error: 'enabled must be a boolean' });
    return;
  }
  updateConfig((cfg) => {
    if (!cfg.vmix) cfg.vmix = {};
    cfg.vmix.flowerCeremony = enabled;
  }, 'flower-ceremony');
  vmixPusher.resetCache();
  pushResultsToVmix(getDisplayData());
  res.json({ ok: true, flowerCeremony: isFlowerCeremony() });
});

app.post('/api/break-after-bullet', (req, res) => {
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ ok: false, error: 'enabled must be a boolean' });
    return;
  }
  updateConfig((cfg) => {
    if (!cfg.vmix) cfg.vmix = {};
    cfg.vmix.breakAfterBullet = enabled;
  }, 'break-after-bullet');
  vmixPusher.resetCache();
  pushResultsToVmix(getDisplayData());
  res.json({ ok: true, breakAfterBullet: isBreakAfterBullet() });
});

app.post('/api/number-trim', (req, res) => {
  const requested = req.body?.mode;
  const mode = normalizeNumberTrim(requested);
  if (requested !== mode) {
    res.status(400).json({
      ok: false,
      error: 'mode must be none, tenths, hundredths, thousandths or tenThousandths',
    });
    return;
  }
  updateConfig((cfg) => {
    if (!cfg.vmix) cfg.vmix = {};
    cfg.vmix.numberTrim = mode;
  }, 'number-trim');
  vmixPusher.resetCache();
  pushResultsToVmix(getDisplayData());
  res.json({ ok: true, numberTrim: getNumberTrim() });
});

app.post('/updateData', async (req, res) => {
  await refreshData();
  res.json({ ok: true, mode: getDisplayData().mode, count: getDisplayData().displayList.length });
});

app.post('/row1', (req, res) => {
  const startIndex = Number(req.body.index) || 0;
  const event = getActiveEvent();
  const meta = buildVmixMeta(event, getActiveCategory(event));
  vmixPusher.pushManualPage(config, req.body.item || [], startIndex, 'result', meta);
  vmixPusher.pushManualPage(config, req.body.item || [], startIndex, 'startlist', meta);
  res.status(200).send(startIndex.toString());
});

app.get('/laps', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'laps.html'));
});

app.get('/api/laps/stream', (req, res) => {
  const categoryId = resolveCategoryId(req.query.categoryId);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const client = { res, categoryId };
  sseClients.push(client);

  req.on('close', () => {
    const idx = sseClients.indexOf(client);
    if (idx >= 0) sseClients.splice(idx, 1);
  });
});

app.get('/api/laps/recent', (req, res) => {
  const categoryId = resolveCategoryId(req.query.categoryId);
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({
    ok: true,
    dataFrozen,
    lapsMode: getLapsMode(),
    fonts: getLapsFonts(),
    hideTeamWord: isHideTeamWord(),
    numberTrim: getNumberTrim(),
    lapState: lapTracker.getLapState(categoryId),
    events: dataFrozen ? [] : lapTracker.getRecentEvents(categoryId, limit),
  });
});

app.get('/api/laps/status', (req, res) => {
  const categoryId = resolveCategoryId(req.query.categoryId);
  const events = lapTracker.getRecentEvents(categoryId, 1);
  res.json({
    ok: true,
    dataFrozen,
    categoryId,
    lapsMode: getLapsMode(),
    fonts: getLapsFonts(),
    hideTeamWord: isHideTeamWord(),
    numberTrim: getNumberTrim(),
    lapState: lapTracker.getLapState(categoryId),
    lastEvent: events.length ? events[events.length - 1] : null,
  });
});

app.post('/api/laps/mode', (req, res) => {
  const mode = req.body?.mode;
  if (mode !== 'leader' && mode !== 'all') {
    res.status(400).json({ ok: false, error: 'mode must be "leader" or "all"' });
    return;
  }
  updateConfig((cfg) => {
    if (!cfg.laps) cfg.laps = {};
    cfg.laps.mode = mode;
  }, 'laps/mode');
  res.json({ ok: true, lapsMode: getLapsMode() });
});

app.post('/api/laps/hide-team-word', (req, res) => {
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ ok: false, error: 'enabled must be a boolean' });
    return;
  }
  updateConfig((cfg) => {
    if (!cfg.laps) cfg.laps = {};
    cfg.laps.hideTeamWord = enabled;
  }, 'laps/hide-team-word');
  res.json({ ok: true, hideTeamWord: isHideTeamWord() });
});

app.post('/api/laps/fonts', (req, res) => {
  const body = req.body || {};
  updateConfig((cfg) => {
    if (!cfg.laps) cfg.laps = {};
    const fonts = cfg.laps.fonts || {};
    const current = {
      base: clampFontSize(fonts.base, DEFAULT_LAPS_FONTS.base),
      name: clampFontSize(fonts.name, DEFAULT_LAPS_FONTS.name),
      number: clampFontSize(fonts.number, DEFAULT_LAPS_FONTS.number),
    };
    cfg.laps.fonts = {
      base: body.base != null ? clampFontSize(body.base, current.base) : current.base,
      name: body.name != null ? clampFontSize(body.name, current.name) : current.name,
      number: body.number != null ? clampFontSize(body.number, current.number) : current.number,
    };
  }, 'laps/fonts');
  res.json({ ok: true, fonts: getLapsFonts() });
});

app.post('/api/laps/simulate-leader', (req, res) => {
  if (dataFrozen) {
    res.status(409).json({ ok: false, error: 'Data is frozen' });
    return;
  }
  const categoryId = resolveCategoryId(req.body?.categoryId);
  const body = { ...(req.body || {}) };
  if (!body.name && !body.number && !body.leaderName && !body.leaderNumber) {
    const fromCategory = pickLeaderPlaqueFields(categoryId);
    if (!fromCategory) {
      res.status(400).json({
        ok: false,
        error: 'Нет участников загруженной категории — проверьте настройки и обновите данные',
      });
      return;
    }
    Object.assign(body, fromCategory);
  }
  const result = lapTracker.simulateLeaderLap(categoryId, body, getLapsMode());
  handleLapPollResult(categoryId, result);
  res.json({
    ok: true,
    event: result.plaqueEvents?.[0] || null,
    lapState: lapTracker.getLapState(categoryId),
    counterUpdated: result.counterUpdated,
  });
});

app.post('/api/laps/total-laps', (req, res) => {
  const categoryId = resolveCategoryId(req.body?.categoryId);
  const totalLaps = Number(req.body?.totalLaps);
  if (!Number.isFinite(totalLaps) || totalLaps < 1) {
    res.status(400).json({ ok: false, error: 'totalLaps must be a positive number' });
    return;
  }

  const event = getActiveEvent();
  const category = event?.categories.find((c) => c.id === categoryId);
  if (!category) {
    res.status(404).json({ ok: false, error: 'Category not found' });
    return;
  }

  updateConfig((cfg) => {
    const ev = cfg.events.find((e) => e.id === cfg.activeEventId) || cfg.events[0];
    const cat = ev?.categories.find((c) => c.id === categoryId);
    if (cat) cat.totalLaps = totalLaps;
  }, 'laps/total-laps');
  lapTracker.setTotalLaps(categoryId, totalLaps);

  res.json({
    ok: true,
    categoryId,
    totalLaps,
    lapState: lapTracker.getLapState(categoryId),
  });
});

app.post('/api/laps/reset', (req, res) => {
  const categoryId = resolveCategoryId(req.query.categoryId || req.body?.categoryId);
  lapTracker.initCategory(categoryId);
  res.json({ ok: true, categoryId, lapState: lapTracker.getLapState(categoryId) });
});

app.post('/api/laps/simulate', (req, res) => {
  if (dataFrozen) {
    res.status(409).json({ ok: false, error: 'Data is frozen' });
    return;
  }
  const categoryId = resolveCategoryId(req.body?.categoryId);
  const body = { ...(req.body || {}) };
  if (!body.name && !body.number) {
    const fromCategory = pickRandomPlaqueFields(categoryId);
    if (!fromCategory) {
      res.status(400).json({
        ok: false,
        error: 'Нет участников загруженной категории — проверьте настройки и обновите данные',
      });
      return;
    }
    Object.assign(body, fromCategory);
  }
  if (body.lapNumber == null || body.lapNumber === '') {
    const lapState = lapTracker.getLapState(categoryId);
    body.lapNumber = lapState.completedLap || 1;
  }
  const event = lapTracker.addManualEvent(categoryId, body, getLapsMode());
  broadcastLapEvent(event);
  res.json({ ok: true, event });
});

app.post('/api/laps/replay', (req, res) => {
  if (dataFrozen) {
    res.status(409).json({ ok: false, error: 'Data is frozen' });
    return;
  }

  const categoryId = resolveCategoryId(req.query.categoryId || req.body?.categoryId);
  const delayMs = Number(req.query.delayMs || req.body?.delayMs) || 800;

  if (replayTimer) {
    clearTimeout(replayTimer);
    replayTimer = null;
  }

  const rows = [...(raceData.lapDetails || [])];
  if (!rows.length) {
    res.status(400).json({ ok: false, error: 'No lap data loaded for active category' });
    return;
  }

  res.json({ ok: true, count: rows.length, categoryId });

  let index = 0;
  function playNext() {
    if (index >= rows.length) {
      replayTimer = null;
      return;
    }
    const event = lapDetailToEvent(categoryId, rows[index], index);
    index += 1;
    deliverLapEvent(event);
    replayTimer = setTimeout(playNext, delayMs);
  }

  playNext();
});

app.get('/api/vmix/preview', (req, res) => {
  const event = getActiveEvent();
  const activeCategory = getActiveCategory(event);
  const display = getDisplayData();
  const startlists = buildCategoryStartlists(event, lastCategoryResults);
  const payload = buildVmixPayload(
    config,
    { ...display, meta: buildVmixMeta(event, activeCategory) },
    startlists
  );
  res.json({
    ok: true,
    inputs: groupPayloadByInput(payload),
  });
});

app.get('/api/vmix/templates', (req, res) => {
  res.json({
    ok: true,
    ...getTemplatesView(config),
  });
});

app.post('/api/vmix/templates', (req, res) => {
  const body = { ...(req.body || {}) };
  // SelectedName maps are owned by /api/vmix/field-mapping — never accept them here,
  // even from an old browser tab that still posts indexedFields/singleFields.
  delete body.indexedFields;
  delete body.singleFields;

  const error = validateTemplatesUpdate(body);
  if (error) {
    res.status(400).json({ ok: false, error });
    return;
  }
  updateConfig((cfg) => {
    applyTemplatesUpdate(cfg, body);
  }, 'vmix/templates');
  vmixPusher.resetCache();
  const view = getTemplatesView(config);
  console.log('[vmix/templates] updated, resultsPage=%s, startlistPage=%s', view.templates.resultsPage, view.templates.startlistPage);
  res.json({
    ok: true,
    ...view,
  });
});

app.get('/api/vmix/field-mapping', (req, res) => {
  const plaques = buildPlaquesView(config);
  res.json({
    ok: true,
    plaques,
    availableSourceFields: AVAILABLE_SOURCE_FIELDS,
    defaultMapping: DEFAULT_FIELD_MAPPING,
  });
});

app.post('/api/vmix/field-mapping', (req, res) => {
  const plaques = req.body?.plaques;
  if (!Array.isArray(plaques)) {
    res.status(400).json({ ok: false, error: 'Expected { plaques: [...] }' });
    return;
  }
  updateConfig((cfg) => {
    applyPlaquesToConfig(cfg, plaques, {
      indexedFields: req.body?.indexedFields,
      singleFields: req.body?.singleFields,
      fieldMapping: req.body?.fieldMapping,
    });
  }, 'vmix/field-mapping');
  vmixPusher.resetCache();
  res.json({
    ok: true,
    plaques: buildPlaquesView(config),
  });
});

app.post('/vmixCommand', (req, res) => {
  const command = req.body.data;
  const event = getActiveEvent();
  vmixPusher.pushWinnerOverlay(
    config,
    command,
    getDisplayData(),
    buildVmixMeta(event, getActiveCategory(event))
  );
  res.send('ok');
});

app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    console.warn('[race] invalid JSON', err.message || err);
    res.status(400).json({ success: false, error: 'Invalid JSON' });
    return;
  }
  next(err);
});

initVmix();
syncLapTrackerFromConfig();
const listen = getListenConfig();
actualListen = listen;
const boot = isHttpSource() ? restoreIngestSnapshot() : refreshData();
boot.then(() => {
  startPolling();
  const httpServer = app.listen(listen.port, listen.host, () => {
    console.log(`VELO running on http://${listen.host}:${listen.port}`);
    ensureInboundFirewall(listen.port);
    const urls = getIngestUrls();
    if (urls.length) {
      console.log(`[race] адрес для судей: ${urls.join(', ')}`);
    } else {
      console.log(`[race] dataSource=${getDataSource()} POST /api/race`);
    }
  });
  httpServer.on('error', (err) => {
    console.error(`[race] listen failed on ${listen.host}:${listen.port}:`, err.message || err);
    process.exit(1);
  });
});
