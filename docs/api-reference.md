# Справочник HTTP API

Базовый URL: `http://localhost:3000` (или переменная окружения `PORT`).

Статика: каталог `public/` — HTML, JS, CSS без префикса `/api`.

---

## Страницы (GET)

| Путь | Файл | Описание |
|------|------|----------|
| `/` | `index.html` | Панель оператора |
| `/config` | `config.html` | Настройка события |
| `/laps` | `laps.html` | Browser Source плашек |

Заголовок `/laps`: `Cache-Control: no-store`.

---

## Конфигурация и состояние

### GET `/api/config`

Метаданные для UI (без полной таблицы участников).

**Ответ:**

```json
{
  "activeEventId": "xcochamp2025",
  "activeCategoryId": "women",
  "activeCategoryUrl": "https://services-results.limetime.io/results/get/...",
  "pollIntervalMs": 5000,
  "dataFrozen": false,
  "events": [
    {
      "id": "xcochamp2025",
      "name": "Чемпионат",
      "categories": [{ "id": "women", "name": "Женщины" }]
    }
  ],
  "activeEventName": "Чемпионат",
  "mode": "live",
  "liveMode": "live",
  "lastUpdated": "2026-08-11T09:00:00.000Z",
  "frozenAt": null,
  "lastError": null,
  "lastExport": { "filename": "data.xlsx", "filepath": "D:\\...\\exports\\data.xlsx" },
  "resultCount": 55,
  "lapState": {
    "completedLap": 3,
    "currentLap": 4,
    "totalLaps": 6,
    "lapLabel": "КРУГ 4/6",
    "leaderName": "ИВАНОВ ИВАН",
    "leaderNumber": "42",
    "splitTime": "1:23:45",
    "updatedAt": "2026-08-11T09:00:00.000Z"
  },
  "totalLaps": 6,
  "lapsMode": "leader",
  "excelExportEnabled": false
}
```

| Поле | Примечание |
|------|------------|
| `mode` | Режим **отображаемых** данных (с учётом freeze) |
| `liveMode` | Режим последнего poll (всегда актуальный) |
| `excelExportEnabled` | `true`, если `config.excelExportEnabled !== false` |
| `lapsMode` | `"leader"` или `"all"` |

---

### POST `/api/category`

Смена активного события и/или категории.

**Тело:**

```json
{
  "eventId": "xcochamp2025",
  "categoryId": "men"
}
```

Оба поля опциональны. При смене `categoryId`: `lapTracker.initCategory`, `vmixPusher.resetCache()`, сохранение config, `refreshData()`.

**Ответ:**

```json
{ "ok": true, "mode": "live", "count": 55 }
```

---

### POST `/api/freeze`

Заморозка/разморозка данных для vMix и плашек `/laps`.

**Тело:**

```json
{ "frozen": true }
```

При `frozen: true` — snapshot `raceData`, push snapshot в vMix.  
При `frozen: false` — `vmixPusher.resetCache()`, push live data.

**Ответ:**

```json
{
  "ok": true,
  "dataFrozen": true,
  "frozenAt": "2026-08-11T09:00:00.000Z",
  "mode": "final"
}
```

---

### POST `/api/excel-export`

Включение/выключение **автосохранения** Excel при poll. Без рестарта сервера.

**Тело:**

```json
{ "enabled": true }
```

**Ответ:**

```json
{ "ok": true, "excelExportEnabled": true }
```

**Ошибки:**

| Код | Причина |
|-----|---------|
| 400 | `enabled` не boolean: `{ "ok": false, "error": "enabled must be a boolean" }` |

> Ручной `POST /export` работает независимо от этого флага (но сам poll внутри export всё равно вызовет `saveExcel` только если автосохранение включено).

---

## Настройка события (`/api/setup`)

### GET `/api/setup`

```json
{
  "ok": true,
  "data": {
    "eventId": "xcochamp2025",
    "eventName": "Чемпионат",
    "raceGuid": "358f8164-...",
    "baseUrl": "https://services-results.limetime.io/results/get",
    "categories": [
      {
        "id": "women",
        "name": "Женщины",
        "url": "https://.../results/get/{race}/{stage}/{cat}",
        "stageGuid": "...",
        "categoryGuid": "..."
      }
    ]
  }
}
```

### POST `/api/setup/parse`

Preview парсинга Limetime URL.

