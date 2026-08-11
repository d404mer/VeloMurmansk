# VELO Limetime

Приложение для трансляции велогонок: опрос Limetime API, панель оператора, вывод в vMix (6 страниц × 10 строк), Browser Source плашек отсечек и экспорт в Excel.

**Подробная документация:** [docs/README.md](docs/README.md) — архитектура, модули, HTTP API.

**Руководство оператора:** [docs/GUIDE.md](docs/GUIDE.md).

## Требования

- Node.js 18+
- vMix (опционально, для TCP Title Engine)
- Файл `exports/data.xlsx` не должен быть открыт в Excel во время автосохранения

## Быстрый старт

```powershell
cd "D:\Судейка\velo"
npm install
node server.js
```

Откройте в браузере: **http://localhost:3000**

---

## Настройка

### Способ 1 — через интерфейс (рекомендуется)

1. Запустите сервер (`node server.js`).
2. Откройте **http://localhost:3000/config** (или «Настройки» на главной).
3. Заполните название и ID события.
4. Вставьте **4 Limetime-ссылки** — по одной на категорию (женщины, мужчины, юниорки, юниоры).
5. Убедитесь, что под каждой ссылкой появились GUID.
6. Нажмите **«Сохранить»** — polling перезапустится без рестарта Node.

### Формат Limetime-ссылки

```
https://services-results.limetime.io/results/get/{raceGuid}/{stageGuid}/{categoryGuid}
```

| Часть URL | Куда в config.json |
|-----------|-------------------|
| 1-й GUID | `events[].raceGuid` |
| 2-й GUID | `categories[].stageGuid` |
| 3-й GUID | `categories[].categoryGuid` |

Все 4 ссылки должны относиться к **одному событию** (одинаковый `raceGuid`).

### Способ 2 — config.json вручную

Ключевые поля (полная структура — в [docs/architecture.md](docs/architecture.md)):

| Поле | Описание |
|------|----------|
| `pollIntervalMs` | Интервал опроса Limetime (мс), по умолчанию 5000 |
| `excelExportEnabled` | Автозапись Excel при каждом poll (`true`/`false`; если ключ **отсутствует** — считается включённым) |
| `laps.mode` | `"leader"` или `"all"` — режим плашек отсечек |
| `vmix.host` | Хост TCP API vMix, обычно `localhost` |
| `vmix.autoUpdate` | Автоотправка в vMix при poll |
| `vmix.pageSize` | Строк на страницу (10) |
| `vmix.maxPages` | Число страниц (6) |
| `vmix.templates` | Имена Inputs в vMix |
| `vmix.indexedFields` | Шаблоны SelectedName для строк (`num {n}.Text` и т.д.) |
| `vmix.singleFields` | Поля одной строки (`class.Text`, `lap.Text`, …) |
| `vmix.fieldMapping` | Маппинг полей Limetime → vMix (редактируется в UI) |
| `vmix.startlistByCategory` | Шаблон стартлиста по ID категории |
| `categories[].totalLaps` | Всего кругов M для счётчика «КРУГ N/M» |

Шаблоны vMix, indexed/single fields и field mapping можно править **из UI** (вкладки «vMix шаблоны» и «Маппинг полей») — перезапуск сервера не нужен.

После ручной правки `config.json` на диске перезапустите `node server.js` (in-memory конфиг обновляется через API и `/config`, но не при внешнем редактировании файла без рестарта).

---

## Использование

### Главная страница (`/`)

**Верхняя панель** разделена на две группы:

| Группа | Элементы |
|--------|----------|
| Живое управление | Селектор категории, «Обновить», «Заморозить / Снять заморозку» |
| Ссылки и инструменты | «Настройки», «Плашки кругов», «Тест плашек», «Превью vMix» |

**Вкладки** (последняя вкладка сохраняется в `localStorage`):

| Вкладка | Содержимое |
|---------|------------|
| **Результаты** | Панель кругов (N/M, totalLaps, режим отсечек), таблица, страницы vMix (клик — в эфир) |
| **Победители** | WINNER 1 / 2 / 3 / WINNERS |
| **vMix** | Тумблер автосохранения Excel, ручной «Сохранить в Excel» |
| **Маппинг полей** | Редактор `fieldMapping` и имён полей по плашкам |
| **vMix шаблоны** | Редактор `templates`, `indexedFields`, `singleFields` |

