(function () {
  const MAX_PLAQUES = 4;
  const SHIFT_MS = 420;
  const POLL_MS = 1000;
  const DEMO_MS = 2500;

  const params = new URLSearchParams(window.location.search);
  const isDemo = params.get('demo') === '1';
  const isTest = params.get('test') === '1';
  const categoryId = params.get('categoryId') || '';

  const cssVarFromParam = {
    left: '--plaque-left',
    top: '--plaque-top',
    width: '--plaque-width',
    place: '--plaque-place',
    number: '--plaque-number',
    gap: '--plaque-gap-w',
    innerGap: '--plaque-inner-gap',
    stackGap: '--plaque-stack-gap',
  };

  for (const [param, cssVar] of Object.entries(cssVarFromParam)) {
    const value = params.get(param);
    if (!value) continue;
    const withUnit = /^\d+(\.\d+)?$/.test(value) ? `${value}px` : value;
    document.documentElement.style.setProperty(cssVar, withUnit);
  }

  const track = document.getElementById('plaque-track');
  const testPanel = document.getElementById('test-panel');
  const plaques = [];
  const eventQueue = [];
  const seenEventIds = new Set();
  let shifting = false;
  let demoTimer = null;

  const demoCarousel = [
    { place: 3, number: 7, name: 'ВСЕВОЛОД БОЙЧУК', gap: '+2:46' },
    { place: 1, number: 42, name: 'СОФИЯ РОСТОВЩИКОВА', gap: '' },
    { place: 5, number: 18, name: 'ИВАН ПЕТРОВ', gap: '+1:12' },
    { place: 2, number: 33, name: 'АННА СМИРНОВА', gap: '+0:45' },
    { place: 8, number: 91, name: 'ДМИТРИЙ КОЗЛОВ', gap: '+3:20' },
    { place: 4, number: 55, name: 'МАРИЯ ВОЛКОВА', gap: '+1:58' },
    { place: 6, number: 12, name: 'АЛЕКСЕЙ НОВИКОВ', gap: '+2:05' },
    { place: 7, number: 64, name: 'ЕКАТЕРИНА ЛЕБЕДЕВА', gap: '+2:30' },
  ];
  let demoIndex = 0;

  function createPlaqueEl(event) {
    const el = document.createElement('div');
    el.className = 'plaque';
    el.innerHTML =
      `<div class="plaque__place"><span class="plaque__fit-wrap"><span class="plaque__fit">${escapeHtml(String(event.place ?? ''))}</span></span></div>` +
      `<div class="plaque__number"><span class="plaque__fit-wrap"><span class="plaque__fit">${escapeHtml(String(event.number ?? ''))}</span></span></div>` +
      `<div class="plaque__name"><span class="plaque__fit-wrap"><span class="plaque__fit">${escapeHtml(String(event.name ?? ''))}</span></span></div>` +
      `<div class="plaque__gap"><span class="plaque__fit-wrap"><span class="plaque__fit">${escapeHtml(String(event.gap ?? ''))}</span></span></div>`;
    fitPlaqueText(el);
    return el;
  }

  function fitPlaqueText(plaqueEl) {
    plaqueEl.querySelectorAll('.plaque__fit-wrap').forEach((wrap) => {
      const textEl = wrap.querySelector('.plaque__fit');
      if (!textEl || !textEl.textContent) return;

      textEl.style.transform = 'none';
      const available = wrap.clientWidth;
      const natural = textEl.getBoundingClientRect().width;

      if (natural > available && available > 0) {
        textEl.style.transform = `scale(${available / natural})`;
      }
    });
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function resetTrackPosition() {
    track.style.transition = 'none';
    track.classList.remove('plaque-track--shift');
    void track.offsetHeight;
    track.style.transition = '';
  }

  function finishShift() {
    const removed = plaques.shift();
    if (removed) removed.el.remove();
    resetTrackPosition();
    shifting = false;
    processQueue();
  }

  function shiftPlaquesUp(el, entry) {
    shifting = true;
    let finished = false;

    function completeShift() {
      if (finished) return;
      finished = true;
      finishShift();
    }

    plaques[0].el.classList.add('plaque--leaving-top');
    track.appendChild(el);
    plaques.push(entry);

    requestAnimationFrame(() => {
      track.classList.add('plaque-track--shift');
    });

    track.addEventListener(
      'transitionend',
      (e) => {
        if (e.target !== track) return;
        completeShift();
      },
      { once: true }
    );

    setTimeout(completeShift, SHIFT_MS + 80);
  }

  function appendPlaque(event) {
    const el = createPlaqueEl(event);
    const entry = { el, id: event.id };

    if (plaques.length >= MAX_PLAQUES) {
      el.classList.add('plaque--instant');
      shiftPlaquesUp(el, entry);
      return;
    }

    track.appendChild(el);
    plaques.push(entry);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.add('plaque--visible');
      });
    });
  }

  function enqueuePlaque(event) {
    if (!event || !event.id) return;
    if (seenEventIds.has(event.id)) return;
    seenEventIds.add(event.id);
    eventQueue.push(event);
    processQueue();
  }

  function processQueue() {
    if (shifting || !eventQueue.length) return;
    appendPlaque(eventQueue.shift());
    if (!shifting && eventQueue.length && plaques.length < MAX_PLAQUES) {
      processQueue();
    }
  }

  function clearPlaques() {
    if (demoTimer) clearInterval(demoTimer);
    shifting = false;
    eventQueue.length = 0;
    seenEventIds.clear();
    resetTrackPosition();
    while (plaques.length) {
      const entry = plaques.pop();
      entry.el.remove();
    }
  }

  function nextDemoEvent() {
    const item = demoCarousel[demoIndex];
    demoIndex = (demoIndex + 1) % demoCarousel.length;
    return {
      id: `demo-${Date.now()}-${demoIndex}-${Math.random().toString(36).slice(2, 7)}`,
      ...item,
    };
  }

  function startDemo() {
    for (let i = 0; i < MAX_PLAQUES; i++) {
      const event = nextDemoEvent();
      seenEventIds.add(event.id);
      appendPlaque(event);
    }
    demoTimer = setInterval(() => {
      enqueuePlaque(nextDemoEvent());
    }, DEMO_MS);
  }

  function pollUrl() {
    const parts = [];
    if (categoryId) parts.push(`categoryId=${encodeURIComponent(categoryId)}`);
    parts.push(`limit=50`);
    parts.push(`_=${Date.now()}`);
    return `/api/laps/recent?${parts.join('&')}`;
  }

  function startPolling() {
    async function poll() {
      try {
        const res = await fetch(pollUrl(), { cache: 'no-store' });
        const data = await res.json();
        if (!data.ok || !Array.isArray(data.events)) return;

        const sorted = [...data.events].sort((a, b) => {
          const ta = new Date(a.at || 0).getTime();
          const tb = new Date(b.at || 0).getTime();
          return ta - tb;
        });

        for (const event of sorted) {
          enqueuePlaque(event);
        }
      } catch (err) {
        console.error(err);
      }
    }

    poll();
    setInterval(poll, POLL_MS);
  }

  async function simulateRandom() {
    const event = nextDemoEvent();
    await fetch('/api/laps/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        place: event.place,
        number: event.number,
        name: event.name,
        gap: event.gap,
        categoryId: categoryId || undefined,
      }),
    });
  }

  async function replayFromApi() {
    const qs = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : '';
    await fetch(`/api/laps/replay${qs}`, { method: 'POST' });
  }

  if (isDemo) {
    startDemo();
    return;
  }

  if (isTest) {
    testPanel.classList.remove('hidden');
    document.getElementById('btn-random').addEventListener('click', simulateRandom);
    document.getElementById('btn-replay').addEventListener('click', replayFromApi);
    document.getElementById('btn-clear').addEventListener('click', clearPlaques);
  }

  startPolling();
})();