**Тело:** `{ "url": "https://services-results.limetime.io/results/get/..." }`

**Ответ:** `{ "ok": true, "data": { "raceGuid", "stageGuid", "categoryGuid" } }`

**400:** `{ "ok": false, "error": "..." }`

### POST `/api/setup`

Сохранение настроек (4 категории).

**Тело:**

```json
{
  "eventId": "myevent2026",
  "eventName": "Моё событие",
  "categories": [
    { "id": "women", "name": "Женщины", "url": "https://..." },
    { "id": "men", "name": "Мужчины", "url": "https://..." },
    { "id": "junior_women", "name": "Юниорки 17-18", "url": "https://..." },
    { "id": "junior_men", "name": "Юниоры 17-18", "url": "https://..." }
  ]
}
```

После сохранения: `onConfigSaved` → sync laps, restart polling, `refreshData`.

**400:** `{ "ok": false, "error": "raceGuid не совпадает" }` и др.

---

## Данные гонки

### POST `/sheet1`

**displayList** с учётом freeze.

**Ответ:** JSON-массив строк `{ место, участник, номер, возраст, клуб, результат, доЛидера }`.

Используется UI каждые ~3 с.

---

### POST `/updateData`

Принудительный poll Limetime.

**Ответ:**

```json
{ "ok": true, "mode": "live", "count": 55 }
```

---

### POST `/export`

Poll + информация об Excel.

**Ответ:**

```json
{
  "ok": true,
  "export": { "filename": "data.xlsx", "filepath": "D:\\...\\exports\\data.xlsx" }
}
```

**500:** `{ "ok": false, "error": "..." }`

> Выполняет полный `refreshData()`. Запись в Excel — только если `excelExportEnabled`.

---

## vMix

### GET `/api/vmix/preview`

Текущий набор «Input → { SelectedName → value }» **без отправки** в vMix. Данные из `getDisplayData()` и кэша категорий.

**Ответ:**

```json
{
  "ok": true,
  "inputs": {
    "results1": {
      "class.Text": "Кубок России • Мужчины",
      "place 1.Text": "1",
      "name 1.Text": "ИВАНОВ ИВАН"
    },
    "time": {
      "lap.Text": "КРУГ 4/6",
      "class.Text": "Кубок России\nМужчины"
    }
  }
}
```

Имена Inputs соответствуют resolved `vmix.templates` (например `lapCounter` → `"time"` в config).

---

### GET `/api/vmix/templates`

Текущие шаблоны и поля для UI «vMix шаблоны».

**Ответ:**

```json
{
  "ok": true,
  "templates": {
    "resultsPage": "results{page}",
    "startlistPage": "startlist{page}",
    "winner1": "leader1",
    "winner2": "leader2",
    "winner3": "leader3",
    "winners": "winners_flowers",
    "lapCounter": "time",
    "resultManual": "results{page}",
    "startlistManual": "startlist{page}"
  },
  "indexedFields": {
    "num": "num {n}.Text",
    "name": "name {n}.Text"
  },
  "singleFields": {
    "class": "class.Text",
    "lap": "lap.Text"
  },
  "templateKeys": ["resultsPage", "startlistPage", "..."],
  "templateLabels": {
    "resultsPage": "resultsPage — страницы результатов"
  }
}
```

---

### POST `/api/vmix/templates`

Сохранение шаблонов и/или полей. Применяется сразу; `vmixPusher.resetCache()`.

**Тело (частичное обновление допустимо — нужен хотя бы один блок):**

```json
{
  "templates": {
    "resultsPage": "results{page}",
    "lapCounter": "time"
  },
  "indexedFields": {
    "num": "num {n}.Text",
    "name": "name {n}.Text"
  },
  "singleFields": {
    "lap": "lap.Text",
    "class": "class.Text"
  }
}
```

**Ответ:** `{ "ok": true, ...getTemplatesView }`

**400:** `{ "ok": false, "error": "templates: неизвестный ключ «foo»" }` и др.

---

### GET `/api/vmix/field-mapping`

Модель плашек для UI «Маппинг полей».

**Ответ:**

