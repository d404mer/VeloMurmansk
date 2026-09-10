(function () {
  const MAX_PLAQUES = 4;
  const MAX_FOLLOWERS = MAX_PLAQUES - 1;
  const SHIFT_MS = 420;
  const CLEAR_MS = 420;
  const EXIT_MS = 420;
  const POLL_MS = 1000;
  const DEMO_MS = 2500;

  const params = new URLSearchParams(window.location.search);
  const isDemo = params.get('demo') === '1';
  const isTest = params.get('test') === '1';
  const isInterTest = isTest && params.get('inter') === '1';
  const categoryId = params.get('categoryId') || '';

  if (isInterTest) {
    document.title = 'Тест промежуточных плашек';
  } else if (isTest) {
    document.title = 'Тест круговых плашек';
  }

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
  const testPanelLoops = document.getElementById('test-panel-loops');
  const testPanelInter = document.getElementById('test-panel-inter');
  const lapStatusEl = document.getElementById('lap-status');
  const interStatusEl = document.getElementById('inter-status');

  const NUMBER_TRIM_DIGITS = {
    none: 0,
    tenths: 1,
    hundredths: 2,
    thousandths: 3,
    tenThousandths: 4,
  };

  let lapsMode = 'leader';
  let appliedFontsKey = '';
  let hideTeamWord = false;
  let numberTrim = 'none';
  let leaderPlaque = null;
  const followers = [];
  const eventQueue = [];
  const seenEventIds = new Set();
  let shifting = false;
  let clearing = false;
  let exiting = false;
  let currentCompletedLap = null;
  let leaderNumber = '';
  let lastLeaderRestoreKey = '';
  let lastIntermediateBoardKey = '';
  /** Only for /laps?test=1 — does not affect live Browser Source. */
  let testShowIntermediates = false;
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

  function isZeroGap(value) {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits.length > 0 && /^0+$/.test(digits);
  }

  function gapField(event) {
    if (!isLeaderMode()) {
      return event.gap ?? event.splitTime ?? '00:00';
    }
    if (isLeaderEvent(event)) {
      return event.splitTime || event.gap || '00:00';
    }
    const gap = event.gap;
    if (gap == null || gap === '' || isZeroGap(gap)) return '+0:00';
    const value = String(gap);
    if (value.startsWith('+') || value.startsWith('-')) return value;
    return `+${value}`;
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

  function trimAthleteNumber(number) {
    if (number == null || number === '') return '';
    const raw = String(number);
    const keep = NUMBER_TRIM_DIGITS[numberTrim] || 0;
    if (!keep) return raw;
    const digits = raw.replace(/^№/, '').replace(/\D/g, '');
    if (!digits) return raw;
    return String(Number(digits.slice(-keep)));
  }

  function displayNumber(number) {
    return trimAthleteNumber(number);
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

  function setPlaqueNumber(el, rawNumber) {
    const numberEl = el.querySelector('.plaque__number .plaque__fit');
    if (numberEl) numberEl.textContent = displayNumber(rawNumber);
  }

  function refreshVisibleNumbers() {
    if (leaderPlaque?.el) setPlaqueNumber(leaderPlaque.el, leaderPlaque.rawNumber);
    for (const entry of followers) {
      if (entry?.el) setPlaqueNumber(entry.el, entry.rawNumber);
    }
  }

  function applyNumberTrim(mode) {
    const next = Object.prototype.hasOwnProperty.call(NUMBER_TRIM_DIGITS, mode) ? mode : 'none';
    if (numberTrim === next) return;
    numberTrim = next;
    refreshVisibleNumbers();
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
      `<div class="plaque__number"><span class="plaque__fit-wrap"><span class="plaque__fit">${escapeHtml(displayNumber(event.number))}</span></span></div>` +
      `<div class="plaque__name"><span class="plaque__fit-wrap"><span class="plaque__fit">${escapeHtml(displayName(event.name))}</span></span></div>` +
      `<div class="plaque__gap"><span class="plaque__fit-wrap"><span class="plaque__fit">${escapeHtml(String(gapField(event)))}</span></span></div>`;
    return el;
  }

  function fillPlaqueEl(el, event) {
    const fields = [event.place, displayNumber(event.number), displayName(event.name), gapField(event)];
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
      leaderPlaque.rawNumber = event.number ?? '';
      leaderPlaque.isIntermediate = event.isIntermediate === true;
      fillPlaqueEl(leaderPlaque.el, event);
      return;
    }

    const el = createPlaqueEl(event);
    leaderPlaque = {
      el,
      id: event.id,
      isLeader: true,
      rawName: event.name ?? '',
      rawNumber: event.number ?? '',
      isIntermediate: event.isIntermediate === true,
    };
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
    const entry = {
      el,
      id: event.id,
      isLeader: false,
      rawName: event.name ?? '',
      rawNumber: event.number ?? '',
      isIntermediate: event.isIntermediate === true,
    };

    if (followers.length >= maxVisibleFollowers()) {
      shiftOldestFollower(el, entry);
      return;
    }

    track.appendChild(el);
    followers.push(entry);
    revealPlaque(el);
  }

  function detachEntry(entry) {
    if (!entry) return;
    if (leaderPlaque === entry) {
      leaderPlaque = null;
      lastLeaderRestoreKey = '';
    } else {
      const idx = followers.indexOf(entry);
      if (idx >= 0) followers.splice(idx, 1);
    }
    if (entry.el && entry.el.parentNode) {
      entry.el.remove();
    }
  }

  /** Fly plaques upward out of the stack (same timing as clear/shift). */
  function flyOutEntries(entries) {
    const list = (entries || []).filter((entry) => entry && entry.el);
    if (!list.length) return Promise.resolve();

    exiting = true;
    return Promise.all(
      list.map((entry) => {
        const el = entry.el;
        el.classList.remove('plaque--instant', 'plaque--visible');
        // Force reflow so exit transition always runs from the visible state.
        void el.offsetHeight;
        el.classList.add('plaque--exit-up');
        return waitTransition(el, EXIT_MS).then(() => {
          detachEntry(entry);
        });
      })
    ).finally(() => {
      exiting = false;
      processQueue();
    });
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

  function findVisiblePlaqueByNumber(number) {
    const key = String(number ?? '');
    if (leaderPlaque && String(leaderPlaque.rawNumber ?? '') === key) return leaderPlaque;
    return followers.find((entry) => String(entry.rawNumber ?? '') === key) || null;
  }

  function updatePlaqueFields(entry, event) {
    if (!entry || !entry.el) return;
    entry.id = event.id || entry.id;
    entry.rawName = event.name ?? entry.rawName;
    entry.rawNumber = event.number ?? entry.rawNumber;
    if (event.isIntermediate != null) {
      entry.isIntermediate = event.isIntermediate === true;
    }
    fillPlaqueEl(entry.el, event);
    refreshVisibleNames();
  }

  /**
   * Biathlon intermediate board: gaps/times update in place (no digit animation).
   * Oriented on leader's last intermediate from lapState.intermediateBoard.
   */
  function syncIntermediateBoard(board) {
    if (clearing || shifting || exiting) return;

    if (!board || !Array.isArray(board.rows) || !board.rows.length) {
      if (lastIntermediateBoardKey) {
        lastIntermediateBoardKey = '';
        const stale = followers.filter((entry) => entry.isIntermediate);
        if (stale.length) {
          flyOutEntries(stale);
        }
      }
      return;
    }

    if (currentCompletedLap != null) {
      const lapNum = Number(board.lapNumber);
      if (Number.isFinite(lapNum) && lapNum !== Number(currentCompletedLap)) {
        return;
      }
    }

    const boardKey = `${board.splitName}|${board.splitTime}|${board.rows
      .map((r) => `${r.number}:${r.gap}:${r.place}`)
      .join(';')}`;
    if (boardKey === lastIntermediateBoardKey) return;
    lastIntermediateBoardKey = boardKey;

    const wanted = new Set(board.rows.map((r) => String(r.number ?? '')));

    // Leader plaque stays pinned first — never flies out on intermediate changes.
    const stale = followers.filter((entry) => !wanted.has(String(entry.rawNumber ?? '')));

    const applyBoardRows = () => {
      if (clearing || exiting) return;
      for (const row of board.rows) {
        const event = {
          id: `inter-${board.splitName}-${row.number}-${row.splitTime || row.gap}`,
          place: row.place,
          number: row.number,
          name: row.name,
          gap: row.gap,
          splitTime: row.splitTime,
          lapNumber: board.lapNumber,
          isIntermediate: true,
        };

        const existing = findVisiblePlaqueByNumber(row.number);
        if (existing) {
          updatePlaqueFields(existing, event);
          continue;
        }

        if (isLeaderEvent(event) && isLeaderMode()) {
          appendLeader(event);
          continue;
        }

        if (followers.length >= maxVisibleFollowers()) {
          continue;
        }
        appendFollower(event);
      }
    };

    if (stale.length) {
      flyOutEntries(stale).then(applyBoardRows);
      return;
    }

    applyBoardRows();
  }

  function enqueuePlaque(event) {
    if (!event || !event.id) return;
    if (event.type === 'update' || event.isIntermediate) {
      const existing = findVisiblePlaqueByNumber(event.number);
      if (existing) {
        updatePlaqueFields(existing, event);
        return;
      }
      if (event.type === 'update') return;
    }
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
    if (shifting || clearing || exiting || !eventQueue.length) return;

    const event = eventQueue.shift();
    appendPlaque(event);

    if (!shifting && !clearing && !exiting && eventQueue.length) {
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
    lastLeaderRestoreKey = '';
    lastIntermediateBoardKey = '';
  }

  function clearAllAnimated() {
    return new Promise((resolve) => {
      if (!leaderPlaque && !followers.length) {
        resolve();
        return;
      }

      clearing = true;
      exiting = false;
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
    exiting = false;
    eventQueue.length = 0;
    removeAllPlaquesNow();
  }

  function leaderEventFromState(lapState) {
    if (!isLeaderMode() || !lapState) return null;
    const hasLeader =
      (lapState.leaderNumber != null && lapState.leaderNumber !== '') ||
      (lapState.leaderName != null && String(lapState.leaderName).trim() !== '');
    if (!hasLeader) return null;
    const completed = Number(lapState.completedLap);
    if (!Number.isFinite(completed)) return null;
    if (completed <= 0 && !lapState.splitTime) return null;
    return {
      id: `leader-state-${String(lapState.leaderNumber ?? '')}-${completed}`,
      place: 1,
      number: lapState.leaderNumber ?? '',
      name: lapState.leaderName ?? '',
      gap: lapState.splitTime || '00:00',
      lapNumber: completed,
      splitTime: lapState.splitTime || '',
    };
  }

  function ensureLeaderFromState(lapState) {
    const event = leaderEventFromState(lapState);
    if (!event || clearing) return;
    const key = `${event.number}|${event.name}|${event.splitTime}|${event.lapNumber}`;
    if (leaderPlaque && key === lastLeaderRestoreKey) return;
    lastLeaderRestoreKey = key;
    appendLeader(event);
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

        if (data.numberTrim != null) {
          applyNumberTrim(data.numberTrim);
        }

        if (data.lapState) {
          updateLapStatus(data.lapState);
          await handleLapState(data.lapState);
          ensureLeaderFromState(data.lapState);
          if (!clearing && !exiting) {
            // Live overlay: loops only. Intermediate board is opt-in per test window.
            if (isTest && testShowIntermediates) {
              syncIntermediateBoard(data.lapState.intermediateBoard);
            } else if (isTest && lastIntermediateBoardKey) {
              syncIntermediateBoard(null);
            }
          }
        }

        if (clearing || exiting) return;

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

  /* ── Local intermediate (biathlon) test — separate from loop test ── */
  const INTER_SPLITS = [
    { name: '1CP', leaderSec: 741 },
    { name: '2CP', leaderSec: 778 },
    { name: '3CP', leaderSec: 784 },
    { name: '5CP', leaderSec: 788 },
  ];
  const INTER_FOLLOWERS = [
    { place: 2, number: 33, name: 'АННА СМИРНОВА', gapSec: 18 },
    { place: 3, number: 7, name: 'ВСЕВОЛОД БОЙЧУК', gapSec: 34 },
    { place: 4, number: 55, name: 'МАРИЯ ВОЛКОВА', gapSec: 52 },
  ];

  let interSplitIndex = 0;
  let interFollowerCount = 0;
  const INTER_LAP = 2; // client filter: same completed lap

  function formatClock(totalSec) {
    const s = Math.max(0, Math.floor(totalSec));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function formatPlus(sec) {
    return `+${formatClock(sec)}`;
  }

  function updateInterStatus() {
    if (!interStatusEl) return;
    const split = INTER_SPLITS[interSplitIndex];
    interStatusEl.textContent = `${split.name} · лидер ${formatClock(split.leaderSec)} · преслед. ${interFollowerCount}`;
  }

  function buildLocalInterBoard() {
    const split = INTER_SPLITS[interSplitIndex];
    const rows = [
      {
        place: 1,
        number: 42,
        name: 'СОФИЯ РОСТОВЩИКОВА',
        gap: formatClock(split.leaderSec),
        splitTime: formatClock(split.leaderSec),
        lapNumber: INTER_LAP,
        splitName: split.name,
        isIntermediate: true,
      },
    ];
    for (let i = 0; i < interFollowerCount; i += 1) {
      const f = INTER_FOLLOWERS[i];
      if (!f) break;
      const timeSec = split.leaderSec + f.gapSec;
      rows.push({
        place: f.place,
        number: f.number,
        name: f.name,
        gap: formatPlus(f.gapSec),
        splitTime: formatClock(timeSec),
        lapNumber: INTER_LAP,
        splitName: split.name,
        isIntermediate: true,
      });
    }
    return {
      splitName: split.name,
      splitTime: formatClock(split.leaderSec),
      lapNumber: INTER_LAP,
      rows,
      updatedAt: new Date().toISOString(),
    };
  }

  function ensureInterLeaderContext() {
    applyLapsMode('leader');
    currentCompletedLap = INTER_LAP;
    leaderNumber = '42';
  }

  function simInterLeader() {
    ensureInterLeaderContext();
    interSplitIndex = 0;
    interFollowerCount = 0;
    lastIntermediateBoardKey = '';
    syncIntermediateBoard(buildLocalInterBoard());
    updateInterStatus();
  }

  function simInterFollower() {
    ensureInterLeaderContext();
    if (!leaderPlaque) {
      simInterLeader();
    }
    if (interFollowerCount >= INTER_FOLLOWERS.length) return;
    interFollowerCount += 1;
    lastIntermediateBoardKey = '';
    syncIntermediateBoard(buildLocalInterBoard());
    updateInterStatus();
  }

  function simInterNextCp() {
    ensureInterLeaderContext();
    if (!leaderPlaque) {
      simInterLeader();
      return;
    }
    if (interSplitIndex < INTER_SPLITS.length - 1) {
      interSplitIndex += 1;
    }
    lastIntermediateBoardKey = '';
    syncIntermediateBoard(buildLocalInterBoard());
    updateInterStatus();
  }

  function simInterDropFollowers() {
    ensureInterLeaderContext();
    interFollowerCount = 0;
    // Keep a truthy key so null-board path actually flies followers out.
    if (!lastIntermediateBoardKey) lastIntermediateBoardKey = 'active';
    syncIntermediateBoard(null);
    setTimeout(() => {
      lastIntermediateBoardKey = '';
      syncIntermediateBoard(buildLocalInterBoard());
      updateInterStatus();
    }, EXIT_MS + 40);
  }

  function simInterClearAll() {
    interSplitIndex = 0;
    interFollowerCount = 0;
    lastIntermediateBoardKey = '';
    clearPlaques();
    updateInterStatus();
    if (interStatusEl) interStatusEl.textContent = 'Нет отсечки';
  }

  if (isDemo) {
    startDemo();
    return;
  }

  if (isInterTest) {
    if (testPanelInter) testPanelInter.classList.remove('hidden');
    document.getElementById('btn-inter-leader')?.addEventListener('click', simInterLeader);
    document.getElementById('btn-inter-follower')?.addEventListener('click', simInterFollower);
    document.getElementById('btn-inter-next')?.addEventListener('click', simInterNextCp);
    document.getElementById('btn-inter-drop')?.addEventListener('click', simInterDropFollowers);
    document.getElementById('btn-inter-clear')?.addEventListener('click', simInterClearAll);
    // Local-only: do not poll race events (keeps loop test window independent).
    return;
  }

  if (isTest) {
    if (testPanelLoops) testPanelLoops.classList.remove('hidden');
    document.getElementById('btn-random')?.addEventListener('click', simulateRandom);
    document.getElementById('btn-sim-leader')?.addEventListener('click', simulateLeaderLap);
    document.getElementById('btn-replay')?.addEventListener('click', replayFromApi);
    document.getElementById('btn-clear')?.addEventListener('click', clearPlaques);

    const splitsSelect = document.getElementById('test-splits-filter');
    if (splitsSelect) {
      splitsSelect.value = testShowIntermediates ? 'all' : 'loop';
      splitsSelect.addEventListener('change', () => {
        testShowIntermediates = splitsSelect.value === 'all';
        if (!testShowIntermediates) {
          if (!lastIntermediateBoardKey) lastIntermediateBoardKey = 'off';
          syncIntermediateBoard(null);
        }
      });
    }
  }

  startPolling();
})();
