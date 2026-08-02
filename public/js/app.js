
Vue.createApp({
  data() {
    return {
      sheet1: [],
      selectedItem: 0,
      categories: [],
      activeCategoryId: '',
      activeEventId: '',
      mode: 'start',
      liveMode: 'start',
      dataFrozen: false,
      frozenAt: '',
      lastUpdated: '',
      lastError: '',
      lastExport: null,
      activeCategoryUrl: '',
      resultCount: 0,
      totalLaps: 8,
      lapState: {
        completedLap: 0,
        currentLap: 1,
        totalLaps: 0,
        lapLabel: '',
        leaderName: '',
        leaderNumber: '',
        splitTime: '',
        updatedAt: null,
      },
    };
  },
  computed: {
    flatList() {
      return this.sheet1.flat();
    },
    lapsUrl() {
      const q = this.activeCategoryId
        ? `?categoryId=${encodeURIComponent(this.activeCategoryId)}`
        : '';
      return `/laps${q}`;
    },
    modeLabel() {
      if (this.mode === 'live') return 'Промежуточные (live)';
      if (this.mode === 'final') return 'Финал';
      return 'Стартовый лист';
    },
    liveModeLabel() {
      if (this.liveMode === 'live') return 'Промежуточные (live)';
      if (this.liveMode === 'final') return 'Финал';
      return 'Стартовый лист';
    },
  },
  methods: {
    formatNum(number) {
      if (number == null || number === '') return '';
      const value = String(number);
      return value.startsWith('№') ? value : `№${value}`;
    },

    clickItem(item, index) {
      const data = { item, index };
      this.selectedItem = index;
      axios.post('/row1', data).then(() => markSelectedItem());
    },

    vmixCommand(com) {
      axios.post('/vmixCommand', { data: com });
    },

    toggleFreeze() {
      axios
        .post('/api/freeze', { frozen: !this.dataFrozen })
        .then(() => this.loadState());
    },

    changeCategory() {
      axios
        .post('/api/category', {
          eventId: this.activeEventId,
          categoryId: this.activeCategoryId,
        })
        .then(() => this.loadState());
    },

    refreshNow() {
      axios.post('/updateData').then(() => this.loadState());
    },

    exportExcel() {
      axios.post('/export').then((res) => {
        if (res.data?.export) {
          this.lastExport = res.data.export;
        }
      });
    },

    simulateLeaderLap() {
      axios
        .post('/api/laps/simulate-leader', { categoryId: this.activeCategoryId })
        .then((res) => {
          if (res.data?.lapState) {
            this.lapState = res.data.lapState;
          }
        });
    },

    resetLapCounter() {
      axios
        .post('/api/laps/reset', { categoryId: this.activeCategoryId })
        .then((res) => {
          if (res.data?.lapState) {
            this.lapState = res.data.lapState;
          }
        });
    },

    saveTotalLaps() {
      const totalLaps = Number(this.totalLaps);
      if (!Number.isFinite(totalLaps) || totalLaps < 1) return;
      axios
        .post('/api/laps/total-laps', {
          categoryId: this.activeCategoryId,
          totalLaps,
        })
        .then((res) => {
          if (res.data?.lapState) {
            this.lapState = res.data.lapState;
          }
        });
    },

    loadConfig() {
      return axios.get('/api/config').then((res) => {
        const event = res.data.events.find((e) => e.id === res.data.activeEventId);
        this.categories = event ? event.categories : [];
        this.activeCategoryId = res.data.activeCategoryId;
        this.activeEventId = res.data.activeEventId;
        this.mode = res.data.mode;
        this.liveMode = res.data.liveMode || res.data.mode;
        this.dataFrozen = !!res.data.dataFrozen;
        this.frozenAt = res.data.frozenAt || '';
        this.lastUpdated = res.data.lastUpdated || '';
        this.lastError = res.data.lastError || '';
        this.lastExport = res.data.lastExport;
        this.activeCategoryUrl = res.data.activeCategoryUrl || '';
        this.resultCount = res.data.resultCount ?? this.flatList.length;
        if (res.data.lapState) {
          this.lapState = res.data.lapState;
        }
        if (res.data.totalLaps) {
          this.totalLaps = res.data.totalLaps;
        }
      });
    },

    loadState() {
      return axios.post('/sheet1').then((res) => {
        this.sheet1 = chunkArray(res.data || [], 10);
        return this.loadConfig();
      });
    },
  },

  beforeMount() {
    this.loadState();
    setInterval(() => {
      this.loadState();
    }, 3000);
  },
}).mount('#app');

function markSelectedItem() {}

function chunkArray(array, chunkSize) {
  const resultArray = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    resultArray.push(array.slice(i, i + chunkSize));
  }
  return resultArray;
}
