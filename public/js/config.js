Vue.createApp({
  data() {
    return {
      eventId: '',
      eventName: '',
      currentRaceName: 'Текущая гонка',
      currentRaceNameAuto: true,
      raceGuid: '',
      dataSource: 'limetime',
      ingestDebug: false,
      serverHost: '0.0.0.0',
      serverPort: 3000,
      listenHost: '0.0.0.0',
      listenPort: 3000,
      ingestUrls: [],
      ingestCopyStatus: '',
      ingestCopyTimer: null,
      categories: [],
      saving: false,
      statusMessage: '',
      statusOk: false,
    };
  },
  computed: {
    ingestUrl() {
      if (this.ingestUrls.length) return this.ingestUrls[0];
      const host =
        this.listenHost === '0.0.0.0' || this.listenHost === '::'
          ? window.location.hostname || '127.0.0.1'
          : this.listenHost;
      return `http://${host}:${this.listenPort}/api/race`;
    },
    serverRestartRequired() {
      return (
        String(this.serverHost) !== String(this.listenHost) ||
        Number(this.serverPort) !== Number(this.listenPort)
      );
    },
  },
  methods: {
    copyIngestUrl() {
      const url = this.ingestUrl;
      const done = () => {
        this.ingestCopyStatus = 'Скопировано';
        if (this.ingestCopyTimer) clearTimeout(this.ingestCopyTimer);
        this.ingestCopyTimer = setTimeout(() => {
          this.ingestCopyStatus = '';
        }, 2000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(url).then(done).catch(() => {
          this.ingestCopyStatus = 'Не удалось скопировать';
        });
      }
      const input = document.createElement('textarea');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      try {
        document.execCommand('copy');
        done();
      } catch (_) {
        this.ingestCopyStatus = 'Не удалось скопировать';
      }
      document.body.removeChild(input);
    },

    emptyCategory(overrides = {}) {
      return {
        id: '',
        name: '',
        url: '',
        stageGuid: '',
        categoryGuid: '',
        parseError: '',
        ...overrides,
      };
    },

    async loadSetup() {
      const res = await axios.get('/api/setup');
      if (!res.data.ok) {
        this.statusMessage = res.data.error || 'Не удалось загрузить настройки';
        this.statusOk = false;
        return;
      }

      const data = res.data.data;
      this.eventId = data.eventId;
      this.eventName = data.eventName;
      this.currentRaceName = data.currentRaceName || 'Текущая гонка';
      this.currentRaceNameAuto = data.currentRaceNameAuto !== false;
      this.raceGuid = data.raceGuid;
      this.dataSource = data.dataSource === 'http' ? 'http' : 'limetime';
      this.ingestDebug = !!data.ingestDebug;
      this.serverHost = data.server?.host || '0.0.0.0';
      this.serverPort = Number(data.server?.port) || 3000;
      this.listenHost = data.listen?.host || this.serverHost;
      this.listenPort = Number(data.listen?.port) || this.serverPort;
      this.ingestUrls = Array.isArray(data.ingestUrls) ? data.ingestUrls : [];
      this.categories = data.categories.map((cat) =>
        this.emptyCategory({
          id: cat.id,
          name: cat.name,
          url: cat.url,
          stageGuid: cat.stageGuid,
          categoryGuid: cat.categoryGuid,
        })
      );

      for (let i = 0; i < this.categories.length; i++) {
        if (this.categories[i].url) {
          await this.parseCategory(i);
        }
      }
    },

    async parseCategory(index) {
      const cat = this.categories[index];
      const url = (cat.url || '').trim();

      if (!url) {
        cat.stageGuid = '';
        cat.categoryGuid = '';
        cat.parseError = '';
        this.updateRaceGuidFromCategories();
        return;
      }

      try {
        const res = await axios.post('/api/setup/parse', { url });
        if (!res.data.ok) {
          cat.parseError = res.data.error;
          cat.stageGuid = '';
          cat.categoryGuid = '';
        } else {
          cat.parseError = '';
          cat.stageGuid = res.data.data.stageGuid;
          cat.categoryGuid = res.data.data.categoryGuid;
        }
      } catch (err) {
        cat.parseError = err.response?.data?.error || err.message;
        cat.stageGuid = '';
        cat.categoryGuid = '';
      }

      this.updateRaceGuidFromCategories();
    },

    onPaste(index) {
      setTimeout(() => this.parseCategory(index), 0);
    },

    updateRaceGuidFromCategories() {
      const parsed = this.categories.filter((c) => c.stageGuid && !c.parseError);
      if (!parsed.length) {
        this.raceGuid = '';
        return;
      }

      axios
        .post('/api/setup/parse', { url: parsed[0].url })
        .then((res) => {
          if (res.data.ok) {
            this.raceGuid = res.data.data.raceGuid;
          }
        })
        .catch(() => {});
    },

    async save() {
      this.saving = true;
      this.statusMessage = '';
      this.statusOk = false;

      try {
        const res = await axios.post('/api/setup', {
          eventId: this.eventId,
          eventName: this.eventName,
          currentRaceName: this.currentRaceName,
          currentRaceNameAuto: this.currentRaceNameAuto,
          dataSource: this.dataSource,
          ingestDebug: this.ingestDebug,
          server: {
            host: this.serverHost,
            port: this.serverPort,
          },
          categories: this.categories.map((cat) => ({
            id: cat.id,
            name: cat.name,
            url: cat.url,
          })),
        });

        if (!res.data.ok) {
          this.statusMessage = res.data.error || 'Ошибка сохранения';
          return;
        }

        this.statusOk = true;
        this.statusMessage = this.serverRestartRequired
          ? 'Настройки сохранены. Перезапустите node server.js, чтобы сменить host/port.'
          : 'Настройки сохранены. Данные обновляются...';
        this.raceGuid = res.data.data.raceGuid;
        if (res.data.data.listen) {
          this.listenHost = res.data.data.listen.host;
          this.listenPort = res.data.data.listen.port;
        }
        if (Array.isArray(res.data.data.ingestUrls)) {
          this.ingestUrls = res.data.data.ingestUrls;
        }
      } catch (err) {
        this.statusMessage = err.response?.data?.error || err.message || 'Ошибка сохранения';
      } finally {
        this.saving = false;
      }
    },
  },
  beforeMount() {
    this.loadSetup();
  },
}).mount('#app');
