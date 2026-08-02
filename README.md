# VELO Limetime

Приложение для трансляции велогонок: получает результаты из Limetime, показывает их в браузере, выводит в vMix и сохраняет в Excel.

**Полный гайд:** [GUIDE.md](GUIDE.md) — установка, эфир, vMix, плашки, заморозка, troubleshooting.

**Архитектура:** [docs/](docs/README.md) — структура проекта, потоки данных, модули, API.

## Требования

- Node.js 18+
- vMix (опционально, для оверлеев)
- Excel не должен держать открытым файл `exports/data.xlsx` во время работы

## Быстрый старт

```powershell
cd "D:\Для работы с судейкой\velo"
npm install
node server.js
```

Откройте в браузере: **http://localhost:3000**

---

## Настройка

### Способ 1 — через интерфейс (рекомендуется)

1. Запустите сервер (`node server.js`).
2. Откройте **http://localhost:3000/config** (или кнопку «Настройки» на главной).
3. Заполните название и ID события.
4. Вставьте **4 Limetime-ссылки** — по одной на каждую категорию:
   - Женщины
   - Мужчины
   - Юниорки 17-18
   - Юниоры 17-18
5. Убедитесь, что под каждой ссылкой появились GUID (stageGuid, categoryGuid).
6. Нажмите **«Сохранить»**.

Ссылки можно взять с сайта результатов (racetime.online / Limetime): откройте нужную категорию и скопируйте URL из адресной строки или из запроса к API.

### Формат Limetime-ссылки

```
https://services-results.limetime.io/results/get/{raceGuid}/{stageGuid}/{categoryGuid}
```

| Часть URL | Куда попадает в config.json |
|-----------|----------------------------|
| 1-й GUID (`raceGuid`) | `events[].raceGuid` — одно событие для всех 4 категорий |
| 2-й GUID (`stageGuid`) | `categories[].stageGuid` — этап/старт категории |
| 3-й GUID (`categoryGuid`) | `categories[].categoryGuid` — сама категория |

`id` и `name` категории задаются в форме вручную — из URL не извлекаются.

**Важно:** все 4 ссылки должны относиться к **одному событию** (одинаковый `raceGuid`).

### Способ 2 — вручную через config.json

Файл [`config.json`](config.json):

```json
{
  "limetime": {
    "baseUrl": "https://services-results.limetime.io/results/get",
    "apiKey": "...",
    "origin": "https://racetime.online",
    "referer": "https://racetime.online/"
  },
  "pollIntervalMs": 5000,
  "vmix": {
    "host": "localhost",
    "autoUpdate": true,
    "templates": {
      "resultsPage": "res{page}",
      "startlistPage": "startlist{page}",
      "winner1": "winner1",
      "winner2": "winner2",
      "winner3": "winner3",
      "winners": "winners"
    },
    "fields": { ... }
  },
  "activeEventId": "xcochamp2025",
  "activeCategoryId": "junior_women",
  "events": [ ... ]
}
```

| Поле | Описание |
|------|----------|
| `pollIntervalMs` | Как часто обновлять данные (мс), по умолчанию 5000 |
| `vmix.host` | Адрес vMix TCP API, обычно `localhost` |
| `vmix.autoUpdate` | Автоматически слать данные в vMix при каждом обновлении |
| `vmix.templates` | Имена Inputs в vMix (см. ниже) |
| `vmix.fields` | Имена текстовых полей в GT (по умолчанию `place {row}.Text` и т.д.) |
| `activeCategoryId` | Категория на главной и для vMix / плашек |

После правки `config.json` перезапустите сервер.

---

## Использование

### Главная страница (`/`)

- **Селектор категории** — переключение между группами
- **Обновить** — принудительный запрос данных
- **Сохранить в Excel** — записать `exports/data.xlsx`
- **Страницы списка** — клик по странице отправляет 10 строк в vMix (`result` / `startlist`)
- **WINNER 1 / 2 / 3 / WINNERS** — персональные титры и тройной титр (вкладка winners в vMix)
- **Заморозить данные** — после финиша зафиксировать снимок для vMix и плашек (Limetime и Excel продолжают обновляться)

### Плашки кругов (`/laps`)

Browser Source для vMix/OBS — отсечки под таймер. Появляются при новом пройденном круге.

- Эфир: `http://localhost:3000/laps`
- Тест: `/laps?demo=1` или `/laps?test=1`
- Настройка позиции: URL-параметры `left`, `width`, `top` или CSS-переменные в `public/css/laps.css`

### Заморозка данных

После гонки Limetime может «скакать» (пересчёт мест, правки ФИО). Кнопка **«Заморозить данные»**:

- vMix получает зафиксированный снимок
- новые плашки на `/laps` не появляются
- Excel и фоновый poll Limetime продолжают работать
- **«Снять заморозку»** — снова live в vMix

API: `POST /api/freeze` с телом `{ "frozen": true|false }`.

