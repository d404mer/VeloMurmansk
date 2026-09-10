const fs = require('fs');
const path = require('path');

const INGEST_DIR = path.join(__dirname, '..', 'data', 'ingest');
const STATE_PATH = path.join(INGEST_DIR, 'state.json');
const LEGACY_CACHE_PATH = path.join(__dirname, '..', 'debug', 'ingest-cache.json');
const LEGACY_DUMP_PATH = path.join(__dirname, '..', 'debug', 'last-race.json');

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

function safeCategoryId(categoryId) {
  const id = String(categoryId || '').trim();
  if (!id) return '';
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function categoryFilePath(categoryId) {
  const id = safeCategoryId(categoryId);
  if (!id) return null;
  return path.join(INGEST_DIR, `${id}.json`);
}

function listSavedCategoryIds() {
  try {
    if (!fs.existsSync(INGEST_DIR)) return [];
    return fs
      .readdirSync(INGEST_DIR)
      .filter((name) => name.endsWith('.json') && name !== 'state.json' && !name.endsWith('.results.json'))
      .map((name) => name.slice(0, -5));
  } catch (_) {
    return [];
  }
}

function loadState() {
  const state = readJsonIfExists(STATE_PATH);
  return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
}

function saveState(partial) {
  const prev = loadState();
  writeJsonAtomic(STATE_PATH, {
    ...prev,
    ...partial,
    savedAt: new Date().toISOString(),
  });
}

function loadCategoryAthletes(categoryId) {
  const filePath = categoryFilePath(categoryId);
  if (!filePath) return null;
  const data = readJsonIfExists(filePath);
  return Array.isArray(data) && data.length ? data : null;
}

function saveCategoryAthletes(categoryId, athletes) {
  if (!Array.isArray(athletes) || athletes.length === 0) {
    return { written: false, reason: 'empty' };
  }
  const filePath = categoryFilePath(categoryId);
  if (!filePath) return { written: false, reason: 'invalid-id' };

  const next = JSON.stringify(athletes);
  const prev = readJsonIfExists(filePath);
  if (Array.isArray(prev) && JSON.stringify(prev) === next) {
    return { written: false, reason: 'unchanged' };
  }

  writeJsonAtomic(filePath, athletes);
  return { written: true };
}

function resultsFilePath(categoryId) {
  const id = safeCategoryId(categoryId);
  if (!id) return null;
  return path.join(INGEST_DIR, `${id}.results.json`);
}

/** Persist transformed race lists (start/live/final/display) for the active snapshot. */
function saveCategoryResults(categoryId, results) {
  if (!results || typeof results !== 'object') {
    return { written: false, reason: 'empty' };
  }
  const filePath = resultsFilePath(categoryId);
  if (!filePath) return { written: false, reason: 'invalid-id' };

  const payload = {
    savedAt: new Date().toISOString(),
    categoryId: String(categoryId),
    mode: results.mode || null,
    rawCount: results.rawCount ?? null,
    startList: results.startList || [],
    liveList: results.liveList || [],
    finalList: results.finalList || [],
    displayList: results.displayList || [],
    leaders: results.leaders || [],
    lapDetails: results.lapDetails || [],
    standings: results.standings || null,
  };

  const next = JSON.stringify(payload);
  const prev = readJsonIfExists(filePath);
  if (prev && JSON.stringify(prev) === next) {
    return { written: false, reason: 'unchanged' };
  }

  writeJsonAtomic(filePath, payload);
  return { written: true };
}

function loadCategoryResults(categoryId) {
  const filePath = resultsFilePath(categoryId);
  if (!filePath) return null;
  const data = readJsonIfExists(filePath);
  return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
}

function migrateFromLegacyIfNeeded() {
  if (listSavedCategoryIds().length) return false;

  const cache = readJsonIfExists(LEGACY_CACHE_PATH);
  let categories = cache?.categories;
  let meta = cache || {};

  if (!categories || typeof categories !== 'object') {
    const dump = readJsonIfExists(LEGACY_DUMP_PATH);
    if (dump?.isSuccess === true && Array.isArray(dump.data) && dump.data.length) {
      const categoryId = dump.categoryId || 'men';
      categories = { [categoryId]: dump.data };
      meta = { lastIngestCategoryId: categoryId };
    }
  }

  if (!categories || typeof categories !== 'object') return false;

  let migrated = 0;
  for (const [categoryId, athletes] of Object.entries(categories)) {
    const result = saveCategoryAthletes(categoryId, athletes);
    if (result.written) migrated += 1;
  }
  if (!migrated) return false;

  saveState({
    lastIngestAt: meta.lastIngestAt || meta.savedAt || null,
    lastIngestCount: meta.lastIngestCount ?? null,
    lastIngestCategoryId: meta.lastIngestCategoryId || null,
    lastUpdated: meta.lastUpdated || null,
    categoryIds: listSavedCategoryIds(),
  });
  console.log(`[race] migrated ${migrated} categor${migrated === 1 ? 'y' : 'ies'} from debug/ to data/ingest`);
  return true;
}

function loadAll() {
  migrateFromLegacyIfNeeded();
  const state = loadState();
  const categories = {};
  for (const categoryId of listSavedCategoryIds()) {
    const athletes = loadCategoryAthletes(categoryId);
    if (athletes) categories[categoryId] = athletes;
  }
  return {
    lastIngestAt: state.lastIngestAt || state.savedAt || null,
    lastIngestCount: state.lastIngestCount ?? null,
    lastIngestCategoryId: state.lastIngestCategoryId || null,
    lastUpdated: state.lastUpdated || null,
    categories,
  };
}

module.exports = {
  INGEST_DIR,
  saveCategoryAthletes,
  saveCategoryResults,
  loadCategoryResults,
  saveState,
  loadAll,
  listSavedCategoryIds,
};
