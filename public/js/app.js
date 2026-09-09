
const OPERATOR_TAB_KEY = 'velo.operatorActiveTab';
const VALID_OPERATOR_TABS = new Set(['results', 'winners', 'vmix', 'mapping', 'templates']);

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
      splitsFilter: 'loop',
      lapsFonts: { base: 18, name: 18, number: 13 },
      hideTeamWord: false,
      clubNameMode: 'short',
      excelExportEnabled: true,
      flowerCeremony: true,
      breakAfterBullet: true,
      numberTrim: 'none',
      dataSource: 'limetime',
      lastIngestAt: '',
      lastIngestCount: 0,
      ingestDebug: false,
      serverHost: '0.0.0.0',
      serverPort: 3000,
      listenHost: '0.0.0.0',
      listenPort: 3000,
      ingestUrls: [],
      ingestCopyStatus: '',
      categoryNameStatus: '',
      categoryNameTimer: null,
      categoryNameEditing: false,
      ingestCopyTimer: null,
      numberTrimOptions: [
        { value: 'none', label: 'Без изменений' },
        { value: 'tenths', label: 'Десятые' },
        { value: 'hundredths', label: 'Сотые' },
        { value: 'thousandths', label: 'Тысячные' },
        { value: 'tenThousandths', label: 'Десятитысячные' },
      ],
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
      sentPageIndex: null,
      sentPageTimer: null,
      vmixPreviewOpen: false,
      vmixPreviewLoading: false,
      vmixPreviewError: '',
      vmixPreviewInputs: {},
      vmixPreviewSelectedInput: '',
      fieldMappingPlaques: [],
      fieldMappingBaseline: [],
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
    lapsTestUrl() {
      const parts = ['test=1'];
      if (this.activeCategoryId) {
        parts.push(`categoryId=${encodeURIComponent(this.activeCategoryId)}`);
      }
      return `/laps?${parts.join('&')}`;
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
    ingestUrl() {
      if (this.ingestUrls.length) return this.ingestUrls[0];
      const host =
        this.listenHost === '0.0.0.0' || this.listenHost === '::'
          ? window.location.hostname || '127.0.0.1'
          : this.listenHost;
      return `http://${host}:${this.listenPort}/api/race`;
    },
    dataSourceLabel() {
      return this.dataSource === 'http' ? 'Приём POST' : 'Опрос Limetime';
    },
    activeCategoryName: {
      get() {
        return this.categories.find((c) => c.id === this.activeCategoryId)?.name || '';
      },
      set(value) {
        const cat = this.categories.find((c) => c.id === this.activeCategoryId);
        if (cat) cat.name = value;
      },
    },
    activeCategoryNameAuto() {
      const cat = this.categories.find((c) => c.id === this.activeCategoryId);
      if (!cat) return this.activeCategoryId === 'current';
      return cat.nameAuto !== false && (cat.id === 'current' || cat.nameAuto === true);
    },
    activeCategoryIngestName() {
      return this.categories.find((c) => c.id === this.activeCategoryId)?.ingestName || '';
    },
    serverRestartRequired() {
      return (
        String(this.serverHost) !== String(this.listenHost) ||
        Number(this.serverPort) !== Number(this.listenPort)
      );
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
    isConfigTab() {
      return this.activeTab === 'mapping' || this.activeTab === 'templates';
    },
  },
  methods: {
    setActiveTab(tab) {
      if (!VALID_OPERATOR_TABS.has(tab)) return;
      this.activeTab = tab;
      localStorage.setItem(OPERATOR_TAB_KEY, tab);
    },

    formatNum(number) {
      if (number == null || number === '') return '';
      const keep = { none: 0, tenths: 1, hundredths: 2, thousandths: 3, tenThousandths: 4 }[this.numberTrim] || 0;
      let value = String(number);
      if (keep) {
        const digits = value.replace(/^№/, '').replace(/\D/g, '');
        if (digits) value = String(Number(digits.slice(-keep)));
      }
      return value.startsWith('№') ? value : `№${value}`;
    },

    markPageSent(index) {
      if (this.sentPageTimer) {
        clearTimeout(this.sentPageTimer);
      }
      this.sentPageIndex = index;
      this.sentPageTimer = setTimeout(() => {
        this.sentPageIndex = null;
        this.sentPageTimer = null;
      }, 1500);
    },

    clickItem(item, index) {
      const data = { item, index };
      this.selectedItem = index;
      axios.post('/row1', data).then(() => {
        this.markPageSent(index);
      });
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
      this.setActiveTab('mapping');
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
          this.fieldMappingBaseline = JSON.parse(JSON.stringify(this.fieldMappingPlaques));
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

    /** fieldMapping / имена полей общие — держим копии на всех плашках одинаковыми */
    syncSharedFieldSource(field) {
      if (!field?.editableSource || !field.key) return;
      const value = field.sourcePath;
      for (const plaque of this.fieldMappingPlaques) {
        for (const other of plaque.fields || []) {
          if (other.editableSource && other.key === field.key) other.sourcePath = value;
        }
      }
    },

    syncSharedFieldVmixName(field) {
      if (!field || field.editableVmixName === false) return;
      const value = field.vmixFieldName;
      const storage = field.vmixStorage;
      const configKey = field.vmixConfigKey || field.key;
      for (const plaque of this.fieldMappingPlaques) {
        for (const other of plaque.fields || []) {
          if (other.editableVmixName === false) continue;
          if (other.vmixStorage === storage && (other.vmixConfigKey || other.key) === configKey) {
            other.vmixFieldName = value;
          }
        }
      }
    },

    /** Push edits (vs loaded baseline) onto every plaque before save. */
    propagateSharedFieldEdits() {
      const vmixEdits = new Map();
      const sourceEdits = new Map();

      for (const plaque of this.fieldMappingPlaques) {
        const basePlaque = this.fieldMappingBaseline.find((item) => item.id === plaque.id);
        for (const field of plaque.fields || []) {
          const configKey = field.vmixConfigKey || field.key;
          const baseField = (basePlaque?.fields || []).find(
            (item) =>
              (item.vmixConfigKey || item.key) === configKey && item.vmixStorage === field.vmixStorage
          );

          if (field.editableVmixName !== false) {
            const currentName = String(field.vmixFieldName || '').trim();
            const baseName = String(baseField?.vmixFieldName || '').trim();
            if (currentName && currentName !== baseName) {
              vmixEdits.set(`${field.vmixStorage}|${configKey}`, currentName);
            }
          }

          if (field.editableSource && field.key) {
            const currentSource = String(field.sourcePath || '').trim();
            const baseSource = String(baseField?.sourcePath || '').trim();
            if (currentSource !== baseSource) {
              sourceEdits.set(field.key, currentSource);
            }
          }
        }
      }

      for (const plaque of this.fieldMappingPlaques) {
        for (const field of plaque.fields || []) {
          const configKey = field.vmixConfigKey || field.key;
          const vmixKey = `${field.vmixStorage}|${configKey}`;
          if (field.editableVmixName !== false && vmixEdits.has(vmixKey)) {
            field.vmixFieldName = vmixEdits.get(vmixKey);
          }
          if (field.editableSource && sourceEdits.has(field.key)) {
            field.sourcePath = sourceEdits.get(field.key);
          }
        }
      }
    },

    collectFieldMappingOverrides() {
      const indexedFields = {};
      const singleFields = {};
      const fieldMapping = {};

      const applyField = (field) => {
        const configKey = field.vmixConfigKey || field.key;
        const vmixFieldName = String(field.vmixFieldName || '').trim();
        if (vmixFieldName && field.editableVmixName !== false) {
          if (field.vmixStorage === 'indexed') indexedFields[configKey] = vmixFieldName;
          if (field.vmixStorage === 'single') singleFields[configKey] = vmixFieldName;
        }
        if (field.editableSource && field.key) {
          fieldMapping[field.key] = String(field.sourcePath || '').trim();
        }
      };

      // Baseline from all plaques, then active plaque wins on conflicts.
      for (const plaque of this.fieldMappingPlaques) {
        for (const field of plaque.fields || []) applyField(field);
      }
      const active = this.fieldMappingActivePlaque;
      if (active) {
        for (const field of active.fields || []) applyField(field);
      }

      return { indexedFields, singleFields, fieldMapping };
    },

    saveFieldMapping() {
      if (this.fieldMappingSaving) return Promise.resolve();
      this.fieldMappingSaving = true;
      this.fieldMappingStatus = '';
      this.fieldMappingStatusError = false;
      this.propagateSharedFieldEdits();
      const overrides = this.collectFieldMappingOverrides();
      return axios
        .post('/api/vmix/field-mapping', {
          plaques: this.fieldMappingPlaques,
          ...overrides,
        })
        .then((res) => {
          if (!res.data?.ok) {
            this.fieldMappingStatus = 'Не удалось сохранить';
            this.fieldMappingStatusError = true;
            return;
          }
          this.fieldMappingPlaques = res.data.plaques || [];
          this.fieldMappingBaseline = JSON.parse(JSON.stringify(this.fieldMappingPlaques));
          this.fieldMappingStatus = 'Сохранено';
          // Refresh Templates preview only (GET) — never save from that tab's draft here.
          if (this.vmixTemplateKeys.length) {
            this.loadVmixTemplates();
          }
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
      this.setActiveTab('templates');
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
      // Only Input names — SelectedName maps are owned by «Маппинг полей»
      // and must not be overwritten by a stale Templates draft.
      const payload = {
        templates: { ...this.vmixTemplatesDraft },
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
          this.vmixTemplatesStatus = 'Сохранено (только Input)';
          if (this.fieldMappingPlaques.length) {
            this.loadFieldMapping();
          }
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
      const message = this.dataFrozen
        ? 'Возобновит отправку данных в vMix и плашки. Продолжить?'
        : 'Остановит обновление vMix и плашек отсечек. Продолжить?';
      if (!window.confirm(message)) return;

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

    onCategoryNameFocus() {
      if (this.activeCategoryNameAuto) return;
      this.categoryNameEditing = true;
    },

    onCategoryNameBlur() {
      this.categoryNameEditing = false;
      if (this.activeCategoryNameAuto) return;
      this.saveActiveCategoryName();
    },

    unlockCategoryName() {
      axios
        .post('/api/category-name', {
          categoryId: this.activeCategoryId,
          nameAuto: false,
        })
        .then((res) => {
          if (Array.isArray(res.data?.categories)) {
            this.categories = res.data.categories;
          } else {
            const cat = this.categories.find((c) => c.id === this.activeCategoryId);
            if (cat) cat.nameAuto = false;
          }
          this.categoryNameEditing = true;
          this.$nextTick(() => {
            const input = document.querySelector('.category-name-input');
            if (input) {
              input.focus();
              input.select();
            }
          });
        })
        .catch((err) => {
          this.lastError = err.response?.data?.error || err.message || 'Не удалось разблокировать название';
        });
    },

    useIngestCategoryName() {
      axios
        .post('/api/category-name', {
          categoryId: this.activeCategoryId,
          nameAuto: true,
        })
        .then((res) => {
          if (Array.isArray(res.data?.categories)) {
            this.categories = res.data.categories;
          }
          this.categoryNameStatus = 'С названия гонки';
          if (this.categoryNameTimer) clearTimeout(this.categoryNameTimer);
          this.categoryNameTimer = setTimeout(() => {
            this.categoryNameStatus = '';
          }, 2000);
        })
        .catch((err) => {
          this.lastError = err.response?.data?.error || err.message || 'Не удалось вернуть автоназвание';
        });
    },

    saveActiveCategoryName() {
      const name = String(this.activeCategoryName || '').trim();
      if (!name || !this.activeCategoryId) return;
      axios
        .post('/api/category-name', {
          categoryId: this.activeCategoryId,
          name,
        })
        .then((res) => {
          if (Array.isArray(res.data?.categories)) {
            this.categories = res.data.categories;
          } else if (res.data?.name) {
            this.activeCategoryName = res.data.name;
          }
          this.categoryNameStatus = 'Сохранено, своё название';
          if (this.categoryNameTimer) clearTimeout(this.categoryNameTimer);
          this.categoryNameTimer = setTimeout(() => {
            this.categoryNameStatus = '';
          }, 2000);
        })
        .catch((err) => {
          this.lastError = err.response?.data?.error || err.message || 'Не удалось сохранить название';
        });
    },

    refreshNow() {
      axios.post('/updateData').then(() => this.loadState());
    },

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

    saveDataSource(value) {
      const previous = this.dataSource;
      this.dataSource = value === 'http' ? 'http' : 'limetime';
      return axios
        .post('/api/data-source', { dataSource: this.dataSource })
        .then(() => this.loadState())
        .catch((err) => {
          this.dataSource = previous;
          this.lastError =
            err.response?.data?.error || err.message || 'Ошибка сохранения источника данных';
        });
    },

    saveIngestDebug(enabled) {
      const previous = this.ingestDebug;
      this.ingestDebug = !!enabled;
      return axios
        .post('/api/ingest-debug', { enabled: this.ingestDebug })
        .catch((err) => {
          this.ingestDebug = previous;
          this.lastError =
            err.response?.data?.error || err.message || 'Ошибка сохранения debug JSON';
        });
    },

    saveServerListen() {
      return axios
        .post('/api/server', { host: this.serverHost, port: this.serverPort })
        .then((res) => {
          if (res.data?.server) {
            this.serverHost = res.data.server.host;
            this.serverPort = res.data.server.port;
          }
          if (res.data?.listen) {
            this.listenHost = res.data.listen.host;
            this.listenPort = res.data.listen.port;
          }
          if (res.data?.restartRequired) {
            this.lastError = '';
          }
        })
        .catch((err) => {
          this.lastError =
            err.response?.data?.error || err.message || 'Ошибка сохранения адреса сервера';
        });
    },

    exportExcel() {
      axios.post('/export').then((res) => {
        if (res.data?.export) {
          this.lastExport = res.data.export;
        }
      });
    },

    saveExcelExportEnabled(enabled) {
      const previous = this.excelExportEnabled;
      this.excelExportEnabled = !!enabled;
      return axios
        .post('/api/excel-export', { enabled: this.excelExportEnabled })
        .catch((err) => {
          this.excelExportEnabled = previous;
          this.lastError = err.response?.data?.error || err.message || 'Ошибка сохранения настройки Excel';
        });
    },

    saveFlowerCeremony(enabled) {
      const previous = this.flowerCeremony;
      this.flowerCeremony = !!enabled;
      return axios
        .post('/api/flower-ceremony', { enabled: this.flowerCeremony })
        .catch((err) => {
          this.flowerCeremony = previous;
          this.lastError =
            err.response?.data?.error || err.message || 'Ошибка сохранения режима награждения';
        });
    },

    saveBreakAfterBullet(enabled) {
      const previous = this.breakAfterBullet;
      this.breakAfterBullet = !!enabled;
      return axios
        .post('/api/break-after-bullet', { enabled: this.breakAfterBullet })
        .catch((err) => {
          this.breakAfterBullet = previous;
          this.lastError =
            err.response?.data?.error || err.message || 'Ошибка сохранения переноса после •';
        });
    },

    saveNumberTrim(mode) {
      const previous = this.numberTrim;
      this.numberTrim = mode;
      return axios
        .post('/api/number-trim', { mode: this.numberTrim })
        .then((res) => {
          if (res.data?.numberTrim) this.numberTrim = res.data.numberTrim;
        })
        .catch((err) => {
          this.numberTrim = previous;
          this.lastError =
            err.response?.data?.error || err.message || 'Ошибка сохранения обрезки номеров';
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
      if (
        !window.confirm(
          'Сбросить счётчик кругов? Текущий круг будет обнулён — действие необратимо во время гонки.'
        )
      ) {
        return;
      }

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

    saveSplitsFilter() {
      axios
        .post('/api/laps/splits', { mode: this.splitsFilter })
        .catch((err) => {
          this.lastError = err.response?.data?.error || err.message || 'Ошибка фильтра отсечек';
        });
    },

    saveLapsFonts() {
      const previous = { ...this.lapsFonts };
      const payload = {
        base: Number(this.lapsFonts.base),
        name: Number(this.lapsFonts.name),
        number: Number(this.lapsFonts.number),
      };
      return axios
        .post('/api/laps/fonts', payload)
        .then((res) => {
          if (res.data?.fonts) {
            this.lapsFonts = { ...res.data.fonts };
          }
        })
        .catch((err) => {
          this.lapsFonts = previous;
          this.lastError =
            err.response?.data?.error || err.message || 'Ошибка сохранения размера шрифта';
        });
    },

    saveClubNameMode() {
      const mode = this.clubNameMode === 'full' ? 'full' : 'short';
      this.clubNameMode = mode;
      return axios
        .post('/api/club-name-mode', { mode })
        .then(() => this.loadState())
        .catch((err) => {
          this.clubNameMode = mode === 'full' ? 'short' : 'full';
          this.lastError =
            err.response?.data?.error || err.message || 'Ошибка сохранения режима названия клуба';
        });
    },

    saveHideTeamWord(enabled) {
      const previous = this.hideTeamWord;
      this.hideTeamWord = !!enabled;
      return axios
        .post('/api/laps/hide-team-word', { enabled: this.hideTeamWord })
        .catch((err) => {
          this.hideTeamWord = previous;
          this.lastError =
            err.response?.data?.error || err.message || 'Ошибка сохранения настройки «Команда»';
        });
    },

    loadConfig() {
      return axios.get('/api/config').then((res) => {
        const event = res.data.events.find((e) => e.id === res.data.activeEventId);
        const draftName = this.categoryNameEditing ? this.activeCategoryName : null;
        this.categories = event ? event.categories : [];
        this.activeCategoryId = res.data.activeCategoryId;
        if (draftName != null) {
          const cat = this.categories.find((c) => c.id === this.activeCategoryId);
          if (cat) cat.name = draftName;
        }
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
        if (res.data.splitsFilter) {
          this.splitsFilter = res.data.splitsFilter;
        }
        if (res.data.lapsFonts) {
          this.lapsFonts = { ...res.data.lapsFonts };
        }
        if (res.data.hideTeamWord != null) {
          this.hideTeamWord = !!res.data.hideTeamWord;
        }
        if (res.data.clubNameMode) {
          this.clubNameMode = res.data.clubNameMode === 'full' ? 'full' : 'short';
        }
        if (res.data.excelExportEnabled != null) {
          this.excelExportEnabled = !!res.data.excelExportEnabled;
        }
        if (res.data.flowerCeremony != null) {
          this.flowerCeremony = !!res.data.flowerCeremony;
        }
        if (res.data.breakAfterBullet != null) {
          this.breakAfterBullet = !!res.data.breakAfterBullet;
        }
        if (res.data.numberTrim != null) {
          this.numberTrim = res.data.numberTrim;
        }
        if (res.data.dataSource) {
          this.dataSource = res.data.dataSource;
        }
        this.lastIngestAt = res.data.lastIngestAt || '';
        this.lastIngestCount = res.data.lastIngestCount ?? 0;
        if (res.data.ingestDebug != null) {
          this.ingestDebug = !!res.data.ingestDebug;
        }
        if (res.data.server) {
          this.serverHost = res.data.server.host || this.serverHost;
          this.serverPort = Number(res.data.server.port) || this.serverPort;
        }
        if (res.data.listen) {
          this.listenHost = res.data.listen.host || this.listenHost;
          this.listenPort = Number(res.data.listen.port) || this.listenPort;
        }
        this.ingestUrls = Array.isArray(res.data.ingestUrls) ? res.data.ingestUrls : [];
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
    const savedTab = localStorage.getItem(OPERATOR_TAB_KEY);
    if (savedTab && VALID_OPERATOR_TABS.has(savedTab)) {
      this.activeTab = savedTab;
    }

    this.loadState();
    setInterval(() => {
      this.loadState();
    }, 3000);
  },
}).mount('#app');

function chunkArray(array, chunkSize) {
  const resultArray = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    resultArray.push(array.slice(i, i + chunkSize));
  }
  return resultArray;
}
