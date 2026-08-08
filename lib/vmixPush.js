const { resolveVmixConfig, formatTemplate } = require('./vmixConfig');

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

  function appendFieldCommands(commands, config, tpl, fieldKey, row, val) {
    const fieldTemplate = config.fields[fieldKey];
    if (!fieldTemplate) return;
    commands.push(setTextCmd(tpl, fieldTemplate.replace('{row}', row), val));
  }

  function appendRowCommands(commands, config, tpl, rowIndex, athlete, globalPlace) {
    appendFieldCommands(commands, config, tpl, 'place', rowIndex, globalPlace ?? athlete.место ?? '');
    appendFieldCommands(commands, config, tpl, 'num', rowIndex, athlete.номер ?? '');
    appendFieldCommands(commands, config, tpl, 'name', rowIndex, athlete.участник ?? '');
    appendFieldCommands(commands, config, tpl, 'city', rowIndex, athlete.клуб ?? '');
    appendFieldCommands(commands, config, tpl, 'club', rowIndex, athlete.клуб ?? '');
    appendFieldCommands(commands, config, tpl, 'age', rowIndex, athlete.возраст ?? '');
    appendFieldCommands(commands, config, tpl, 'result', rowIndex, athlete.результат ?? '');
    appendFieldCommands(commands, config, tpl, 'gap', rowIndex, athlete.доЛидера ?? '');
  }

  function appendClearRowCommands(commands, config, tpl, rowIndex, globalPlace) {
    appendRowCommands(commands, config, tpl, rowIndex, {}, globalPlace);
  }

  function appendStartlistRowCommands(commands, config, tpl, rowIndex, athlete) {
    appendFieldCommands(commands, config, tpl, 'num', rowIndex, athlete.номер ?? '');
    appendFieldCommands(commands, config, tpl, 'name', rowIndex, athlete.участник ?? '');
    appendFieldCommands(commands, config, tpl, 'city', rowIndex, athlete.клуб ?? '');
    appendFieldCommands(commands, config, tpl, 'club', rowIndex, athlete.клуб ?? '');
    appendFieldCommands(commands, config, tpl, 'age', rowIndex, athlete.возраст ?? '');
  }

  function appendPagedListCommands(commands, config, list, pageTemplate, fillFn) {
    const pageSize = config.pageSize;
    const maxItems = config.maxPages * pageSize;

    for (let i = 0; i < maxItems; i++) {
      const page = Math.floor(i / pageSize);
      const rowOnPage = (i % pageSize) + 1;
      const tpl = formatTemplate(pageTemplate, { page: page + 1 });
      if (i < list.length) {
        fillFn(commands, tpl, rowOnPage, list[i], i + 1);
      } else {
        appendClearRowCommands(commands, config, tpl, rowOnPage, i + 1);
      }
    }
  }

  function appendAllStartlists(commands, config, categoryStartlists) {
    for (const { categoryId, startList } of categoryStartlists || []) {
      const pageTemplate = config.startlistByCategory[categoryId];
      if (!pageTemplate) continue;
      appendPagedListCommands(commands, config, startList || [], pageTemplate, (cmds, tpl, row, athlete) => {
        appendStartlistRowCommands(cmds, config, tpl, row, athlete);
      });
    }
  }

  function pushAll(appConfig, data, categoryStartlists) {
    if (!resolveVmixConfig(appConfig).autoUpdate) return;

    const config = resolveVmixConfig(appConfig);
    const resultsList = data.mode === 'final' ? data.finalList : data.liveList;
    const leaders = data.leaders || [];
    const commands = [];

    appendAllStartlists(commands, config, categoryStartlists);

    appendPagedListCommands(commands, config, resultsList || [], config.templates.resultsPage, (cmds, tpl, row, athlete, place) => {
      appendRowCommands(cmds, config, tpl, row, athlete, place);
    });

    const personalWinners = [
      { key: 'winner1', athlete: leaders[0], place: 1 },
      { key: 'winner2', athlete: leaders[1], place: 2 },
      { key: 'winner3', athlete: leaders[2], place: 3 },
    ];

    for (const winner of personalWinners) {
      const tpl = config.templates[winner.key];
      if (winner.athlete) {
        appendRowCommands(commands, config, tpl, 1, winner.athlete, winner.place);
      } else {
        appendClearRowCommands(commands, config, tpl, 1, winner.place);
      }
    }

    const winnersTpl = config.templates.winners;
    for (let i = 0; i < 3; i++) {
      if (leaders[i]) {
        appendRowCommands(commands, config, winnersTpl, i + 1, leaders[i], i + 1);
      } else {
        appendClearRowCommands(commands, config, winnersTpl, i + 1, i + 1);
      }
    }

    sendBatch(commands);
  }

  function overlayInput(appConfig, inputName) {
    if (!inputName) return;
    sendBatch([overlayCmd(inputName)]);
  }

  function pushManualPage(appConfig, athletes, pageIndex, type) {
    const config = resolveVmixConfig(appConfig);
    const tpl =
      type === 'startlist'
        ? config.templates.startlistManual
        : config.templates.resultManual;
    const commands = [];

    for (let i = 1; i <= config.pageSize; i++) {
      const athlete = athletes?.[i - 1];
      const globalPlace = pageIndex * config.pageSize + i;
      if (type === 'startlist') {
        if (athlete) appendStartlistRowCommands(commands, config, tpl, i, athlete);
        else appendClearRowCommands(commands, config, tpl, i, globalPlace);
      } else if (athlete) {
        appendRowCommands(commands, config, tpl, i, athlete, globalPlace);
      } else {
        appendClearRowCommands(commands, config, tpl, i, globalPlace);
      }
    }

    sendBatch(commands);
  }

  function pushWinnerOverlay(appConfig, command, data) {
    const config = resolveVmixConfig(appConfig);
    const leaders = data.leaders?.length ? data.leaders : data.displayList || [];
    const commands = [];

    if (command === 'winner1' && leaders[0]) {
      appendRowCommands(commands, config, config.templates.winner1, 1, leaders[0], 1);
      commands.push(overlayCmd(config.templates.winner1));
    } else if (command === 'winner2' && leaders[1]) {
      appendRowCommands(commands, config, config.templates.winner2, 1, leaders[1], 2);
      commands.push(overlayCmd(config.templates.winner2));
    } else if (command === 'winner3' && leaders[2]) {
      appendRowCommands(commands, config, config.templates.winner3, 1, leaders[2], 3);
      commands.push(overlayCmd(config.templates.winner3));
    } else if (command === 'winners') {
      for (let k = 1; k <= 3; k++) {
        if (leaders[k - 1]) appendRowCommands(commands, config, config.templates.winners, k, leaders[k - 1], k);
        else appendClearRowCommands(commands, config, config.templates.winners, k, k);
      }
      commands.push(overlayCmd(config.templates.winners));
    } else if (command === 'lider' && leaders[0]) {
      appendRowCommands(commands, config, config.templates.winner1, 1, leaders[0], 1);
      commands.push(overlayCmd(config.templates.winner1));
    } else if (command === 'lider4') {
      for (let k = 1; k <= 3; k++) {
        if (leaders[k - 1]) appendRowCommands(commands, config, config.templates.winners, k, leaders[k - 1], k);
        else appendClearRowCommands(commands, config, config.templates.winners, k, k);
      }
      commands.push(overlayCmd(config.templates.winners));
    }

    sendBatch(commands);
  }

  return {
    pushAll,
    pushManualPage,
    pushWinnerOverlay,
    overlayInput,
    fillRow: (appConfig, tpl, rowIndex, athlete, globalPlace) => {
      const config = resolveVmixConfig(appConfig);
      const commands = [];
      appendRowCommands(commands, config, tpl, rowIndex, athlete, globalPlace);
      sendBatch(commands);
    },
  };
}

module.exports = {
  createVmixPusher,
};
