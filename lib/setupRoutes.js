const express = require('express');
const { buildSetupView, applySetup, parseLimetimeUrl } = require('./configEditor');

function createSetupRoutes({
  getConfig,
  getListenConfig,
  getIngestUrls,
  beginConfigUpdate,
  saveConfig,
  onConfigSaved,
}) {
  const router = express.Router();

  function attachListen(data) {
    if (typeof getListenConfig === 'function') {
      data.listen = getListenConfig();
    }
    if (typeof getIngestUrls === 'function') {
      data.ingestUrls = getIngestUrls();
    }
    return data;
  }

  router.get('/api/setup', (req, res) => {
    try {
      res.json({ ok: true, data: attachListen(buildSetupView(getConfig())) });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || String(err) });
    }
  });

  router.post('/api/setup/parse', (req, res) => {
    try {
      const parsed = parseLimetimeUrl(req.body?.url);
      res.json({ ok: true, data: parsed });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message || String(err) });
    }
  });

  router.post('/api/setup', async (req, res) => {
    try {
      if (typeof beginConfigUpdate === 'function') beginConfigUpdate();
      const config = getConfig();
      applySetup(config, req.body);
      saveConfig(config);

      if (onConfigSaved) {
        await onConfigSaved(config);
      }

      res.json({ ok: true, data: attachListen(buildSetupView(config)) });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message || String(err) });
    }
  });

  return router;
}

module.exports = {
  createSetupRoutes,
};
