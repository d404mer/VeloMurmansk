
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
      lapsMode: 'leader',
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
      activeTab: 'results',
      vmixPreviewOpen: false,
      vmixPreviewLoading: false,
      vmixPreviewError: '',
      vmixPreviewInputs: {},
      vmixPreviewSelectedInput: '',
      fieldMappingPlaques: [],
      fieldMappingSelectedPlaqueId: 'startlist',
      fieldMappingDefaults: {},
      fieldMappingSourceFields: [],
      fieldMappingSaving: false,
      fieldMappingStatus: '',
      fieldMappingStatusError: false,
      vmixTemplateKeys: [],
      vmixTemplateLabels: {},
      vmixTemplatesDraft: {},
      vmixIndexedFields: [],
      vmixSingleFields: [],
      vmixTemplatesSaving: false,
      vmixTemplatesStatus: '',
      vmixTemplatesStatusError: false,
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
    vmixPreviewInputNames() {
      return Object.keys(this.vmixPreviewInputs).sort();
    },
    vmixPreviewFieldRows() {
      const fields = this.vmixPreviewInputs[this.vmixPreviewSelectedInput];
      if (!fields) return [];
      return Object.keys(fields)
        .sort()
        .map((field) => ({ field, value: fields[field] }));
    },
    fieldMappingActivePlaque() {
      return this.fieldMappingPlaques.find((plaque) => plaque.id === this.fieldMappingSelectedPlaqueId) || null;
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

    openVmixPreview() {
      this.vmixPreviewOpen = true;
      this.refreshVmixPreview();
    },

    refreshVmixPreview() {
      this.vmixPreviewLoading = true;
      this.vmixPreviewError = '';
      return axios
        .get('/api/vmix/preview')
        .then((res) => {
          if (!res.data?.ok) {
            this.vmixPreviewError = 'Не удалось загрузить превью';
            return;
          }
          this.vmixPreviewInputs = res.data.inputs || {};
          const names = Object.keys(this.vmixPreviewInputs).sort();
          if (!names.includes(this.vmixPreviewSelectedInput)) {
            this.vmixPreviewSelectedInput = names[0] || '';
          }
        })
        .catch((err) => {
          this.vmixPreviewError = err.response?.data?.error || err.message || 'Ошибка загрузки';
        })
        .finally(() => {
          this.vmixPreviewLoading = false;
        });
    },

    openFieldMappingTab() {
      this.activeTab = 'mapping';
      this.loadFieldMapping();
    },

    loadFieldMapping() {
      this.fieldMappingStatus = '';
      this.fieldMappingStatusError = false;
      return axios
        .get('/api/vmix/field-mapping')
        .then((res) => {
          if (!res.data?.ok) return;
          this.fieldMappingSourceFields = res.data.availableSourceFields || [];
          this.fieldMappingDefaults = res.data.defaultMapping || {};
          this.fieldMappingPlaques = res.data.plaques || [];
          if (
            !this.fieldMappingPlaques.some((plaque) => plaque.id === this.fieldMappingSelectedPlaqueId)
          ) {
            this.fieldMappingSelectedPlaqueId = this.fieldMappingPlaques[0]?.id || '';
          }
        })
        .catch((err) => {
          this.fieldMappingStatus = err.response?.data?.error || err.message || 'Ошибка загрузки';
          this.fieldMappingStatusError = true;
        });
    },

    saveFieldMapping() {
      this.fieldMappingSaving = true;
      this.fieldMappingStatus = '';
      this.fieldMappingStatusError = false;
      return axios
        .post('/api/vmix/field-mapping', { plaques: this.fieldMappingPlaques })
        .then((res) => {
          if (!res.data?.ok) {
            this.fieldMappingStatus = 'Не удалось сохранить';
            this.fieldMappingStatusError = true;
            return;
          }
          this.fieldMappingPlaques = res.data.plaques || [];
          this.fieldMappingStatus = 'Сохранено';
        })
        .catch((err) => {
          this.fieldMappingStatus = err.response?.data?.error || err.message || 'Ошибка сохранения';
          this.fieldMappingStatusError = true;
        })
        .finally(() => {
          this.fieldMappingSaving = false;
        });
    },

    openVmixTemplatesTab() {
      this.activeTab = 'templates';
      this.loadVmixTemplates();
    },

    objectToFieldEntries(obj) {
      return Object.keys(obj || {})
        .sort()
        .map((key) => ({ key, value: obj[key] }));
    },

    fieldEntriesToObject(entries) {
      const result = {};
      for (const row of entries || []) {
        const key = String(row.key || '').trim();
        const value = String(row.value || '').trim();
        if (!key) continue;
        result[key] = value;
      }
      return result;
    },

    loadVmixTemplates() {
      this.vmixTemplatesStatus = '';
      this.vmixTemplatesStatusError = false;
      return axios
        .get('/api/vmix/templates')
        .then((res) => {
          if (!res.data?.ok) {
            this.vmixTemplatesStatus = res.data?.error || 'Не удалось загрузить';
            this.vmixTemplatesStatusError = true;
            return;
          }
          this.vmixTemplateKeys = res.data.templateKeys || Object.keys(res.data.templates || {});
          this.vmixTemplateLabels = res.data.templateLabels || {};
          this.vmixTemplatesDraft = { ...(res.data.templates || {}) };
          this.vmixIndexedFields = this.objectToFieldEntries(res.data.indexedFields);
          this.vmixSingleFields = this.objectToFieldEntries(res.data.singleFields);
        })
        .catch((err) => {
          this.vmixTemplatesStatus = err.response?.data?.error || err.message || 'Ошибка загрузки';
          this.vmixTemplatesStatusError = true;
        });
    },

    addIndexedField() {
      this.vmixIndexedFields.push({ key: '', value: '' });
    },

    removeIndexedField(index) {
      this.vmixIndexedFields.splice(index, 1);
    },

    addSingleField() {
      this.vmixSingleFields.push({ key: '', value: '' });
    },

    removeSingleField(index) {
      this.vmixSingleFields.splice(index, 1);
    },

    saveVmixTemplates() {
      this.vmixTemplatesSaving = true;
      this.vmixTemplatesStatus = '';
      this.vmixTemplatesStatusError = false;
      const payload = {
        templates: { ...this.vmixTemplatesDraft },
        indexedFields: this.fieldEntriesToObject(this.vmixIndexedFields),
        singleFields: this.fieldEntriesToObject(this.vmixSingleFields),
      };
      return axios
        .post('/api/vmix/templates', payload)
        .then((res) => {
          if (!res.data?.ok) {
            this.vmixTemplatesStatus = res.data?.error || 'Не удалось сохранить';
            this.vmixTemplatesStatusError = true;
            return;
          }
          this.vmixTemplateKeys = res.data.templateKeys || this.vmixTemplateKeys;
          this.vmixTemplateLabels = res.data.templateLabels || this.vmixTemplateLabels;
          this.vmixTemplatesDraft = { ...(res.data.templates || {}) };
          this.vmixIndexedFields = this.objectToFieldEntries(res.data.indexedFields);
          this.vmixSingleFields = this.objectToFieldEntries(res.data.singleFields);
          this.vmixTemplatesStatus = 'Сохранено';
        })
        .catch((err) => {
          this.vmixTemplatesStatus = err.response?.data?.error || err.message || 'Ошибка сохранения';
          this.vmixTemplatesStatusError = true;
        })
        .finally(() => {
          this.vmixTemplatesSaving = false;
        });
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

    saveLapsMode() {
      axios
        .post('/api/laps/mode', { mode: this.lapsMode })
        .catch((err) => {
          this.lastError = err.response?.data?.error || err.message || 'Ошибка смены режима отсечек';
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
        if (res.data.lapsMode) {
          this.lapsMode = res.data.lapsMode;
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