На вкладках «Маппинг полей» и «vMix шаблоны» показывается предупреждение: изменения применяются сразу к трансляции.

**Подтверждения:** заморозка данных и сброс счётчика кругов — через `confirm`. Клик по странице vMix подсвечивает строку ~1.5 с без confirm.

### Плашки кругов (`/laps`)

Browser Source для vMix/OBS — плашки при прохождении круга.

- Эфир: `http://localhost:3000/laps`
- Тест: `/laps?test=1` или `/laps?demo=1`
- Позиция: URL-параметры или CSS в `public/css/laps.css`

**Режим отсечек** (`config.laps.mode`, select на вкладке «Результаты»):

| Режим | Поведение на `/laps` |
|-------|----------------------|
| `leader` | У лидера — время круга; у остальных — отставание с «+»; плашка лидера закреплена сверху |
| `all` | У всех — собственное время круга; общий скролл, без закрепления |

Смена номера круга N/M по-прежнему привязана к лидеру в обоих режимах.

### Заморозка данных

Кнопка **«Заморозить данные»** фиксирует снимок для vMix и плашек; Limetime poll продолжается. **«Снять заморозку»** сбрасывает diff-кэш vMix и возобновляет live-отправку.

API: `POST /api/freeze` с `{ "frozen": true|false }`.

### Excel (`exports/data.xlsx`)

- Лист на каждую категорию + лист **«Эфир»** (круг, лидер, отсечка активной категории).
- **Автосохранение** — только если `excelExportEnabled: true` (переключатель на вкладке «vMix»).
- **Ручной экспорт** — кнопка «Сохранить в Excel» или `POST /export` (всегда выполняет poll; Excel пишется, если автосохранение включено).

---

## vMix — куда идут данные

Схема: **6 страниц × 10 строк** (`maxPages: 6`, `pageSize: 10`).

| Тип данных | Input (по умолчанию в коде) | Пример в config.json | Когда |
|------------|----------------------------|----------------------|-------|
| Стартовый лист | `startlist{page}` | `startlist1`…`startlist6` | Авто: `startList` активной категории |
| Результаты | `results{page}` | `results1`…`results6` | Авто: `liveList` или `finalList` |
| Лидер 1–3 | `leader1`…`leader3` | `leader1`, `leader2`, `leader3` | Авто + кнопки WINNER 1/2/3 |
| Тройной титр | `winners` | `winners_flowers` (пример) | Авто + кнопка WINNERS |
| Счётчик круга | `lapCounter` → `timer` | `"time"` | Текст `КРУГ N/M` в поле `lap.Text` |
| Ручная страница | `resultManual` / `startlistManual` | `results{page}` / `startlist{page}` | Клик по странице в UI |
| Отсечки | Browser `/laps` | — | Не TCP |

### indexedFields (SelectedName на строку)

Подстановка `{n}` → номер строки 1…10. **В дефолтах и типичном config — пробел перед `{n}`:**

| Ключ | Шаблон |
|------|--------|
| `num` | `num {n}.Text` |
| `name` | `name {n}.Text` |
| `age` | `age {n}.Text` |
| `city` | `city {n}.Text` |
| `place` | `place {n}.Text` |
| `result` | `result {n}.Text` |
| `gap` | `gap {n}.Text` |

Опционально `vmix.indexedSpacedFrom` — для слота ≥ N пробел перед `{n}` добавляется программно (если в шаблоне его нет).

### singleFields

| Ключ | SelectedName (дефолт) |
|------|----------------------|
| `class` | `class.Text` |
| `class1` | `class1.Text` |
| `name1` | `name1.Text` |
| `name 1` / `name 2` / `name 3` | `name 1.Text` … |
| `leaderName` | `name 1.Text` |
| `lap` | `lap.Text` |

### fieldMapping

Плоский объект «поле vMix» → «путь в Limetime». Пример:

```json
"fieldMapping": {
  "num": "number",
  "name": "account.lastName+account.firstName",
  "age": "account.age",
  "city": "club",
  "place": "position",
  "result": "resultTime",
  "gap": "leaderDifference"
}
```

