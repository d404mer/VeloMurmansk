const fs = require('fs');
const path = require('path');
const express = require('express');
const { ConnectionTCP } = require('node-vmix');
const { fetchResults } = require('./lib/limetime');
const { transformResults } = require('./lib/transform');
const { exportDataFile } = require('./lib/excelExport');
const { createSetupRoutes } = require('./lib/setupRoutes');
const { createLapTracker } = require('./lib/lapTracker');
const { createVmixPusher } = require('./lib/vmixPush');

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

function pushResultsToVmix(data) {
  vmixPusher.pushAll(config, data);
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
  return {
    id: `replay-${categoryId}-${index}-${row.номер}-${row.lapNumber}`,
    place: row.groupRacePosition ?? '',
    number: row.номер ?? '',
    name: participantToOverlayName(row.участник),
    gap: row.leaderDifference ?? '',
    lapNumber: row.lapNumber ?? '',
    at: new Date(Date.now() + index).toISOString(),
    categoryId,
  };
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

  try {
    const exportResult = await exportDataFile(categories, EXPORTS_DIR);
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

      pushResultsToVmix(getDisplayData());

      if (activeRaw && !dataFrozen) {
        const newLapEvents = lapTracker.processRawAthletes(activeCategory.id, activeRaw);
        broadcastLapEvents(newLapEvents);
      }
    } else {
      raceData.lastError = `Failed to load ${activeCategory.name}`;
    }

    await saveExcel(event, categoryResults);
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
  res.json({
    activeEventId: config.activeEventId,
    activeCategoryId: config.activeCategoryId,
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

app.post('/updateData', async (req, res) => {
  await refreshData();
  res.json({ ok: true, mode: getDisplayData().mode, count: getDisplayData().displayList.length });
});

app.post('/row1', (req, res) => {
  const startIndex = req.body.index;
  res.status(200).send(startIndex.toString());
  vmixPusher.pushManualPage(config, req.body.item || [], startIndex, 'result');
  vmixPusher.pushManualPage(config, req.body.item || [], startIndex, 'startlist');
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
    events: dataFrozen ? [] : lapTracker.getRecentEvents(categoryId, limit),
  });
});

app.post('/api/laps/simulate', (req, res) => {
  if (dataFrozen) {
    res.status(409).json({ ok: false, error: 'Data is frozen' });
    return;
  }
  const categoryId = resolveCategoryId(req.body?.categoryId);
  const event = lapTracker.addManualEvent(categoryId, req.body || {});
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

app.post('/vmixCommand', (req, res) => {
  const command = req.body.data;
  vmixPusher.pushWinnerOverlay(config, command, getDisplayData());
  res.send('ok');
});

initVmix();
refreshData().then(() => {
  startPolling();
  app.listen(PORT, () => {
    console.log(`Limetime parser running on http://localhost:${PORT}`);
  });
});