### Excel (`exports/data.xlsx`)

Один файл, **один лист на категорию**. Колонки:

| Место | Участник | Номер | Возраст | Клуб | Результат | До лидера |

Данные обновляются автоматически каждые 5 секунд (если файл не занят).

### vMix — куда идут данные

| Тип данных | Куда | Когда |
|------------|------|-------|
| Стартовый лист | `startlist1`…`startlist5` | Всегда из `startList` |
| Результаты live | `res1`…`res5` | `liveList`, пока гонка идёт |
| Результаты финал | `res1`…`res5` | `finalList`, когда все финишировали |
| Лидер 1–3 (персон.) | `winner1`, `winner2`, `winner3` | Топ-3, кнопки WINNER 1/2/3 |
| Тройной титр | `winners` | 3 строки, кнопка WINNERS |
| Отсечки (круги) | Browser `/laps` | Не TCP, отдельный Browser Source |
| Круги (детально) | Excel | Лист «Круги» в export, не vMix |

Имена Inputs настраиваются в `config.json` → `vmix.templates`. `{page}` подставляется номером страницы (1–5).

Legacy: если в vMix ещё `lider` / `liders4`, укажите их в `vmix.legacy`:

```json
"legacy": { "winner1": "lider", "winners": "liders4" }
```

---

## Частые ошибки

### `EADDRINUSE: address already in use :::3000`

**Причина:** порт 3000 уже занят — обычно старым экземпляром сервера.

**Решение:**

```powershell
netstat -ano | findstr :3000
taskkill /PID <номер_из_последней_колонки> /F
node server.js
```

Не запускайте `node server.js` повторно, пока предыдущий процесс не остановлен.

---

### `EBUSY: resource busy or locked, open '...\exports\data.xlsx'`

**Причина:** файл `data.xlsx` открыт в Excel — Windows не даёт его перезаписать.

**Решение:** закройте файл в Excel. Сервер продолжит работать, экспорт возобновится при следующем цикле обновления.

---

### `Limetime API returned unsuccessful response`

**Причина:** неверные GUID в конфиге, категория ещё не создана на Limetime, или неверный API-ключ.

**Что проверить:**

1. Ссылки в `/config` — актуальны ли они, открываются ли в браузере.
2. В `config.json` нет ли заглушек вроде `REPLACE_WITH_MEN_GUID`.
3. Поле `limetime.apiKey` совпадает с тем, что использует racetime.online (смотрите в DevTools → Network → заголовок `limetime-api-key`).

---

### `Failed to load <категория>` на главной странице

**Причина:** для выбранной категории API не вернул данные (ошибка GUID или гонка ещё не началась).

**Решение:** проверьте ссылку категории в `/config`, переключитесь на другую категорию или дождитесь появления данных на сайте Limetime.

---

### В Excel другие данные, чем на сайте / нет результата

**Причина (устаревшее):** раньше Excel брал стартовый лист без результатов. Сейчас экспортируются актуальные данные (`position`, `resultTime`, `leaderDifference`).

**Если проблема осталась:**

1. Перезапустите сервер после обновления кода.
2. Закройте `data.xlsx` в Excel и дождитесь автообновления.
3. Нажмите «Сохранить в Excel» на главной.

---

### vMix не обновляется / «vMix Connected!» не появляется

**Причина:** vMix не запущен, TCP API отключён, или неверный хост.

**Что проверить:**

1. vMix запущен на том же компьютере.
2. В vMix: Settings → Web Controller → TCP API включён.
3. В `config.json`: `"vmix": { "host": "localhost", "autoUpdate": true }`.
4. Имена шаблонов в vMix совпадают с `vmix.templates` в config (по умолчанию `res1`, `startlist1`, `winner1`…).

---

### При сохранении в `/config`: «raceGuid не совпадает»

**Причина:** вставлены ссылки от разных событий/гонок.

**Решение:** все 4 ссылки должны быть с одного мероприятия. Первый GUID в каждой ссылке (`raceGuid`) должен быть одинаковым.

---

### При сохранении в `/config`: «Не удалось найти 3 GUID»

**Причина:** ссылка обрезана, скопирована не полностью, или это не Limetime-URL.

**Решение:** скопируйте полный URL вида:

```
https://services-results.limetime.io/results/get/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

---

## Структура проекта

```
velo/
├── server.js
├── config.json
├── lib/
│   ├── limetime.js
│   ├── transform.js
│   ├── excelExport.js
│   ├── vmixConfig.js    — defaults для vMix
│   ├── vmixPush.js      — отправка в vMix
│   ├── lapTracker.js    — плашки кругов
│   └── setupRoutes.js
├── public/
│   ├── index.html
│   ├── laps.html        — Browser Source отсечек
│   └── config.html
└── exports/
    └── data.xlsx
```

---

## Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `PORT` | `3000` | Порт HTTP-сервера |

Пример:

```powershell
$env:PORT=8080; node server.js
```
