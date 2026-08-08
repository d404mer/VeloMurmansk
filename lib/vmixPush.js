const {
  resolveVmixConfig,
  formatTemplate,
  formatLapText,
  formatLeaderClass,
} = require('./vmixConfig');

const ATHLETE_KEYS = {
  num: 'номер',
  name: 'участник',
  age: 'возраст',
  city: 'клуб',
  place: 'место',
  result: 'результат',
  gap: 'доЛидера',
};

function createVmixPusher(getConnection) {
  function sendBatch(commands) {
    if (!commands?.length) return;
    const connection = getConnection();
    if (!connection?.connected) return;
    try {
      connection.client.send(commands);
    } catch (err) {
      connection.onError?.(err);
    }
  }

  function setTextCmd(tpl, selectedName, value) {
    return {
      Function: 'SetText',
      Input: tpl,
      SelectedName: selectedName,
      Value: value ?? '',
    };
  }

  function overlayCmd(inputName) {
    return { Function: 'OverlayInput1', Input: inputName };
  }

  function athleteValue(athlete, fieldKey) {
    return athlete?.[ATHLETE_KEYS[fieldKey]] ?? '';
  }

  function appendSingleField(commands, config, tpl, fieldKey, value) {
    const selectedName = config.singleFields[fieldKey];
    if (!selectedName) return;
    commands.push(setTextCmd(tpl, selectedName, value));
  }

  function appendIndexedPage(commands, config, tpl, list, fieldKeys, classField, classValue) {
    if (classField) {
      appendSingleField(commands, config, tpl, classField, classValue);
    }

    for (let slot = 1; slot <= config.pageSize; slot++) {
      const athlete = list[slot - 1] || {};
      for (const fieldKey of fieldKeys) {
        const template = config.indexedFields[fieldKey];
        if (!template) continue;
        commands.push(
          setTextCmd(tpl, template.replace('{n}', slot), athleteValue(athlete, fieldKey))
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
        formatLeaderClass(eventName, categoryName, leader.place)
      );
      appendSingleField(commands, config, leader.tpl, 'name1', athleteValue(leader.athlete, 'name'));
    }
  }

  function appendWinnersPage(commands, config, leaders, categoryName) {
    const tpl = config.templates.winners;
    appendSingleField(commands, config, tpl, 'class', categoryName);

    for (let slot = 1; slot <= 3; slot++) {
      const athlete = leaders[slot - 1] || {};
      for (const fieldKey of config.resultsFields) {
        const template = config.indexedFields[fieldKey];
        if (!template) continue;
        commands.push(
          setTextCmd(tpl, template.replace('{n}', slot), athleteValue(athlete, fieldKey))
        );
      }
    }
  }

  function appendLapCounter(commands, config, lapState) {
    const tpl = config.templates.lapCounter;
    if (!tpl) return;
    appendSingleField(commands, config, tpl, 'lap', formatLapText(lapState));
  }

  function pushAll(appConfig, data, categoryStartlists) {
    if (!resolveVmixConfig(appConfig).autoUpdate) return;

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
      'class1',
      meta.categoryName || ''
    );

    appendWinnersPage(commands, config, leaders, meta.categoryName || '');
    appendLeaders(commands, config, leaders, meta.eventName || '', meta.categoryName || '');
    appendLapCounter(commands, config, meta.lapState);

    sendBatch(commands);
  }

  function overlayInput(appConfig, inputName) {
    if (!inputName) return;
    sendBatch([overlayCmd(inputName)]);
  }

  function pushManualPage(appConfig, athletes, pageIndex, type, meta = {}) {
    const config = resolveVmixConfig(appConfig);
    const tpl =
      type === 'startlist'
        ? formatTemplate(config.templates.startlistManual, { page: pageIndex + 1 })
        : formatTemplate(config.templates.resultManual, { page: pageIndex + 1 });
    const commands = [];
    const fieldKeys = type === 'startlist' ? config.startlistFields : config.resultsFields;
    const classField = type === 'startlist' ? 'class' : 'class1';
    const classValue = meta.categoryName || '';

    appendIndexedPage(commands, config, tpl, athletes || [], fieldKeys, classField, classValue);
    sendBatch(commands);
  }

  function pushWinnerOverlay(appConfig, command, data, meta = {}) {
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
        formatLeaderClass(eventName, categoryName, 1)
      );
      appendSingleField(commands, config, config.templates.winner1, 'name1', athleteValue(leaders[0], 'name'));
      commands.push(overlayCmd(config.templates.winner1));
    } else if (command === 'winner2' && leaders[1]) {
      appendSingleField(
        commands,
        config,
        config.templates.winner2,
        'class',
        formatLeaderClass(eventName, categoryName, 2)
      );
      appendSingleField(commands, config, config.templates.winner2, 'name1', athleteValue(leaders[1], 'name'));
      commands.push(overlayCmd(config.templates.winner2));
    } else if (command === 'winner3' && leaders[2]) {
      appendSingleField(
        commands,
        config,
        config.templates.winner3,
        'class',
        formatLeaderClass(eventName, categoryName, 3)
      );
      appendSingleField(commands, config, config.templates.winner3, 'name1', athleteValue(leaders[2], 'name'));
      commands.push(overlayCmd(config.templates.winner3));
    } else if (command === 'winners') {
      appendWinnersPage(commands, config, leaders, categoryName);
      commands.push(overlayCmd(config.templates.winners));
    } else if (command === 'lider' && leaders[0]) {
      appendSingleField(
        commands,
        config,
        config.templates.winner1,
        'class',
        formatLeaderClass(eventName, categoryName, 1)
      );
      appendSingleField(commands, config, config.templates.winner1, 'name1', athleteValue(leaders[0], 'name'));
      commands.push(overlayCmd(config.templates.winner1));
    } else if (command === 'lider4') {
      appendWinnersPage(commands, config, leaders, categoryName);
      commands.push(overlayCmd(config.templates.winners));
    }

    sendBatch(commands);
  }

  return {
    pushAll,
    pushManualPage,
    pushWinnerOverlay,
    overlayInput,
  };
}

module.exports = {
  createVmixPusher,
};
