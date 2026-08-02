const { resolveVmixConfig, formatTemplate } = require('./vmixConfig');

function createVmixPusher(getConnection) {
  function updateTpl(config, tpl, fieldKey, row, val) {
    const connection = getConnection();
    if (!connection?.connected) return;

    const fieldTemplate = config.fields[fieldKey];
    if (!fieldTemplate) return;

    const selectedName = fieldTemplate.replace('{row}', row);
    try {
      connection.client.send({
        Function: 'SetText',
        Input: tpl,
        SelectedName: selectedName,
        Value: val ?? '',
      });
    } catch (err) {
      connection.onError?.(err);
    }
  }

  function fillRow(config, tpl, rowIndex, athlete, globalPlace) {
    updateTpl(config, tpl, 'place', rowIndex, globalPlace ?? athlete.место ?? '');
    updateTpl(config, tpl, 'num', rowIndex, athlete.номер ?? '');
    updateTpl(config, tpl, 'name', rowIndex, athlete.участник ?? '');
    updateTpl(config, tpl, 'city', rowIndex, athlete.клуб ?? '');
    updateTpl(config, tpl, 'club', rowIndex, athlete.клуб ?? '');
    updateTpl(config, tpl, 'age', rowIndex, athlete.возраст ?? '');
    updateTpl(config, tpl, 'result', rowIndex, athlete.результат ?? '');
    updateTpl(config, tpl, 'gap', rowIndex, athlete.доЛидера ?? '');
  }

  function clearRow(config, tpl, rowIndex, globalPlace) {
    fillRow(config, tpl, rowIndex, {}, globalPlace);
  }

  function fillStartlistRow(config, tpl, rowIndex, athlete) {
    updateTpl(config, tpl, 'num', rowIndex, athlete.номер ?? '');
    updateTpl(config, tpl, 'name', rowIndex, athlete.участник ?? '');
    updateTpl(config, tpl, 'city', rowIndex, athlete.клуб ?? '');
    updateTpl(config, tpl, 'club', rowIndex, athlete.клуб ?? '');
    updateTpl(config, tpl, 'age', rowIndex, athlete.возраст ?? '');
  }

  function pushPagedList(config, list, pageTemplate, fillFn) {
    const pageSize = config.pageSize;
    const maxItems = config.maxPages * pageSize;

    for (let i = 0; i < maxItems; i++) {
      const page = Math.floor(i / pageSize);
      const rowOnPage = (i % pageSize) + 1;
      const tpl = formatTemplate(pageTemplate, { page: page + 1 });
      if (i < list.length) {
        fillFn(tpl, rowOnPage, list[i], i + 1);
      } else {
        clearRow(config, tpl, rowOnPage, i + 1);
      }
    }
  }

  function pushAll(appConfig, data) {
    const connection = getConnection();
    if (!connection?.connected || !resolveVmixConfig(appConfig).autoUpdate) return;

    const config = resolveVmixConfig(appConfig);
    const resultsList = data.mode === 'final' ? data.finalList : data.liveList;
    const leaders = data.leaders || [];

    pushPagedList(config, data.startList || [], config.templates.startlistPage, (tpl, row, athlete) => {
      fillStartlistRow(config, tpl, row, athlete);
    });

    pushPagedList(config, resultsList || [], config.templates.resultsPage, (tpl, row, athlete, place) => {
      fillRow(config, tpl, row, athlete, place);
    });

    const personalWinners = [
      { key: 'winner1', athlete: leaders[0], place: 1 },
      { key: 'winner2', athlete: leaders[1], place: 2 },
      { key: 'winner3', athlete: leaders[2], place: 3 },
    ];

    for (const winner of personalWinners) {
      const tpl = config.templates[winner.key];
      if (winner.athlete) {
        fillRow(config, tpl, 1, winner.athlete, winner.place);
      } else {
        clearRow(config, tpl, 1, winner.place);
      }
    }

    const winnersTpl = config.templates.winners;
    for (let i = 0; i < 3; i++) {
      if (leaders[i]) {
        fillRow(config, winnersTpl, i + 1, leaders[i], i + 1);
      } else {
        clearRow(config, winnersTpl, i + 1, i + 1);
      }
    }
  }

  function overlayInput(appConfig, inputName) {
    const connection = getConnection();
    if (!connection?.connected || !inputName) return;
    try {
      connection.client.send({ Function: 'OverlayInput1', Input: inputName });
    } catch (err) {
      connection.onError?.(err);
    }
  }

  function pushManualPage(appConfig, athletes, pageIndex, type) {
    const config = resolveVmixConfig(appConfig);
    const tpl =
      type === 'startlist'
        ? config.templates.startlistManual
        : config.templates.resultManual;

    for (let i = 1; i <= config.pageSize; i++) {
      const athlete = athletes?.[i - 1];
      const globalPlace = pageIndex * config.pageSize + i;
      if (type === 'startlist') {
        if (athlete) fillStartlistRow(config, tpl, i, athlete);
        else clearRow(config, tpl, i, globalPlace);
      } else if (athlete) {
        fillRow(config, tpl, i, athlete, globalPlace);
      } else {
        clearRow(config, tpl, i, globalPlace);
      }
    }
  }

  function pushWinnerOverlay(appConfig, command, data) {
    const config = resolveVmixConfig(appConfig);
    const leaders = data.leaders?.length ? data.leaders : data.displayList || [];

    if (command === 'winner1' && leaders[0]) {
      fillRow(config, config.templates.winner1, 1, leaders[0], 1);
      overlayInput(appConfig, config.templates.winner1);
      return;
    }
    if (command === 'winner2' && leaders[1]) {
      fillRow(config, config.templates.winner2, 1, leaders[1], 2);
      overlayInput(appConfig, config.templates.winner2);
      return;
    }
    if (command === 'winner3' && leaders[2]) {
      fillRow(config, config.templates.winner3, 1, leaders[2], 3);
      overlayInput(appConfig, config.templates.winner3);
      return;
    }
    if (command === 'winners') {
      for (let k = 1; k <= 3; k++) {
        if (leaders[k - 1]) fillRow(config, config.templates.winners, k, leaders[k - 1], k);
        else clearRow(config, config.templates.winners, k, k);
      }
      overlayInput(appConfig, config.templates.winners);
      return;
    }

    if (command === 'lider' && leaders[0]) {
      fillRow(config, config.templates.winner1, 1, leaders[0], 1);
      overlayInput(appConfig, config.templates.winner1);
      return;
    }
    if (command === 'lider4') {
      for (let k = 1; k <= 3; k++) {
        if (leaders[k - 1]) fillRow(config, config.templates.winners, k, leaders[k - 1], k);
        else clearRow(config, config.templates.winners, k, k);
      }
      overlayInput(appConfig, config.templates.winners);
    }
  }

  function pushLapCounter(appConfig, lapState) {
    const connection = getConnection();
    if (!connection?.connected || !lapState) return;

    const config = resolveVmixConfig(appConfig);
    const tpl = config.lapCounter?.template;
    if (!tpl) return;

    function setLapField(fieldKey, value) {
      const fieldName = config.lapCounter.fields[fieldKey];
      if (!fieldName) return;
      try {
        connection.client.send({
          Function: 'SetText',
          Input: tpl,
          SelectedName: fieldName,
          Value: value ?? '',
        });
      } catch (err) {
        connection.onError?.(err);
      }
    }

    setLapField('lap', lapState.lapLabel ?? '');
    setLapField('leader', lapState.leaderName ?? '');
    setLapField('time', lapState.splitTime ?? '');
  }

  return {
    pushAll,
    pushManualPage,
    pushWinnerOverlay,
    pushLapCounter,
    overlayInput,
    fillRow: (appConfig, tpl, rowIndex, athlete, globalPlace) => {
      fillRow(resolveVmixConfig(appConfig), tpl, rowIndex, athlete, globalPlace);
    },
  };
}

module.exports = {
  createVmixPusher,
};
