Vue.createApp({
  data() {
    return {
      eventId: '',
      eventName: '',
      raceGuid: '',
      categories: [],
      saving: false,
      statusMessage: '',
      statusOk: false,
    };
  },
  methods: {
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
      this.raceGuid = data.raceGuid;
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
        this.statusMessage = 'Настройки сохранены. Данные обновляются...';
        this.raceGuid = res.data.data.raceGuid;
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