```json
{
  "ok": true,
  "plaques": [
    {
      "id": "startlist",
      "label": "Стартовый лист",
      "templateKey": "startlistPage",
      "templateValue": "startlist{page}",
      "fields": [
        {
          "key": "name",
          "label": "name",
          "vmixFieldName": "name {n}.Text",
          "sourcePath": "account.lastName+account.firstName",
          "editableSource": true,
          "editableVmixName": true,
          "vmixStorage": "indexed"
        }
      ]
    }
  ],
  "availableSourceFields": ["number", "club", "account.firstName", "..."],
  "defaultMapping": {
    "num": "number",
    "name": "account.lastName+account.firstName"
  }
}
```

Плашки: `startlist`, `results`, `leader1`–`leader3`, `winners`, `lapCounter`.

---

### POST `/api/vmix/field-mapping`

Сохранение маппинга из UI.

**Тело:**

```json
{
  "plaques": [
    {
      "id": "results",
      "templateValue": "results{page}",
      "fields": [
        {
          "key": "name",
          "vmixConfigKey": "name",
          "vmixFieldName": "name {n}.Text",
          "sourcePath": "account.lastName+account.firstName",
          "editableSource": true,
          "editableVmixName": true,
          "vmixStorage": "indexed"
        }
      ]
    }
  ]
}
```

**Ответ:**

```json
{ "ok": true, "plaques": [ /* обновлённый buildPlaquesView */ ] }
```

**400:** `{ "ok": false, "error": "Expected { plaques: [...] }" }`

Записывает в `config.vmix.templates`, `indexedFields`, `singleFields`, `fieldMapping`.

---

### POST `/vmixCommand`

Показ оверлея победителя(ей).

**Тело:**

```json
{ "data": "winner1" }
```

| `data` | Действие |
|--------|----------|
| `winner1`, `winner2`, `winner3` | Заполнить шаблон + `OverlayInput1` |
| `winners` | Тройной титр + overlay |
| `lider` | Legacy → winner1 |
| `lider4` | Legacy → winners |

**Ответ:** `"ok"` (text/plain).

---

### POST `/row1`

Ручная отправка страницы (клик в UI).

**Тело:**

```json
{
  "index": 0,
  "item": [ /* до 10 строк displayList */ ]
}
```

Заполняет `resultManual` и `startlistManual` для страницы `index + 1`. Diff-кэш применяется.

**Ответ:** строка `"0"` (index).

---

## Плашки кругов (`/api/laps`)

### GET `/api/laps/recent`

Polling для Browser Source (рекомендуется).

**Query:**

| Параметр | По умолчанию | Описание |
|----------|--------------|----------|
| `categoryId` | `config.activeCategoryId` | Категория |
| `limit` | 10, макс. 50 | Число последних событий |

**Ответ:**

```json
{
  "ok": true,
  "dataFrozen": false,
  "lapsMode": "leader",
  "lapState": {
    "completedLap": 5,
    "currentLap": 6,
    "totalLaps": 8,
    "lapLabel": "КРУГ 6/8",
    "leaderName": "АНТОН СИНЦОВ",
    "leaderNumber": 23,
    "splitTime": "1:24:32",
    "updatedAt": "2026-08-02T19:00:00.000Z"
  },
  "events": [
    {
      "id": "men-42:3:1:23:45-a1b2c3d4",
      "place": "3",
      "number": "42",
      "name": "ИВАН ИВАНОВ",
      "gap": "+1:12",
      "lapNumber": "3",
      "splitTime": "1:23:45",
      "at": "2026-07-31T19:00:00.000Z",
      "categoryId": "men"
    }
  ]
}
```

При `dataFrozen: true` массив `events` пустой.  
В режиме `all` поле `gap` содержит время круга (`splitTime`), не отставание.

---

### GET `/api/laps/status`

**Query:** `categoryId` (опционально)

**Ответ:**

```json
{
  "ok": true,
  "dataFrozen": false,
  "categoryId": "men",
  "lapsMode": "leader",
  "lapState": { "..." },
  "lastEvent": { "id": "...", "name": "...", "gap": "..." }
}
```

---

### POST `/api/laps/mode`

Переключение режима отсечек. Сохраняется в `config.laps.mode`.

**Тело:**

```json
{ "mode": "all" }
```

Допустимые значения: `"leader"`, `"all"`.

**Ответ:**

```json
{ "ok": true, "lapsMode": "all" }
```

**400:** `{ "ok": false, "error": "mode must be \"leader\" or \"all\"" }`

---

### POST `/api/laps/total-laps`

Задать всего кругов M для категории (config + lapTracker).

**Тело:**

