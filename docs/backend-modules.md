# Модули backend (`lib/`)

Каждый модуль — отдельный файл без внешнего состояния (кроме фабрик с замыканием). `server.js` связывает их в единый pipeline.

---

## limetime.js

**Назначение:** HTTP-клиент Limetime Results API.

### Функции

| Функция | Описание |
|---------|----------|
| `buildUrl(baseUrl, raceGuid, stageGuid, categoryGuid)` | Собирает URL вида `{base}/{race}/{stage}/{category}` |
| `fetchResults(limetimeConfig, raceGuid, stageGuid, categoryGuid)` | GET с заголовками `limetime-api-key`, `Origin`, `Referer` |

### Контракт ответа

Ожидается JSON:

```json
{ "isSuccess": true, "data": [ /* массив участников */ ] }
```

При `isSuccess !== true` или таймауте (15 с) — исключение.

### Сырой участник (ключевые поля)

Используются в `transform.js` и `lapTracker.js`:

- `number`, `club`, `position`, `resultTime`, `leaderDifference`
- `isFinished`, `isOnStart`
- `account`: `{ firstName, lastName, age }`
- `laps[]`: `{ lapNumber, name, isOnLap, totalTime, lapTime, groupRacePosition, leaderDifference }`

---

## transform.js

**Назначение:** Нормализация сырого массива участников в таблицы для UI, vMix и Excel.

### Pipeline

```
rawData[]
  → mapRawAthlete (для каждого)
  → detectMode
  → buildStartList / buildResultsList / buildLeaders / buildLapDetails
  → displayList (start или results)
```

### Вспомогательная логика

- **Завершённый круг:** `lap.isOnLap && lap.totalTime`.
- **formatGap:** добавляет `+` к отставанию, если нет знака.
- **participantName:** `"Фамилия Имя"` из `account`.
- **buildResultsList:** если нет `position` у участников — fallback на стартовый лист.

### Экспорт

```javascript
module.exports = { COLUMNS, transformResults, formatGap };
```

---

## lapTracker.js

**Назначение:** Отслеживание **новых** завершённых кругов и хранение истории событий для `/laps`.

### Фабрика

```javascript
const lapTracker = createLapTracker();
```

### Внутреннее состояние (на категорию)

| Структура | Содержимое |
|-----------|------------|
| `seenLaps` | Set ключей `"номер:lapNumber:totalTime"` |
| `initialized` | Set categoryId — после первого poll категория «прогрета» |
| `events` | Массив последних событий (макс. 50 на категорию) |

### Алгоритм `processRawAthletes(categoryId, rawAthletes)`

1. Для каждого участника и каждого круга с `isOnLap && totalTime`:
   - если ключ уже в `seenLaps` — пропуск;
   - иначе добавить в `seenLaps`;
   - если это **первый poll** категории — не создавать событие;
   - иначе — `buildEvent()` и push в `events`.
2. Пометить категорию как initialized.
3. Вернуть массив **новых** событий текущего poll.

### Формат имени на плашке

`overlayName`: `"ИМЯ ФАМИЛИЯ".toUpperCase()` (имя перед фамилией) — отличается от `transform.participantName`.

### Прочие методы

| Метод | Назначение |
|-------|------------|
| `initCategory(id)` | Сброс при смене категории |
| `getRecentEvents(id, limit)` | Последние N событий для polling |
| `addManualEvent(id, fields)` | Тестовое событие (`/api/laps/simulate`) |
| `publishEvent(id, event)` | Публикация replay-события |

---

## vmixConfig.js

**Назначение:** Единый источник дефолтов vMix и слияние с `config.json`.

### DEFAULT_VMIX

- `pageSize: 10`, `maxPages: 5` → до 50 строк на тип списка.
- Шаблоны с плейсхолдером `{page}` для постраничных списков.
- `legacy` — старые имена inputs (`lider`, `liders4`) для fallback.

### resolveVmixConfig(config)

Возвращает полностью разрешённый объект: host, autoUpdate, templates, fields.

