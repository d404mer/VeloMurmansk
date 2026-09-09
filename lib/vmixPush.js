const {
  resolveVmixConfig,
  formatTemplate,
  formatLapText,
  formatLapClass,
  formatLeaderClass,
  trimAthleteNumber,
} = require('./vmixConfig');
const { resolveAthleteValue } = require('./fieldMapping');
const { formatRegionClub, regionFlagPath } = require('./regions');

function clubSource(athlete, config) {
  const mapped = resolveAthleteValue(athlete, 'city', config.fieldMapping);
  if (mapped) return mapped;
  const raw = athlete?.raw;
  if (raw && typeof raw === 'object') {
    const fromRaw = raw.club || raw.team || raw.nationality || raw.account?.club || raw.account?.city || raw.city;
    if (fromRaw != null && String(fromRaw).trim() !== '') return String(fromRaw).trim();
  }
  return '';
}

function athleteFieldValue(athlete, fieldKey, config) {
  if (fieldKey === 'city' || fieldKey === 'flag') {
    const club = clubSource(athlete, config);
    if (fieldKey === 'flag') {
      const explicit = athlete?.flag || athlete?.raw?.flag;
      if (explicit != null && String(explicit).trim() !== '') return String(explicit).trim();
      return regionFlagPath(club);
    }
    return formatRegionClub(club);
  }
  const value = resolveAthleteValue(athlete, fieldKey, config.fieldMapping);
  if (fieldKey === 'num') return trimAthleteNumber(value, config.numberTrim);
  return value;
}

function isFlagFieldKey(fieldKey) {
  return fieldKey === 'flag' || /^flag\s*\d*$/i.test(String(fieldKey).trim());
}

function imageSelectedName(selectedName) {
  const name = String(selectedName || '');
  if (!name) return name;
  if (/\.Source$/i.test(name)) return name;
  if (/\.Text$/i.test(name)) return name.replace(/\.Text$/i, '.Source');
  return `${name}.Source`;
}

function pushSetText(commands, input, selectedName, value) {
  commands.push({
    Function: 'SetText',
    Input: input,
    SelectedName: selectedName,
    Value: value == null ? '' : String(value),
  });
}

function pushSetImage(commands, input, selectedName, value) {
  commands.push({
    Function: 'SetImage',
    Input: input,
    SelectedName: imageSelectedName(selectedName),
    Value: value == null ? '' : String(value),
  });
}

function pushTitleValue(commands, input, selectedName, value, fieldKey) {
  if (isFlagFieldKey(fieldKey)) {
    pushSetImage(commands, input, selectedName, value);
    return;
  }
  pushSetText(commands, input, selectedName, value);
}

function appendSingleField(commands, config, tpl, fieldKey, value) {
  const selectedName = config.singleFields[fieldKey];
  if (!selectedName) return;
  pushTitleValue(commands, tpl, selectedName, value, fieldKey);
}

function appendLeaderName(commands, config, tpl, athlete, place) {
  const fieldKey = config.leaderNameFields?.[place - 1];
  const selectedName = fieldKey
    ? config.singleFields[fieldKey]
    : config.singleFields.leaderName || config.singleFields.name1;
  if (!selectedName) return;
  pushSetText(
    commands,
    tpl,
    selectedName,
    resolveAthleteValue(athlete, 'name', config.fieldMapping)
  );
}

function appendLeaderCityFlag(commands, config, tpl, athlete) {
  appendSingleField(commands, config, tpl, 'city', athleteFieldValue(athlete, 'city', config));
  appendSingleField(commands, config, tpl, 'flag', athleteFieldValue(athlete, 'flag', config));
}

function resolveIndexedSelectedName(config, fieldKey, slot) {
  let template = config.indexedFields[fieldKey];
  if (!template) return null;

  const spacedFrom = config.indexedSpacedFrom?.[fieldKey];
  if (spacedFrom != null && slot >= spacedFrom) {
    template = template.replace(/(\S)\{n\}/, '$1 {n}');
  }

  return String(template).replace(/\{n\}/gi, String(slot));
}

function appendIndexedPage(commands, config, tpl, list, fieldKeys, classField, classValue) {
  if (classField) {
    appendSingleField(commands, config, tpl, classField, classValue);
  }

  for (let slot = 1; slot <= config.pageSize; slot++) {
    const athlete = list[slot - 1] || {};
    for (const fieldKey of fieldKeys) {
      const selectedName = resolveIndexedSelectedName(config, fieldKey, slot);
      if (!selectedName) continue;
      pushTitleValue(
        commands,
        tpl,
        selectedName,
        athleteFieldValue(athlete, fieldKey, config),
        fieldKey
      );
    }
  }
}

