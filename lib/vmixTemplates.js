const { DEFAULT_VMIX, resolveVmixConfig } = require('./vmixConfig');

const TEMPLATE_KEYS = [
  'resultsPage',
  'startlistPage',
  'winner1',
  'winner2',
  'winner3',
  'winners',
  'lapCounter',
  'resultManual',
  'startlistManual',
];

const TEMPLATE_LABELS = {
  resultsPage: 'resultsPage — страницы результатов',
  startlistPage: 'startlistPage — стартовые страницы',
  winner1: 'winner1 — лидер 1',
  winner2: 'winner2 — лидер 2',
  winner3: 'winner3 — лидер 3',
  winners: 'winners — все победители',
  lapCounter: 'lapCounter — круги / таймер',
  resultManual: 'resultManual — ручная страница результатов',
  startlistManual: 'startlistManual — ручная стартовая страница',
};

function objectToEntries(obj) {
  return Object.keys(obj || {})
    .sort()
    .map((key) => ({ key, value: obj[key] }));
}

function entriesToObject(entries) {
  const result = {};
  for (const entry of entries || []) {
    const key = String(entry?.key ?? '').trim();
    const value = String(entry?.value ?? '').trim();
    if (!key) continue;
    result[key] = value;
  }
  return result;
}

function getTemplatesView(config) {
  const resolved = resolveVmixConfig(config);
  const templates = {};
  for (const key of TEMPLATE_KEYS) {
    templates[key] = resolved.templates[key] || '';
  }
  return {
    templates,
    indexedFields: { ...resolved.indexedFields },
    singleFields: { ...resolved.singleFields },
    templateKeys: TEMPLATE_KEYS,
    templateLabels: TEMPLATE_LABELS,
  };
}

function validateStringMap(name, obj) {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) {
    return `${name} must be an object`;
  }
  for (const [key, value] of Object.entries(obj)) {
    if (String(key).trim() === '') {
      return `${name}: ключ не может быть пустым`;
    }
    if (value == null || String(value).trim() === '') {
      return `${name}: значение для «${key}» не может быть пустым`;
    }
  }
  return null;
}

function validateTemplatesUpdate(body) {
  if (body.templates != null) {
    const error = validateStringMap('templates', body.templates);
    if (error) return error;
    for (const key of Object.keys(body.templates)) {
      if (!TEMPLATE_KEYS.includes(key)) {
        return `templates: неизвестный ключ «${key}»`;
      }
    }
  }
  if (body.indexedFields != null) {
    const error = validateStringMap('indexedFields', body.indexedFields);
    if (error) return error;
  }
  if (body.singleFields != null) {
    const error = validateStringMap('singleFields', body.singleFields);
    if (error) return error;
  }
  if (body.templates == null && body.indexedFields == null && body.singleFields == null) {
    return 'Нужно передать templates, indexedFields и/или singleFields';
  }
  return null;
}

function applyTemplatesUpdate(config, body) {
  if (!config.vmix) config.vmix = {};
  const vmix = config.vmix;

  if (body.templates != null) {
    if (!vmix.templates) vmix.templates = {};
    for (const key of TEMPLATE_KEYS) {
      if (body.templates[key] != null) {
        vmix.templates[key] = String(body.templates[key]).trim();
      }
    }
  }

  if (body.indexedFields != null) {
    vmix.indexedFields = {};
    for (const [key, value] of Object.entries(body.indexedFields)) {
      vmix.indexedFields[String(key).trim()] = String(value).trim();
    }
  }

  if (body.singleFields != null) {
    vmix.singleFields = {};
    for (const [key, value] of Object.entries(body.singleFields)) {
      vmix.singleFields[String(key).trim()] = String(value).trim();
    }
  }
}

module.exports = {
  TEMPLATE_KEYS,
  TEMPLATE_LABELS,
  getTemplatesView,
  validateTemplatesUpdate,
  applyTemplatesUpdate,
  objectToEntries,
  entriesToObject,
};
