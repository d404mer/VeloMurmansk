(function () {
  const MAX_PLAQUES = 4;
  const MAX_FOLLOWERS = MAX_PLAQUES - 1;
  const SHIFT_MS = 420;
  const CLEAR_MS = 420;
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

  const stackInner = document.getElementById('plaque-stack-inner');
  const leaderSlot = document.getElementById('plaque-leader-slot');
  const track = document.getElementById('plaque-track');
  const plaqueStack = document.getElementById('plaque-stack');
  const testPanel = document.getElementById('test-panel');
  const lapStatusEl = document.getElementById('lap-status');

  let lapsMode = 'leader';
  let appliedFontsKey = '';
  let hideTeamWord = false;
  let leaderPlaque = null;
  const followers = [];
  const eventQueue = [];
  const seenEventIds = new Set();
  let shifting = false;
  let clearing = false;
  let currentCompletedLap = null;
  let leaderNumber = '';
  let demoTimer = null;
  let demoLap = 1;

  const demoCarousel = [
    { place: 1, number: 42, name: 'СОФИЯ РОСТОВЩИКОВА', gap: '', splitTime: '12:34.5' },
    { place: 2, number: 33, name: 'АННА СМИРНОВА', gap: '+0:45' },
    { place: 3, number: 7, name: 'ВСЕВОЛОД БОЙЧУК', gap: '+2:46' },
    { place: 5, number: 18, name: 'ИВАН ПЕТРОВ', gap: '+1:12' },
    { place: 4, number: 55, name: 'МАРИЯ ВОЛКОВА', gap: '+1:58' },
    { place: 8, number: 91, name: 'ДМИТРИЙ КОЗЛОВ', gap: '+3:20' },
    { place: 6, number: 12, name: 'АЛЕКСЕЙ НОВИКОВ', gap: '+2:05' },
    { place: 7, number: 64, name: 'ЕКАТЕРИНА ЛЕБЕДЕВА', gap: '+2:30' },
  ];
  let demoIndex = 0;

  function isLeaderMode() {
    return lapsMode !== 'all';
  }

  function maxVisibleFollowers() {
    return isLeaderMode() ? MAX_FOLLOWERS : MAX_PLAQUES;
  }

  function isLeaderEvent(event) {
    if (!isLeaderMode()) return false;
    if (Number(event.place) === 1) return true;
    if (leaderNumber !== '' && String(event.number) === String(leaderNumber)) return true;
    return false;
  }

  function gapField(event) {
    if (!isLeaderMode()) {
      return event.gap ?? event.splitTime ?? '00:00';
    }
    if (isLeaderEvent(event)) {
      return event.splitTime || event.gap || '00:00';
    }
    return event.gap ?? '00:00';
  }

  function applyLapsMode(mode) {
    const nextMode = mode === 'all' ? 'all' : 'leader';
    if (lapsMode === nextMode) return;
    lapsMode = nextMode;
    if (plaqueStack) {
      plaqueStack.classList.toggle('plaque-stack--all-mode', nextMode === 'all');
    }
    clearPlaques();
    seenEventIds.clear();
  }

  function applyFonts(fonts) {
    if (!fonts || typeof fonts !== 'object') return;
    const base = Number(fonts.base);
    const name = Number(fonts.name);
    const number = Number(fonts.number);
    const next = {
      base: Number.isFinite(base) ? base : 18,
      name: Number.isFinite(name) ? name : 18,
      number: Number.isFinite(number) ? number : 13,
    };
    const key = `${next.base}|${next.name}|${next.number}`;
    if (key === appliedFontsKey) return;
    appliedFontsKey = key;
    const root = document.documentElement.style;
    root.setProperty('--plaque-font-size', `${next.base}px`);
    root.setProperty('--plaque-font-size-name', `${next.name}px`);
    root.setProperty('--plaque-font-size-number', `${next.number}px`);
  }

  function stripTeamWord(name) {
    return String(name || '')
      .replace(/(^|\s)команда(?=\s|$)/gi, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function displayName(name) {
    const raw = name == null ? '' : String(name);
    return hideTeamWord ? stripTeamWord(raw) : raw;
  }

  function setPlaqueName(el, rawName) {
    const nameEl = el.querySelector('.plaque__name .plaque__fit');
    if (nameEl) nameEl.textContent = displayName(rawName);
  }

  function refreshVisibleNames() {
    if (leaderPlaque?.el) setPlaqueName(leaderPlaque.el, leaderPlaque.rawName);
    for (const entry of followers) {
      if (entry?.el) setPlaqueName(entry.el, entry.rawName);
    }
  }

  function applyHideTeamWord(enabled) {
    const next = !!enabled;
    if (hideTeamWord === next) return;
    hideTeamWord = next;
    refreshVisibleNames();
  }

  function createPlaqueEl(event) {
    const el = document.createElement('div');
    el.className = 'plaque';
    el.innerHTML =
      `<div class="plaque__place"><span class="plaque__fit-wrap"><span class="plaque__fit">${escapeHtml(String(event.place ?? ''))}</span></span></div>` +
      `<div class="plaque__number"><span class="plaque__fit-wrap"><span class="plaque__fit">${escapeHtml(String(event.number ?? ''))}</span></span></div>` +
      `<div class="plaque__name"><span class="plaque__fit-wrap"><span class="plaque__fit">${escapeHtml(displayName(event.name))}</span></span></div>` +
      `<div class="plaque__gap"><span class="plaque__fit-wrap"><span class="plaque__fit">${escapeHtml(String(gapField(event)))}</span></span></div>`;
    return el;
  }

  function fillPlaqueEl(el, event) {
    const fields = [event.place, event.number, displayName(event.name), gapField(event)];
    el.querySelectorAll('.plaque__fit').forEach((textEl, index) => {
      textEl.textContent = fields[index] == null ? '' : String(fields[index]);
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

  function resetStackInner() {
    stackInner.style.transition = 'none';
    stackInner.classList.remove('plaque-stack-inner--clear');
    stackInner.style.transform = '';
    void stackInner.offsetHeight;
    stackInner.style.transition = '';
  }

  function revealPlaque(el) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.add('plaque--visible');
      });
    });
  }

  function waitTransition(el, timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      function complete() {
        if (done) return;
        done = true;
        resolve();
      }
      if (!el) {
        complete();
        return;
      }
      el.addEventListener(
        'transitionend',
        (e) => {
          if (e.target !== el) return;
          complete();
        },
        { once: true }
      );
      setTimeout(complete, timeoutMs + 80);
    });
  }

  function appendLeader(event) {
    if (leaderPlaque) {
      leaderPlaque.id = event.id;
      leaderPlaque.rawName = event.name ?? '';
      fillPlaqueEl(leaderPlaque.el, event);
      return;
    }

    const el = createPlaqueEl(event);
    leaderPlaque = { el, id: event.id, isLeader: true, rawName: event.name ?? '' };
    leaderSlot.appendChild(el);
    revealPlaque(el);
  }

  function finishFollowerShift(removedEntry) {
    if (removedEntry) {
      const idx = followers.indexOf(removedEntry);
      if (idx >= 0) followers.splice(idx, 1);
      removedEntry.el.remove();
    }
    resetTrackPosition();
    shifting = false;
    processQueue();
  }

  function shiftOldestFollower(el, entry) {
    shifting = true;
    const oldest = followers[0];

    if (!oldest) {
      track.appendChild(el);
      followers.push(entry);
      shifting = false;
      revealPlaque(el);
      processQueue();
      return;
    }

    el.classList.add('plaque--instant', 'plaque--visible');
    track.appendChild(el);
    followers.push(entry);

    requestAnimationFrame(() => {
      track.classList.add('plaque-track--shift');
    });

    waitTransition(track, SHIFT_MS).then(() => {
      finishFollowerShift(oldest);
    });
  }

  function appendFollower(event) {
    const el = createPlaqueEl(event);
    const entry = { el, id: event.id, isLeader: false, rawName: event.name ?? '' };

    if (followers.length >= maxVisibleFollowers()) {
      shiftOldestFollower(el, entry);
      return;
    }

    track.appendChild(el);
    followers.push(entry);
    revealPlaque(el);
  }

  function appendPlaque(event) {
    if (!isLeaderMode()) {
      appendFollower(event);
      return;
    }
    if (isLeaderEvent(event)) {
      appendLeader(event);
    } else {
      appendFollower(event);
    }
  }

  function enqueuePlaque(event) {
    if (!event || !event.id) return;
    if (seenEventIds.has(event.id)) return;

    if (currentCompletedLap != null) {
      const lapNum = Number(event.lapNumber);
      if (Number.isFinite(lapNum) && lapNum !== Number(currentCompletedLap)) {
        seenEventIds.add(event.id);
        return;
      }
    }

    seenEventIds.add(event.id);
    eventQueue.push(event);
    processQueue();
  }

  function processQueue() {
    if (shifting || clearing || !eventQueue.length) return;

    const event = eventQueue.shift();
    appendPlaque(event);

    if (!shifting && !clearing && eventQueue.length) {
      const next = eventQueue[0];
      if (isLeaderEvent(next) || followers.length < maxVisibleFollowers()) {
        processQueue();
      }
    }
  }

  function removeAllPlaquesNow() {
    resetTrackPosition();
    resetStackInner();
    leaderPlaque = null;
    followers.length = 0;
    if (leaderSlot) leaderSlot.replaceChildren();
    if (track) track.replaceChildren();
  }

  function clearAllAnimated() {
    return new Promise((resolve) => {
      if (!leaderPlaque && !followers.length) {
        resolve();
        return;
      }

      clearing = true;
      eventQueue.length = 0;
      shifting = false;
      resetTrackPosition();

      const row =
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--plaque-row-height')
        ) || 33;
      const gap =
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--plaque-stack-gap')
        ) || 7;
      const count = (isLeaderMode() && leaderPlaque ? 1 : 0) + followers.length;
      const distance = count * row + Math.max(0, count - 1) * gap;

      let finished = false;
      function complete() {
        if (finished) return;
        finished = true;
        removeAllPlaquesNow();
        clearing = false;
        resolve();
      }

      requestAnimationFrame(() => {
        stackInner.style.transform = `translateY(${-distance}px)`;
      });

      waitTransition(stackInner, CLEAR_MS).then(complete);
    });
  }

  function clearPlaques() {
    if (demoTimer) {
      clearInterval(demoTimer);
      demoTimer = null;
    }
    shifting = false;
    clearing = false;
    eventQueue.length = 0;
    removeAllPlaquesNow();
  }

  async function handleLapState(lapState) {
    if (!lapState) return;

    if (lapState.leaderNumber != null && lapState.leaderNumber !== '') {
      leaderNumber = String(lapState.leaderNumber);
    }

    const completed = Number(lapState.completedLap);
    if (!Number.isFinite(completed)) return;

    if (currentCompletedLap == null) {
      currentCompletedLap = completed;
      return;
    }

    if (completed > currentCompletedLap) {
      currentCompletedLap = completed;
      await clearAllAnimated();
      processQueue();
    } else if (completed < currentCompletedLap) {
      currentCompletedLap = completed;
      await clearAllAnimated();
      seenEventIds.clear();
    }
  }

  function nextDemoEvent(forceLeader) {
    let item;
    if (forceLeader) {
      item = demoCarousel.find((row) => Number(row.place) === 1) || demoCarousel[0];
    } else {
      item = demoCarousel[demoIndex];
      demoIndex = (demoIndex + 1) % demoCarousel.length;
      if (Number(item.place) === 1 && leaderPlaque) {
        item = demoCarousel[demoIndex];
        demoIndex = (demoIndex + 1) % demoCarousel.length;
      }
    }

    return {
      id: `demo-${Date.now()}-${demoIndex}-${Math.random().toString(36).slice(2, 7)}`,
      lapNumber: demoLap,
      ...item,
    };
  }

  function startDemo() {
    currentCompletedLap = demoLap;
    leaderNumber = '42';
    const leader = nextDemoEvent(true);
    seenEventIds.add(leader.id);
    appendPlaque(leader);

    for (let i = 0; i < 3; i++) {
      const event = nextDemoEvent(false);
      if (Number(event.place) === 1) continue;
      seenEventIds.add(event.id);
      appendPlaque(event);
    }

    let tick = 0;
    demoTimer = setInterval(() => {
      tick += 1;
      if (tick % 5 === 0) {
        demoLap += 1;
        currentCompletedLap = demoLap;
        clearAllAnimated().then(() => {
          const leaderEvent = nextDemoEvent(true);
          seenEventIds.add(leaderEvent.id);
          enqueuePlaque(leaderEvent);
        });
        return;
      }
      enqueuePlaque(nextDemoEvent(false));
    }, DEMO_MS);
  }

  function updateLapStatus(lapState) {
    if (!lapStatusEl || !lapState) return;
    const parts = [
      lapState.lapLabel || (lapState.currentLap ? `Круг ${lapState.currentLap}` : ''),
      displayName(lapState.leaderName || ''),
      lapState.splitTime ? `(${lapState.splitTime})` : '',
    ].filter(Boolean);
    lapStatusEl.textContent = parts.join(' · ');
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

        if (data.lapsMode) {
          applyLapsMode(data.lapsMode);
        }

        if (data.fonts) {
          applyFonts(data.fonts);
        }

        if (data.hideTeamWord != null) {
          applyHideTeamWord(data.hideTeamWord);
        }

        if (data.lapState) {
          updateLapStatus(data.lapState);
          await handleLapState(data.lapState);
        }

        if (clearing) return;

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

  async function simulateLeaderLap() {
    const res = await fetch('/api/laps/simulate-leader', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: categoryId || undefined }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(data.error || 'simulate-leader failed');
      if (lapStatusEl && data.error) lapStatusEl.textContent = data.error;
    }
  }

  async function simulateRandom() {
    const res = await fetch('/api/laps/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryId: categoryId || undefined,
        lapNumber: currentCompletedLap || undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(data.error || 'simulate failed');
      if (lapStatusEl && data.error) lapStatusEl.textContent = data.error;
    }
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
    document.getElementById('btn-sim-leader').addEventListener('click', simulateLeaderLap);
    document.getElementById('btn-replay').addEventListener('click', replayFromApi);
    document.getElementById('btn-clear').addEventListener('click', clearPlaques);
  }

  startPolling();
})();
