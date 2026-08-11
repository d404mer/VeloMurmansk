const { resolveVmixConfig, DEFAULT_VMIX } = require('./vmixConfig');
const {
  TARGET_FIELDS,
  DEFAULT_FIELD_MAPPING,
  AVAILABLE_SOURCE_FIELDS,
  normalizeFieldMapping,
} = require('./fieldMapping');

const PLAQUE_DEFINITIONS = [
  {
    id: 'startlist',
    label: 'Стартовый лист',
    templateKey: 'startlistPage',
    kind: 'indexed',
    fieldListKey: 'startlistFields',
    includeClass: true,
  },
  {
    id: 'results',
    label: 'Результаты',
    templateKey: 'resultsPage',
    kind: 'indexed',
    fieldListKey: 'resultsFields',
    includeClass: true,
  },
  {
    id: 'leader1',
    label: 'Лидер 1',
    templateKey: 'winner1',
    kind: 'leader',
    place: 1,
  },
  {
    id: 'leader2',
    label: 'Лидер 2',
    templateKey: 'winner2',
    kind: 'leader',
    place: 2,
  },
  {
    id: 'leader3',
    label: 'Лидер 3',
    templateKey: 'winner3',
    kind: 'leader',
    place: 3,
  },
  {
    id: 'winners',
    label: 'Победители',
    templateKey: 'winners',
    kind: 'winners',
  },
  {
    id: 'lapCounter',
    label: 'Круги / таймер',
    templateKey: 'lapCounter',
    kind: 'lap',
  },
];

function sourcePathFor(config, dataKey) {
  if (!dataKey) return '';
  return config.vmix?.fieldMapping?.[dataKey] || DEFAULT_FIELD_MAPPING[dataKey] || '';
}

function buildIndexedFields(resolved, config, fieldKeys, includeClass) {
  const fields = [];
  if (includeClass) {
    fields.push({
      key: 'class',
      label: 'class',
      vmixConfigKey: 'class',
      vmixFieldName: resolved.singleFields.class || '',
      sourcePath: '',
      editableSource: false,
      editableVmixName: true,
      vmixStorage: 'single',
      hint: 'Категория (авто)',
    });
  }
  for (const key of fieldKeys) {
    fields.push({
      key,
      label: key,
      vmixConfigKey: key,
      vmixFieldName: resolved.indexedFields[key] || DEFAULT_VMIX.indexedFields[key] || '',
      sourcePath: sourcePathFor(config, key),
      editableSource: TARGET_FIELDS.includes(key),
      editableVmixName: true,
      vmixStorage: 'indexed',
    });
  }
  return fields;
}

function buildLeaderFields(resolved, config, place) {
  const nameFieldKey = resolved.leaderNameFields?.[place - 1] || `name ${place}`;
  return [
    {
      key: 'class',
      label: 'class',
      vmixConfigKey: 'class',
      vmixFieldName: resolved.singleFields.class || '',
      sourcePath: '',
      editableSource: false,
      editableVmixName: true,
      vmixStorage: 'single',
      hint: 'Категория (авто)',
    },
    {
      key: 'name',
      label: 'name',
      vmixConfigKey: nameFieldKey,
      vmixFieldName: resolved.singleFields[nameFieldKey] || '',
      sourcePath: sourcePathFor(config, 'name'),
      editableSource: true,
      editableVmixName: true,
      vmixStorage: 'single',
    },
  ];
}

function buildWinnersFields(resolved, config) {
  const fields = [
    {
      key: 'class',
      label: 'class',
      vmixConfigKey: 'class',
      vmixFieldName: resolved.singleFields.class || '',
      sourcePath: '',
      editableSource: false,
      editableVmixName: true,
      vmixStorage: 'single',
      hint: 'Категория (авто)',
    },
  ];
  for (const nameFieldKey of resolved.winnerNameFields || []) {
    fields.push({
      key: 'name',
      label: nameFieldKey,
      vmixConfigKey: nameFieldKey,
      vmixFieldName: resolved.singleFields[nameFieldKey] || '',
      sourcePath: sourcePathFor(config, 'name'),
      editableSource: true,
      editableVmixName: true,
      vmixStorage: 'single',
    });
  }
  return fields;
}

function buildLapFields(resolved) {
  return [
    {
      key: 'lap',
      label: 'lap',
      vmixConfigKey: 'lap',
      vmixFieldName: resolved.singleFields.lap || '',
      sourcePath: '',
      editableSource: false,
      editableVmixName: true,
      vmixStorage: 'single',
      hint: 'Счётчик кругов (авто)',
    },
    {
      key: 'class',
      label: 'class',
      vmixConfigKey: 'class',
      vmixFieldName: resolved.singleFields.class || '',
      sourcePath: '',
      editableSource: false,
      editableVmixName: true,
      vmixStorage: 'single',
      hint: 'Категория (авто)',
    },
  ];
}

function buildPlaqueView(config, definition) {
  const resolved = resolveVmixConfig(config);
  const templateValue =
    config.vmix?.templates?.[definition.templateKey] ??
    resolved.templates[definition.templateKey] ??
    '';

  let fields = [];
  if (definition.kind === 'indexed') {
    const fieldKeys = resolved[definition.fieldListKey] || [];
    fields = buildIndexedFields(resolved, config, fieldKeys, definition.includeClass);
  } else if (definition.kind === 'leader') {
    fields = buildLeaderFields(resolved, config, definition.place);
  } else if (definition.kind === 'winners') {
    fields = buildWinnersFields(resolved, config);
  } else if (definition.kind === 'lap') {
    fields = buildLapFields(resolved);
  }

  return {
    id: definition.id,
    label: definition.label,
    templateKey: definition.templateKey,
    templateValue,
    fields,
  };
}

function buildPlaquesView(config) {
  return PLAQUE_DEFINITIONS.map((definition) => buildPlaqueView(config, definition));
}

function applyPlaquesToConfig(config, plaques) {
  if (!config.vmix) config.vmix = {};
  const vmix = config.vmix;
  if (!vmix.templates) vmix.templates = {};
  if (!vmix.indexedFields) vmix.indexedFields = {};
  if (!vmix.singleFields) vmix.singleFields = {};
  if (!vmix.fieldMapping) vmix.fieldMapping = {};

  for (const plaque of plaques || []) {
    const definition = PLAQUE_DEFINITIONS.find((item) => item.id === plaque.id);
    if (!definition) continue;

    const templateValue = String(plaque.templateValue || '').trim();
    if (templateValue) {
      vmix.templates[definition.templateKey] = templateValue;
    }

    for (const field of plaque.fields || []) {
      const vmixFieldName = String(field.vmixFieldName || '').trim();
      if (vmixFieldName && field.editableVmixName !== false) {
        if (field.vmixStorage === 'indexed') {
          vmix.indexedFields[field.vmixConfigKey || field.key] = vmixFieldName;
        } else if (field.vmixStorage === 'single') {
          vmix.singleFields[field.vmixConfigKey || field.key] = vmixFieldName;
        }
      }

      if (field.editableSource && TARGET_FIELDS.includes(field.key)) {
        const sourcePath = String(field.sourcePath || '').trim();
        if (sourcePath) {
          vmix.fieldMapping[field.key] = sourcePath;
        } else {
          delete vmix.fieldMapping[field.key];
        }
      }
    }
  }

  vmix.fieldMapping = normalizeFieldMapping(vmix.fieldMapping);
}

module.exports = {
  PLAQUE_DEFINITIONS,
  buildPlaquesView,
  applyPlaquesToConfig,
  AVAILABLE_SOURCE_FIELDS,
  DEFAULT_FIELD_MAPPING,
};