function appendPagedLists(commands, config, list, pageTemplate, fieldKeys, classField, classValue) {
  for (let page = 0; page < config.maxPages; page++) {
    const tpl = formatTemplate(pageTemplate, { page: page + 1 });
    const slice = list.slice(page * config.pageSize, (page + 1) * config.pageSize);
    appendIndexedPage(commands, config, tpl, slice, fieldKeys, classField, classValue);
  }
}

function appendAllStartlists(commands, config, categoryStartlists) {
  for (const entry of categoryStartlists || []) {
    const pageTemplate = config.startlistByCategory[entry.categoryId] || config.templates.startlistPage;
    appendPagedLists(
      commands,
      config,
      entry.startList || [],
      pageTemplate,
      config.startlistFields,
      'class',
      entry.categoryName || ''
    );
  }
}

function appendLeaders(commands, config, leaders, eventName, categoryName) {
  const leaderTemplates = [
    { tpl: config.templates.winner1, place: 1, athlete: leaders[0] },
    { tpl: config.templates.winner2, place: 2, athlete: leaders[1] },
    { tpl: config.templates.winner3, place: 3, athlete: leaders[2] },
  ];

  for (const leader of leaderTemplates) {
    appendSingleField(
      commands,
      config,
      leader.tpl,
      'class',
      formatLeaderClass(eventName, categoryName, leader.place, config.flowerCeremony)
    );
    appendLeaderName(commands, config, leader.tpl, leader.athlete, leader.place);
    appendLeaderCityFlag(commands, config, leader.tpl, leader.athlete);
  }
}

function winnerSlotIndex(fieldKey, fallbackIndex) {
  const match = String(fieldKey).match(/(\d+)\s*$/);
  if (match) return Number(match[1]);
  return fallbackIndex + 1;
}

function appendWinnerFieldGroup(commands, config, tpl, leaders, fieldKeys, dataKey) {
  (fieldKeys || []).forEach((fieldKey, index) => {
    const selectedName = config.singleFields[fieldKey];
    if (!selectedName) return;
    const slot = winnerSlotIndex(fieldKey, index);
    const athlete = leaders[slot - 1] || {};
    pushTitleValue(commands, tpl, selectedName, athleteFieldValue(athlete, dataKey, config), dataKey);
  });
}

function appendWinnersPage(commands, config, leaders, categoryName) {
  const tpl = config.templates.winners;
  appendSingleField(commands, config, tpl, 'class', categoryName);
  appendWinnerFieldGroup(commands, config, tpl, leaders, config.winnerNameFields, 'name');
  appendWinnerFieldGroup(commands, config, tpl, leaders, config.winnerCityFields, 'city');
  appendWinnerFieldGroup(commands, config, tpl, leaders, config.winnerFlagFields, 'flag');
}

function appendLapCounter(commands, config, lapState, categoryName) {
  const tpl = config.templates.lapCounter;
  if (!tpl) return;
  appendSingleField(commands, config, tpl, 'lap', formatLapText(lapState));
  appendSingleField(
    commands,
    config,
    tpl,
    'class',
    formatLapClass(categoryName || '', config.breakAfterBullet)
  );
}

function buildVmixPayload(appConfig, data, categoryStartlists) {
  const config = resolveVmixConfig(appConfig);
  const meta = data.meta || {};
  const resultsList = data.mode === 'final' ? data.finalList : data.liveList;
  const leaders = data.leaders || [];
  const commands = [];

  appendAllStartlists(commands, config, categoryStartlists);

  appendPagedLists(
    commands,
    config,
    resultsList || [],
    config.templates.resultsPage,
    config.resultsFields,
    'class',
    meta.categoryName || ''
  );

  appendWinnersPage(commands, config, leaders, meta.categoryName || '');
  appendLeaders(commands, config, leaders, meta.eventName || '', meta.categoryName || '');
  appendLapCounter(commands, config, meta.lapState, meta.categoryName || '');

  return commands;
}

function groupPayloadByInput(commands) {
  const inputs = {};
  for (const cmd of commands || []) {
    if (cmd.Function !== 'SetText') continue;
    if (!inputs[cmd.Input]) inputs[cmd.Input] = {};
    inputs[cmd.Input][cmd.SelectedName] = cmd.Value;
  }
  return inputs;
}

function buildManualPagePayload(appConfig, athletes, pageIndex, type, meta = {}) {
  const config = resolveVmixConfig(appConfig);
  const tpl =
    type === 'startlist'
      ? formatTemplate(config.templates.startlistManual, { page: pageIndex + 1 })
      : formatTemplate(config.templates.resultManual, { page: pageIndex + 1 });
  const commands = [];
  const fieldKeys = type === 'startlist' ? config.startlistFields : config.resultsFields;
  const classValue = meta.categoryName || '';

  appendIndexedPage(commands, config, tpl, athletes || [], fieldKeys, 'class', classValue);
  return commands;
}