Составные значения — через `+`. Редактируется на вкладке «Маппинг полей» (`GET/POST /api/vmix/field-mapping`).

### Diff-кэш SetText

`vmixPush.js` не отправляет повторный `SetText`, если значение поля не изменилось — снижает нагрузку на Title Engine и мигание титров. Кэш сбрасывается при смене категории, снятии заморозки и сохранении шаблонов vMix.

Legacy-команды: `lider` → winner1, `lider4` → winners (`vmix.legacy`).

---

## Структура проекта

```
velo/
├── server.js                 # Express, polling, маршруты
├── config.json
├── package.json
├── README.md
├── lib/
│   ├── limetime.js           # HTTP-клиент Limetime
│   ├── transform.js          # Сырые данные → таблицы
│   ├── lapTracker.js         # Отсечки, lapState, режим leader/all
│   ├── vmixConfig.js         # resolveVmixConfig, formatLapText
│   ├── vmixPush.js           # buildVmixPayload, diff-кэш, TCP
│   ├── vmixPlaques.js        # UI-модель маппинга полей
│   ├── vmixTemplates.js      # Валидация/сохранение шаблонов
│   ├── fieldMapping.js       # resolveAthleteValue, пути Limetime
│   ├── excelExport.js        # data.xlsx
│   ├── configEditor.js       # /api/setup
│   ├── setupRoutes.js
│   └── parseLimetimeUrl.js
├── public/
│   ├── index.html            # Панель оператора (Vue 3)
│   ├── config.html           # Настройка события
│   ├── laps.html             # Browser Source плашек
│   ├── js/
│   │   ├── app.js
│   │   ├── config.js
│   │   └── laps.js
│   └── css/
│       ├── main.css
│       └── laps.css
├── docs/
│   ├── README.md
│   ├── architecture.md
│   ├── api-reference.md
│   ├── backend-modules.md
│   └── GUIDE.md
└── exports/
    └── data.xlsx
```

---

## Частые ошибки

### `EADDRINUSE: address already in use :::3000`

**Причина:** порт 3000 занят — часто вторым экземпляром `node server.js`.

**Решение:**

```powershell
netstat -ano | findstr :3000
taskkill /PID <PID> /F
node server.js
```

На Linux/macOS: `lsof -i :3000` и `kill <PID>`.

Не запускайте сервер повторно, пока предыдущий процесс не остановлен.

---

### Мигание / неполное обновление стартлиста в vMix

**Причина:** большой объём TCP-команд `SetText` за один poll; различия версий vMix; GT-анимации (transition) на текстовых полях в Title Designer.

**Что помогает:**

1. **Diff-кэш** в `vmixPush.js` — уже включён; повторные одинаковые значения не шлются.
2. Отключите transition/анимацию на полях в GT Title Designer.
3. Убедитесь, что не запущено два процесса сервера (дублирующие команды).
4. «Превью vMix» (`GET /api/vmix/preview`) — проверить набор полей без отправки в эфир.

---

### `EBUSY: resource busy or locked, open '...\exports\data.xlsx'`

**Причина:** файл открыт в Excel.

**Решение:** закройте файл. При включённом автосохранении запись возобновится на следующем poll.

---

### `Limetime API returned unsuccessful response`

Проверьте GUID в `/config`, актуальность ссылок и `limetime.apiKey` (заголовок `limetime-api-key` с racetime.online).

---

### `Failed to load <категория>`

Ошибка GUID или гонка ещё не началась — проверьте категорию в `/config`.

---

### vMix не обновляется

1. vMix запущен, TCP API включён (Settings → Web Controller).
2. `"vmix": { "host": "localhost", "autoUpdate": true }`.
3. Имена Inputs совпадают с `vmix.templates` (не старые `res1`/`res5`).
4. Данные не заморожены (или снимок актуален).

---

### При сохранении в `/config`: «raceGuid не совпадает» / «Не удалось найти 3 GUID»

Все ссылки с одного события; URL полный, три GUID в пути.

---

## Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `PORT` | `3000` | HTTP-порт |
| `VMIX_LOG_TEMPLATES` | — | `1` — лог resolved templates при push |

```powershell
$env:PORT=8080; node server.js
```
