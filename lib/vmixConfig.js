const DEFAULT_VMIX = {
  host: 'localhost',
  autoUpdate: true,
  pageSize: 10,
  maxPages: 6,
  templates: {
    resultsPage: 'results{page}',
    startlistPage: 'startlist{page}',
    winner1: 'leader1',
    winner2: 'leader2',
    winner3: 'leader3',
    winners: 'winners',
    resultManual: 'results1',
    startlistManual: 'startlist1',
    lapCounter: 'timer',
  },
  legacy: {
    winner1: 'lider',
    winners: 'liders4',
    winner4: 'lider4',
  },
  indexedFields: {
    num: 'num {n}.Text',
    name: 'name {n}.Text',
    age: 'age {n}.Text',
    city: 'city {n}.Text',
    place: 'place {n}.Text',
    result: 'result {n}.Text',
    gap: 'gap {n}.Text',
  },
  startlistFields: ['num', 'name', 'age', 'city'],
  resultsFields: ['place', 'num', 'name', 'age', 'city', 'result', 'gap'],
  singleFields: {
    class: 'class.Text',
    class1: 'class1.Text',
    name1: 'name1.Text',
    'name 1': 'name 1.Text',
    'name 2': 'name 2.Text',
    'name 3': 'name 3.Text',
    leaderName: 'name 1.Text',
    lap: 'lap.Text',
  },
  winnerNameFields: ['name 1', 'name 2', 'name 3'],
  leaderNameFields: ['name 1', 'name 2', 'name 3'],
  indexedSpacedFrom: {},
  startlistByCategory: {
    women: 'startlist{page}',
    men: 'startlist{page}',
    junior_women: 'startlist{page}',
    junior_men: 'startlist{page}',
  },
};

function resolveTemplateName(templates, key, legacy) {
  const value = templates?.[key];
  if (value) return value;
  return legacy?.[key] || DEFAULT_VMIX.templates[key] || DEFAULT_VMIX.legacy[key] || key;
}

function resolveVmixConfig(config) {
  const vmix = config?.vmix || {};
  const templates = { ...DEFAULT_VMIX.templates, ...vmix.templates };
  const legacy = { ...DEFAULT_VMIX.legacy, ...vmix.legacy };

  return {
    host: vmix.host || DEFAULT_VMIX.host,
    autoUpdate: vmix.autoUpdate !== false,
    pageSize: vmix.pageSize || DEFAULT_VMIX.pageSize,
    maxPages: vmix.maxPages || DEFAULT_VMIX.maxPages,
    templates: {
      resultsPage: resolveTemplateName(templates, 'resultsPage', legacy),
      startlistPage: resolveTemplateName(templates, 'startlistPage', legacy),
      winner1: resolveTemplateName(templates, 'winner1', legacy),
      winner2: resolveTemplateName(templates, 'winner2', legacy),
      winner3: resolveTemplateName(templates, 'winner3', legacy),
      winners: resolveTemplateName(templates, 'winners', legacy),
      resultManual: resolveTemplateName(templates, 'resultManual', legacy),
      startlistManual: resolveTemplateName(templates, 'startlistManual', legacy),
      lapCounter: resolveTemplateName(templates, 'lapCounter', legacy) || DEFAULT_VMIX.templates.lapCounter,
    },
    indexedFields: { ...DEFAULT_VMIX.indexedFields, ...vmix.indexedFields },
    startlistFields: vmix.startlistFields || DEFAULT_VMIX.startlistFields,
    resultsFields: vmix.resultsFields || DEFAULT_VMIX.resultsFields,
    singleFields: { ...DEFAULT_VMIX.singleFields, ...vmix.singleFields },
    winnerNameFields: vmix.winnerNameFields || DEFAULT_VMIX.winnerNameFields,
    leaderNameFields: vmix.leaderNameFields || DEFAULT_VMIX.leaderNameFields,
    indexedSpacedFrom: { ...DEFAULT_VMIX.indexedSpacedFrom, ...vmix.indexedSpacedFrom },
    startlistByCategory: {
      ...DEFAULT_VMIX.startlistByCategory,
      ...vmix.startlistByCategory,
    },
    fieldMapping: vmix.fieldMapping ? { ...vmix.fieldMapping } : {},
  };
}

function formatTemplate(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

function formatLapText(lapState) {
  if (!lapState) return '';
  const completed = Number(lapState.completedLap) || 0;
  const total = Number(lapState.totalLaps) || 0;
  if (completed <= 0) return 'КРУГ 1';
  let current = Number(lapState.currentLap) || completed + 1;
  if (total > 0) current = Math.min(current, total);
  if (total > 0) return `КРУГ ${current}/${total}`;
  return `КРУГ ${current}`;
}

function formatLapClass(categoryName) {
  if (!categoryName) return '';
  const idx = categoryName.indexOf('•');
  if (idx < 0) return categoryName;
  const before = categoryName.slice(0, idx + 1).trimEnd();
  const after = categoryName.slice(idx + 1).trimStart();
  return after ? `${before}\n${after}` : before;
}

function formatLeaderClass(_eventName, categoryName, place) {
 // const parts = [categoryName, `${place} Место`].filter(Boolean); // с местом для обычного награждения
 const parts = [categoryName].filter(Boolean); // без места для цветочного награждения
  return parts.join(' • ');
}

module.exports = {
  DEFAULT_VMIX,
  resolveVmixConfig,
  formatTemplate,
  formatLapText,
  formatLapClass,
  formatLeaderClass,
};