```json
{
  "categoryId": "men",
  "totalLaps": 8
}
```

**Ответ:**

```json
{
  "ok": true,
  "categoryId": "men",
  "totalLaps": 8,
  "lapState": { "totalLaps": 8, "lapLabel": "КРУГ 4/8", "..." }
}
```

**400:** `totalLaps must be a positive number`  
**404:** `Category not found`

---

### POST `/api/laps/reset`

Сброс счётчика и событий категории.

**Тело или query:** `categoryId` (опционально → active)

**Ответ:**

```json
{ "ok": true, "categoryId": "men", "lapState": { "completedLap": 0, "currentLap": 1, "..." } }
```

---

### POST `/api/laps/simulate-leader`

Тестовая отсечка лидера (кнопка «+1 круг (тест)»).

**Тело:** `{ "categoryId": "men", "name": "...", "number": "1", ... }` (поля опциональны)

**409** если frozen.

**Ответ:**

```json
{
  "ok": true,
  "event": { "id": "...", "name": "ТЕСТ ЛИДЕР", "gap": "..." },
  "lapState": { "..." },
  "counterUpdated": true
}
```

---

### POST `/api/laps/simulate`

Ручное тестовое событие (панель `?test=1`).

**Тело:**

```json
{
  "categoryId": "men",
  "place": "1",
  "number": "7",
  "name": "Тест Участник",
  "gap": "+0:30",
  "lapNumber": "2"
}
```

**409** если frozen.

---

### POST `/api/laps/replay`

Воспроизведение кругов из `raceData.lapDetails` с задержкой.

**Query или body:** `categoryId`, `delayMs` (default 800)

**400** если нет lapDetails. **409** если frozen.

**Ответ (сразу):** `{ "ok": true, "count": 120, "categoryId": "men" }`

---

### GET `/api/laps/stream`

**SSE** (legacy). `text/event-stream`, события `data: {...}\n\n`.

Query: `categoryId` — фильтр.

> Для vMix Browser Source надёжнее `/api/laps/recent`.

---

## Сводная таблица эндпоинтов

| Метод | Путь |
|-------|------|
| GET | `/`, `/config`, `/laps` |
| GET | `/api/config`, `/api/setup`, `/api/laps/recent`, `/api/laps/status`, `/api/laps/stream` |
| GET | `/api/vmix/preview`, `/api/vmix/templates`, `/api/vmix/field-mapping` |
| POST | `/api/category`, `/api/freeze`, `/api/excel-export` |
| POST | `/api/setup`, `/api/setup/parse` |
| POST | `/sheet1`, `/updateData`, `/export`, `/row1`, `/vmixCommand` |
| POST | `/api/laps/mode`, `/api/laps/total-laps`, `/api/laps/reset` |
| POST | `/api/laps/simulate-leader`, `/api/laps/simulate`, `/api/laps/replay` |
| POST | `/api/vmix/templates`, `/api/vmix/field-mapping` |

---

## Коды ошибок

| Код | Типичная причина |
|-----|------------------|
| 400 | Невалидное тело (setup, laps mode, totalLaps, excel-export, templates, field-mapping) |
| 404 | Категория не найдена (`/api/laps/total-laps`) |
| 409 | Операция при `dataFrozen` (simulate, replay) |
| 500 | Ошибка сервера, export, setup read |

Ошибки setup/parse/templates: `{ "ok": false, "error": "текст" }`.

---

## Периодичность (рекомендации)

| Клиент | Интервал | Эндпоинт |
|--------|----------|----------|
| Панель `/` | 3000 ms | `POST /sheet1` + `GET /api/config` |
| Оверлей `/laps` | 1000 ms | `GET /api/laps/recent` |
| Сервер poll | `pollIntervalMs` | Limetime API |

---

## Примеры curl

```bash
# Режим отсечек «по всем»
curl -X POST http://localhost:3000/api/laps/mode \
  -H "Content-Type: application/json" \
  -d '{"mode":"all"}'

# Включить автосохранение Excel
curl -X POST http://localhost:3000/api/excel-export \
  -H "Content-Type: application/json" \
  -d '{"enabled":true}'

# Превью vMix
curl http://localhost:3000/api/vmix/preview

# Заморозить
curl -X POST http://localhost:3000/api/freeze \
  -H "Content-Type: application/json" \
  -d '{"frozen":true}'
```
