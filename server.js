const fs = require('fs');
const path = require('path');
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
const { resolveVmixConfig } = require('./lib/vmixConfig');
const { buildSetupView } = require('./lib/configEditor');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const EXPORTS_DIR = path.join(__dirname, 'exports');
const PORT = process.env.PORT || '3000';

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let config = loadConfig();
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

const vmixPusher = createVmixPusher(() => ({
  connected: vmixConnected,
  client: connection,
  onError: () => {
    vmixConnected = false;
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
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function saveConfig(newConfig) {
  if (newConfig) {
    config = newConfig;
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function getActiveEvent() {
  return config.events.find((e) => e.id === config.activeEventId);
}

function getActiveCategory(event) {
  if (!event) return null;
  return event.categories.find((c) => c.id === config.activeCategoryId);
}

function initVmix() {
  if (connection) return;
  connection = new ConnectionTCP(config.vmix?.host || 'localhost');
  connection.on('connect', () => {
    vmixConnected = true;
    console.log('vMix Connected!');
  });
  connection.on('error', () => {
    vmixConnected = false;
  });
}

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
  return fetchResults(
    config.limetime,
    event.raceGuid,
    category.stageGuid,
    category.categoryGuid
  );
}

async function fetchCategoryData(event, category) {
  const raw = await fetchCategoryRaw(event, category);
  return { raw, transformed: transformResults(raw) };
}

function resolveCategoryId(requestedId) {
  return requestedId || config.activeCategoryId;
}

function getLapsMode() {
  return config.laps?.mode === 'all' ? 'all' : 'leader';
}

function isExcelExportEnabled() {
  return config.excelExportEnabled !== false;
}

function isFlowerCeremony() {
  return config.vmix?.flowerCeremony !== false;
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
  if (isFetching) return raceData;
  isFetching = true;

  const event = getActiveEvent();
  const activeCategory = getActiveCategory(event);
  if (!event || !activeCategory) {
    raceData.lastError = 'Event or category not found in config';
    isFetching = false;
    return raceData;
  }

  const categoryResults = new Map();

  try {
    const categoryRaw = new Map();

    await Promise.all(
      event.categories.map(async (category) => {
        try {
          const { raw, transformed } = await fetchCategoryData(event, category);
          categoryRaw.set(category.id, raw);
          categoryResults.set(category.id, transformed);
        } catch (err) {
          console.error(`${category.name}: ${err.message || err}`);
        }
      })
    );

    const activeData = categoryResults.get(activeCategory.id);
    const activeRaw = categoryRaw.get(activeCategory.id);
    if (activeData) {
      raceData = {
        ...activeData,
        lastUpdated: new Date().toISOString(),
        lastError: null,
        lastExport: raceData.lastExport,
      };

      if (dataFrozen && frozenSnapshot) {
        frozenSnapshot.lastExport = raceData.lastExport;
      }

      lastCategoryResults = categoryResults;
      pushResultsToVmix(getDisplayData(), categoryResults);

      if (!dataFrozen) {
        for (const category of event.categories) {
          const raw = categoryRaw.get(category.id);
          if (!raw) continue;
          const result = lapTracker.processRawAthletes(
            category.id,
            raw,
            getCategoryTotalLaps(category),
            getLapsMode()
          );
          if (category.id === activeCategory.id) {
            handleLapPollResult(category.id, result);
          }
        }
      }
    } else {
      raceData.lastError = `Failed to load ${activeCategory.name}`;
    }

    if (isExcelExportEnabled()) {
      await saveExcel(event, categoryResults);
    }
  } catch (err) {
    console.error(err.message || err);
    raceData.lastError = err.message || String(err);
  } finally {
    isFetching = false;
  }

  return raceData;
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refreshData, config.pollIntervalMs || 5000);
}

async function onConfigSaved() {
  syncLapTrackerFromConfig();
  startPolling();
  await refreshData();
}

app.use(
  createSetupRoutes({
    getConfig: () => config,
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
    excelExportEnabled: isExcelExportEnabled(),
    flowerCeremony: isFlowerCeremony(),
  });
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
  if (eventId) config.activeEventId = eventId;
  if (categoryId) {
    config.activeCategoryId = categoryId;
    lapTracker.initCategory(categoryId);
    vmixPusher.resetCache();
    const cat = getActiveCategory(getActiveEvent());
    if (cat) lapTracker.setTotalLaps(categoryId, getCategoryTotalLaps(cat));
  }
  saveConfig();
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
    res.json({ ok: true, export: raceData.lastExport });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

app.post('/api/excel-export', (req, res) => {
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ ok: false, error: 'enabled must be a boolean' });
    return;
  }
  config.excelExportEnabled = enabled;
  saveConfig();
  res.json({ ok: true, excelExportEnabled: isExcelExportEnabled() });
});

app.post('/api/flower-ceremony', (req, res) => {
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ ok: false, error: 'enabled must be a boolean' });
    return;
  }
  if (!config.vmix) config.vmix = {};
  config.vmix.flowerCeremony = enabled;
  saveConfig();
  vmixPusher.resetCache();
  pushResultsToVmix(getDisplayData());
  res.json({ ok: true, flowerCeremony: isFlowerCeremony() });
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
  if (!config.laps) config.laps = {};
  config.laps.mode = mode;
  saveConfig();
  res.json({ ok: true, lapsMode: getLapsMode() });
});

app.post('/api/laps/simulate-leader', (req, res) => {
  if (dataFrozen) {
    res.status(409).json({ ok: false, error: 'Data is frozen' });
    return;
  }
  const categoryId = resolveCategoryId(req.body?.categoryId);
  const result = lapTracker.simulateLeaderLap(categoryId, req.body || {}, getLapsMode());
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

  category.totalLaps = totalLaps;
  saveConfig();
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
  const event = lapTracker.addManualEvent(categoryId, req.body || {}, getLapsMode());
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
  const error = validateTemplatesUpdate(req.body || {});
  if (error) {
    res.status(400).json({ ok: false, error });
    return;
  }
  applyTemplatesUpdate(config, req.body || {});
  saveConfig();
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
  applyPlaquesToConfig(config, plaques);
  saveConfig();
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

initVmix();
syncLapTrackerFromConfig();
refreshData().then(() => {
  startPolling();
  app.listen(PORT, () => {
    console.log(`Limetime parser running on http://localhost:${PORT}`);
  });
});