### formatTemplate(template, vars)

Подстановка `{page}` → номер страницы.

---

## vmixPush.js

**Назначение:** Отправка текстовых полей в vMix.

### Фабрика

```javascript
const vmixPusher = createVmixPusher(() => ({
  connected: vmixConnected,
  client: connection,
  onError: () => { vmixConnected = false; },
}));
```

### pushAll(appConfig, data)

Главная функция автообновления (см. [architecture.md](./architecture.md#интеграция-с-vmix)).

### pushPagedList

Итерирует `i = 0 .. maxPages*pageSize - 1`:

- `page = floor(i / pageSize) + 1`
- `rowOnPage = (i % pageSize) + 1`
- шаблон = `formatTemplate(pageTemplate, { page })`

### pushManualPage

Заполняет одну «ручную» страницу (`result` или `startlist`) — 10 строк.

### pushWinnerOverlay

По команде заполняет winner-шаблон(ы) и вызывает `OverlayInput1`.

### fillRow / fillStartlistRow

Маппинг полей строки таблицы → `SetText` для каждого поля из `config.fields`.

---

## excelExport.js

**Назначение:** Перезапись `exports/data.xlsx`.

### exportDataFile(categories, exportsDir)

```javascript
categories = [
  { sheetName: 'Мужчины', rows: [ /* displayList */ ] },
  ...
]
```

- Один worksheet на категорию.
- Имя листа санитизируется (31 символ, без `\ / * ? : [ ]`).
- Заголовки: Место, Участник, Номер, Возраст, Клуб, Результат, До лидера.

Вызывается после **каждого** успешного poll для всех категорий.

---

## parseLimetimeUrl.js

**Назначение:** Извлечение GUID из URL Limetime.

Поддерживает полный URL или путь. Ищет маркер `/results/get/` и три UUID подряд:

```
raceGuid / stageGuid / categoryGuid
```

Ошибки — понятные сообщения на русском для UI `/config`.

---

## configEditor.js

**Назначение:** Логика страницы настройки события.

### DEFAULT_CATEGORIES

Фиксированные 4 ID: `women`, `men`, `junior_women`, `junior_men`.

### buildSetupView(config)

DTO для фронтенда: eventId, raceGuid, categories с готовыми URL.

### validateSetupPayload / applySetup

- Ровно 4 категории, уникальные ID.
- Каждая ссылка парсится через `parseLimetimeUrl`.
- Один `raceGuid` на все категории.
- Обновляет активное событие в `config.events`.

---

## setupRoutes.js

**Назначение:** Express Router для `/api/setup*`.

| Метод | Путь | Действие |
|-------|------|----------|
| GET | `/api/setup` | Текущий вид настроек |
| POST | `/api/setup/parse` | Парсинг одного URL (preview) |
| POST | `/api/setup` | Сохранение + `onConfigSaved()` |

Подключается в `server.js` через `app.use(createSetupRoutes({...}))`.

---

## Связь модулей (импорты)

```
server.js
  ├── limetime.fetchResults
  ├── transform.transformResults
  ├── excelExport.exportDataFile
  ├── setupRoutes → configEditor, parseLimetimeUrl
  ├── lapTracker.createLapTracker
  └── vmixPush.createVmixPusher → vmixConfig.resolveVmixConfig

lapTracker → transform.formatGap
configEditor → parseLimetimeUrl
vmixPush → vmixConfig
```

---

## Расширение

| Задача | Куда смотреть |
|-------|----------------|
| Новое поле в таблице | `transform.js` (COLUMNS, toRow), `excelExport.js`, `vmix.fields` |
| Другой лимит лидеров | `transformResults(..., limit)` в server или transform |
| Новый vMix шаблон | `vmixConfig.DEFAULT_VMIX`, `vmixPush.pushAll` |
| Другой источник данных | замена `limetime.js`, контракт `transformResults(raw[])` сохранить |
| Редактирование frozen snapshot | пока нет — планировался `POST /api/freeze/edit` |
