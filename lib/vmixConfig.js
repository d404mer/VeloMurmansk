const DEFAULT_VMIX = {
  host: 'localhost',
  autoUpdate: true,
  pageSize: 10,
  maxPages: 5,
  templates: {
    resultsPage: 'res{page}',
    startlistPage: 'startlist{page}',
    winner1: 'winner1',
    winner2: 'winner2',
    winner3: 'winner3',
    winners: 'winners',
    resultManual: 'result',
    startlistManual: 'startlist',
  },
  legacy: {
    winner1: 'lider',
    winners: 'liders4',
    winner4: 'lider4',
  },
  fields: {
    place: 'place {row}.Text',
    num: 'num {row}.Text',
    name: 'name {row}.Text',
    city: 'city {row}.Text',
    club: 'club {row}.Text',
    age: 'age {row}.Text',
    result: 'result {row}.Text',
    gap: 'gap {row}.Text',
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
  const fields = { ...DEFAULT_VMIX.fields, ...vmix.fields };

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
    },
    fields,
  };
}

function formatTemplate(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

module.exports = {
  DEFAULT_VMIX,
  resolveVmixConfig,
  formatTemplate,
};
