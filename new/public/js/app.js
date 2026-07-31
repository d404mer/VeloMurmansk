
Vue.createApp({
  data() {
    return {
      sheet1: [],
      selectedItem: 0,
      categories: [],
      activeCategoryId: '',
      activeEventId: '',
      mode: 'start',
      lastUpdated: '',
      lastError: '',
      lastExport: null,
    };
  },
  computed: {
    modeLabel() {
      if (this.mode === 'live') return 'Промежуточные (live)';
      if (this.mode === 'final') return 'Финал';
      return 'Стартовый лист';
    },
  },
  methods: {
    clickItem(item, index) {
      const data = { item, index };
      this.selectedItem = index;
      axios.post('/row1', data).then(() => markSelectedItem());
    },

    vmixCommand(com) {
      axios.post('/vmixCommand', { data: com });
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

    loadConfig() {
      return axios.get('/api/config').then((res) => {
        const event = res.data.events.find((e) => e.id === res.data.activeEventId);
        this.categories = event ? event.categories : [];
        this.activeCategoryId = res.data.activeCategoryId;
        this.activeEventId = res.data.activeEventId;
        this.mode = res.data.mode;
        this.lastUpdated = res.data.lastUpdated || '';
        this.lastError = res.data.lastError || '';
        this.lastExport = res.data.lastExport;
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
