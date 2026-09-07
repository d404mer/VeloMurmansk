const fs = require('fs');

function ingestUrlFromOrigin(origin) {
  if (!origin) return '';
  const base = String(origin).trim().replace(/\/+$/, '');
  if (!base) return '';
  return `${base}/api/race`;
}

function createPublicTunnel({ getPort, getToken, getPublicUrl, onUrl, log = console.log }) {
  let tunnel = null;
  let publicOrigin = '';
  let stopping = false;
  let restartTimer = null;

  function setOrigin(origin) {
    publicOrigin = String(origin || '').replace(/\/+$/, '');
    onUrl?.(publicOrigin);
  }

  async function start() {
    stopping = false;
    const configured = getPublicUrl?.() || '';
    if (configured) setOrigin(configured);

    let Tunnel;
    let bin;
    let install;
    try {
      ({ Tunnel, bin, install } = require('cloudflared'));
    } catch (err) {
      log(`[race] tunnel: пакет cloudflared не установлен (${err.message || err})`);
      return;
    }

    try {
      if (!fs.existsSync(bin)) {
        log('[race] tunnel: скачиваю cloudflared…');
        await install(bin);
      }

      const token = getToken?.() || '';
      const port = getPort();
      const localUrl = `http://127.0.0.1:${port}`;

      if (token) {
        log('[race] tunnel: named Cloudflare tunnel (token)');
        tunnel = Tunnel.withToken(token);
      } else {
        log(`[race] tunnel: открываю публичный HTTPS → ${localUrl}`);
        tunnel = Tunnel.quick(localUrl);
      }

      tunnel.on('url', (url) => {
        setOrigin(url);
        log(`[race] публичный адрес для судей: ${ingestUrlFromOrigin(url)}`);
      });
      tunnel.on('error', (err) => {
        log(`[race] tunnel error: ${err?.message || err}`);
      });
      tunnel.on('exit', (code) => {
        tunnel = null;
        if (stopping) return;
        log(`[race] tunnel закрылся (code ${code}), повтор через 5 с`);
        if (!configured) setOrigin('');
        clearTimeout(restartTimer);
        restartTimer = setTimeout(() => {
          start().catch((err) => log(`[race] tunnel restart failed: ${err.message || err}`));
        }, 5000);
      });
    } catch (err) {
      log(`[race] tunnel failed: ${err.message || err}`);
    }
  }

  function stop() {
    stopping = true;
    clearTimeout(restartTimer);
    restartTimer = null;
    try {
      tunnel?.stop();
    } catch (_) {
      /* ignore */
    }
    tunnel = null;
  }

  function getPublicOrigin() {
    return publicOrigin || getPublicUrl?.() || '';
  }

  return { start, stop, getPublicOrigin };
}

module.exports = {
  createPublicTunnel,
  ingestUrlFromOrigin,
};