function buildWinnerOverlayPayload(appConfig, command, data, meta = {}) {
  const config = resolveVmixConfig(appConfig);
  const leaders = data.leaders?.length ? data.leaders : data.displayList || [];
  const eventName = meta.eventName || '';
  const categoryName = meta.categoryName || '';
  const commands = [];

  if (command === 'winner1' && leaders[0]) {
    appendSingleField(
      commands,
      config,
      config.templates.winner1,
      'class',
      formatLeaderClass(eventName, categoryName, 1, config.flowerCeremony)
    );
    appendLeaderName(commands, config, config.templates.winner1, leaders[0], 1);
    appendLeaderCityFlag(commands, config, config.templates.winner1, leaders[0]);
    commands.push({ Function: 'OverlayInput1', Input: config.templates.winner1 });
  } else if (command === 'winner2' && leaders[1]) {
    appendSingleField(
      commands,
      config,
      config.templates.winner2,
      'class',
      formatLeaderClass(eventName, categoryName, 2, config.flowerCeremony)
    );
    appendLeaderName(commands, config, config.templates.winner2, leaders[1], 2);
    appendLeaderCityFlag(commands, config, config.templates.winner2, leaders[1]);
    commands.push({ Function: 'OverlayInput1', Input: config.templates.winner2 });
  } else if (command === 'winner3' && leaders[2]) {
    appendSingleField(
      commands,
      config,
      config.templates.winner3,
      'class',
      formatLeaderClass(eventName, categoryName, 3, config.flowerCeremony)
    );
    appendLeaderName(commands, config, config.templates.winner3, leaders[2], 3);
    appendLeaderCityFlag(commands, config, config.templates.winner3, leaders[2]);
    commands.push({ Function: 'OverlayInput1', Input: config.templates.winner3 });
  } else if (command === 'winners') {
    appendWinnersPage(commands, config, leaders, categoryName);
    commands.push({ Function: 'OverlayInput1', Input: config.templates.winners });
  } else if (command === 'lider' && leaders[0]) {
    appendSingleField(
      commands,
      config,
      config.templates.winner1,
      'class',
      formatLeaderClass(eventName, categoryName, 1, config.flowerCeremony)
    );
    appendLeaderName(commands, config, config.templates.winner1, leaders[0], 1);
    appendLeaderCityFlag(commands, config, config.templates.winner1, leaders[0]);
    commands.push({ Function: 'OverlayInput1', Input: config.templates.winner1 });
  } else if (command === 'lider4') {
    appendWinnersPage(commands, config, leaders, categoryName);
    commands.push({ Function: 'OverlayInput1', Input: config.templates.winners });
  }

  return commands;
}

function createVmixPusher(getConnection) {
  const lastSentValues = new Map();

  function pushCmd(commands, cmd) {
    if (cmd) commands.push(cmd);
  }

  function sendBatch(commands) {
    if (!commands?.length) return;
    const connection = getConnection();
    if (!connection?.connected || !connection.client) return;

    try {
      connection.client.send(commands);
    } catch (err) {
      connection.onError?.(err);
    }
  }

  function setCachedFieldCmd(cmd) {
    const val = cmd.Value == null ? '' : String(cmd.Value);
    const key = `${cmd.Function}|${cmd.Input}|${cmd.SelectedName}`;
    if (lastSentValues.get(key) === val) return null;
    lastSentValues.set(key, val);
    return { ...cmd, Value: val };
  }

  function resetCache() {
    lastSentValues.clear();
  }

  function overlayCmd(inputName) {
    return { Function: 'OverlayInput1', Input: inputName };
  }

  function sendPayloadWithCache(commands) {
    const toSend = [];
    for (const cmd of commands || []) {
      if (cmd.Function === 'SetText' || cmd.Function === 'SetImage') {
        pushCmd(toSend, setCachedFieldCmd(cmd));
      } else {
        toSend.push(cmd);
      }
    }
    sendBatch(toSend);
  }

  function pushAll(appConfig, data, categoryStartlists) {
    if (!resolveVmixConfig(appConfig).autoUpdate) return;
    sendPayloadWithCache(buildVmixPayload(appConfig, data, categoryStartlists));
  }

  function overlayInput(appConfig, inputName) {
    if (!inputName) return;
    sendBatch([overlayCmd(inputName)]);
  }

  function pushManualPage(appConfig, athletes, pageIndex, type, meta = {}) {
    sendPayloadWithCache(buildManualPagePayload(appConfig, athletes, pageIndex, type, meta));
  }

  function pushWinnerOverlay(appConfig, command, data, meta = {}) {
    sendPayloadWithCache(buildWinnerOverlayPayload(appConfig, command, data, meta));
  }

  return {
    pushAll,
    pushManualPage,
    pushWinnerOverlay,
    overlayInput,
    resetCache,
  };
}

module.exports = {
  createVmixPusher,
  buildVmixPayload,
  groupPayloadByInput,
};
