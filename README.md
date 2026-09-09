# VELO Murmansk

Панель оператора велогонки: приём результатов по **POST**, таблица и Excel, титры **vMix** по TCP, Browser Source плашек отсечек.

**Режим по умолчанию:** Приём POST + vMix TCP + ngrok (судьи в интернете). Limetime — запасной опрос API, не быстрый старт.

**Подробная документация:** [docs/README.md](docs/README.md). **Оператор:** [docs/GUIDE.md](docs/GUIDE.md).

## Установка на другой ПК

1. **Node.js 18+**, клон репозитория, в папке проекта: `npm install`.
2. **Windows Firewall:** входящий TCP **3000** (команда от администратора):

```powershell
New-NetFirewallRule -DisplayName "Node.js Server 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

3. **Флаги регионов:** файлы `assets/images/*.jpg` копируются вместе с репо. vMix берёт **локальный путь** на этом ПК (`SetImage`).
4. **vMix на этом же ПК:** TCP API **8099**, Web Controller **8088**. В `config.json`: `"vmix.host": "localhost"` (или `127.0.0.1`). В браузере `http://host:8099/` не открывать — это не HTTP.
5. **ngrok:** аккаунт, Authtoken, Domain (`*.ngrok-free.dev`). Два процесса:

```powershell
cd путь\к\VeloMurmansk
npm install
node server.js
```

Во втором окне:

```powershell
ngrok http 3000 --url https://ВАШ-домен.ngrok-free.dev
```

6. Судьям отдавайте **только** `https://ВАШ-домен.ngrok-free.dev/api/race`. LAN `192.168.x.x` с панели — только если судьи в той же сети.
7. Панель оператора: **http://localhost:3000**. В `config.json` должно быть `"dataSource": "http"`.
8. Файл `exports/data.xlsx` не должен быть открыт в Excel при автосохранении.

### Тест POST

Заголовок `ngrok-skip-browser-warning: 1` нужен при запросе через ngrok. Примеры: [docs/samples/](docs/samples/) (`race-post-women.json`, `race-post-men.json`, `race-post-junior-women.json`, `race-post-junior-men.json`).

```powershell
curl.exe -X POST "https://ВАШ-домен.ngrok-free.dev/api/race" `
  -H "Content-Type: application/json" `
  -H "ngrok-skip-browser-warning: 1" `
  --data-binary "@docs/samples/race-post-men.json"
```

Локально без ngrok:

```powershell
curl.exe -X POST "http://localhost:3000/api/race" -H "Content-Type: application/json" --data-binary "@docs/samples/race-post-women.json"
```

### Формат POST

Родной формат: `isSuccess`, `categoryId` (`current` / `women` / `men` / `junior_women` / `junior_men`), `data[]`. Без `categoryId` (и если RaceResult не угадал категорию по названию гонки) пакет пишется в **Текущая гонка** (`current`).

**RaceResult** (экспорт JSON / passing) принимается на тот же `POST /api/race`. Адаптер мапит поля и собирает `laps` из `splits` или из одного `time`. Contest-имя (`race: "42 km"`) **не** подставляется как `raceId`. Категорию лучше указать явно: `?categoryId=men` (или поле `categoryId` в JSON). Опционально в `config.json`:

```json
"raceResult": { "categoryMap": { "Юноши 13-14 лет": "men", "42 km": "men" } }
```

**Wiclax отметки** (в реальном времени, тот же `POST /api/race`):

- Короткий лог без ФИО: JSON-массив `{ bib, time, split_id }` или текст `101;10:15:32.450;START`. `START` — уход со старта; `MAIN_LOOP` / `LAP_LOOP` / `FINISH` — круг.
- Именной `dataType: "passing"` (ФИО, `splits` / `lapData`): участник **обновляется по номеру**, стартовый лист не затирается. `1CP`…`5CP` — промежуточные отсечки; `split: "Finish"` — круги гонки из `lapData`. Пустой `{ "dataType": "inRace", "rows": [] }` не меняет список.
- Если `team` пустой, клуб берётся из `СубьектРФ` / `nationality` (код **СВД** = Свердловская область).

Примеры: [docs/samples/wiclax-passings.json](docs/samples/wiclax-passings.json), [docs/samples/wiclax-passing-cp.json](docs/samples/wiclax-passing-cp.json), [docs/samples/wiclax-passing-finish.json](docs/samples/wiclax-passing-finish.json).

Эмулятор ретранслятора (startlist → 5CP → Finish):

```powershell
node scripts/wiclax-emulator.js
node scripts/wiclax-emulator.js http://localhost:3000/api/race 1500
```

```powershell
curl.exe -X POST "http://localhost:3000/api/race" -H "Content-Type: application/json" --data-binary "@docs/samples/wiclax-passings.json"
```

```powershell
curl.exe -X POST "http://localhost:3000/api/race?categoryId=men" -H "Content-Type: application/json" --data-binary "@docs/samples/raceresult-export.json"
```

### Данные на диске

Последний **непустой** список участников каждой категории: `data/ingest/{categoryId}.json`. Метаданные: `data/ingest/state.json`. Переживают перезапуск Node и **reboot ПК**. Пропадают только если удалить папку. Пустой POST память и файлы категорий не затирает; повтор того же JSON на диск не пишется.

---

## Настройка (config)

Ключевые поля (полная структура — в [docs/architecture.md](docs/architecture.md)):

| Поле | Описание |
|------|----------|
| `dataSource` | `"http"` (POST `/api/race`) или `"limetime"` (запасной опрос API) |
| `server.host` / `server.port` | Слушать `0.0.0.0:3000` (перекрываются `HOST` / `PORT`) |
| `pollIntervalMs` | Интервал опроса Limetime (мс); в режиме `http` poll не запускается |
| `excelExportEnabled` | Автозапись Excel (`true`/`false`; ключ отсутствует — включено) |
| `laps.mode` | `"leader"` или `"all"` — на плашке отставание или своё время |
| `laps.splits` | `"loop"` только круги (MAIN_LOOP) или `"all"` все отсечки Wiclax |
| `vmix.host` | TCP API vMix, на том же ПК — `localhost` |
| `vmix.autoUpdate` | Автоотправка в vMix |
| `vmix.pageSize` | Строк на страницу (10) |
| `vmix.maxPages` | Число страниц (6) |
| `vmix.templates` | Имена Inputs в vMix |
| `vmix.indexedFields` | Шаблоны SelectedName строк (`num {n}.Text`, `flag {n}.Source`, …) |
| `vmix.singleFields` | Поля одной строки (`class.Text`, `lap.Text`, флаги лидеров, …) |
| `vmix.fieldMapping` | Маппинг полей данных → vMix (из UI) |
| `vmix.startlistByCategory` | Шаблон стартлиста по ID категории |
| `categories[].totalLaps` | Всего кругов M для «КРУГ N/M» |

Шаблоны и маппинг правятся из UI без рестарта. После правки `config.json` на диске перезапустите `node server.js`.

### Запасной режим Limetime

1. `node server.js` → **http://localhost:3000/config**.
2. Режим **Опрос Limetime**, четыре ссылки (женщины, мужчины, юниорки, юниоры), «Сохранить».

Формат ссылки:

```
https://services-results.limetime.io/results/get/{raceGuid}/{stageGuid}/{categoryGuid}
```

| Часть URL | Куда в config.json |
|-----------|-------------------|
| 1-й GUID | `events[].raceGuid` |
| 2-й GUID | `categories[].stageGuid` |
| 3-й GUID | `categories[].categoryGuid` |

Все четыре ссылки — одно событие (`raceGuid`).

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

**Какие отсечки** (`config.laps.splits`, второй select на вкладке «Результаты»): `loop` — плашки только с кругов (MAIN_LOOP); `all` — ещё промежуточные SPLIT1 и т.п. Счётчик N/M всегда по кругам.

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
├── server.js                 # Express, ingest, маршруты
├── config.json
├── package.json
├── README.md
├── assets/images/            # флаги регионов для vMix SetImage
├── data/ingest/              # JSON категорий (не в git, кроме .gitkeep)
├── lib/
│   ├── ingestStore.js        # data/ingest/{category}.json
│   ├── limetime.js           # HTTP-клиент Limetime (запасной)
│   ├── raceAdapter.js        # Валидация POST /api/race
│   ├── raceResultAdapter.js  # RaceResult JSON → data[]
│   ├── transform.js          # Сырые данные → таблицы
│   ├── lapTracker.js         # Отсечки, lapState, режим leader/all
│   ├── vmixConfig.js         # resolveVmixConfig, formatLapText
│   ├── vmixPush.js           # buildVmixPayload, diff-кэш, TCP
│   ├── vmixPlaques.js        # UI-модель маппинга полей
│   ├── vmixTemplates.js      # Валидация/сохранение шаблонов
│   ├── fieldMapping.js       # resolveAthleteValue
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
│   ├── GUIDE.md
│   └── samples/              # race-post-*.json
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
