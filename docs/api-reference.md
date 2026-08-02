# Справочник HTTP API

Базовый URL: `http://localhost:3000` (или `PORT` из окружения).

Статика: `public/` — HTML, JS, CSS без префикса `/api`.

---

## Страницы (GET)

| Путь | Файл | Описание |
|------|------|----------|
| `/` | `index.html` | Панель оператора |
| `/config` | `config.html` | Настройка события |
| `/laps` | `laps.html` | Browser Source плашек |

Заголовки `/laps`: `Cache-Control: no-store`.

---

## Конфигурация и состояние

### GET `/api/config`

Метаданные для UI без полной таблицы.

**Ответ:**

```json
{
  "activeEventId": "xcochamp2025",
  "activeCategoryId": "men",
  "pollIntervalMs": 5000,
  "dataFrozen": false,
  "events": [
    {
      "id": "xcochamp2025",
      "name": "Чемпионат России 2025",
      "categories": [{ "id": "men", "name": "Мужчины" }]
    }
  ],
  "activeEventName": "Чемпионат России 2025",
  "mode": "live",
  "liveMode": "live",
  "lastUpdated": "2026-07-31T19:00:00.000Z",
  "frozenAt": null,
  "lastError": null,
  "lastExport": { "filename": "data.xlsx", "filepath": "..." }
}
```

| Поле | Примечание |
|------|------------|
| `mode` | Режим **отображаемых** данных (frozen или live) |
| `liveMode` | Режим последнего poll (всегда актуальный) |

---

### POST `/api/category`

Смена активного события/категории.

**Тело:**

```json
{
  "eventId": "xcochamp2025",
  "categoryId": "women"
}
```

Оба поля опциональны; при смене `categoryId` вызывается `lapTracker.initCategory`.

**Ответ:**

```json
{ "ok": true, "mode": "start", "count": 42 }
```

---

### POST `/api/freeze`

Заморозка/разморозка данных для vMix и `/laps`.

**Тело:**

```json
{ "frozen": true }
```

**Ответ:**

```json
{
  "ok": true,
  "dataFrozen": true,
  "frozenAt": "2026-07-31T19:00:00.000Z",
  "mode": "final"
}
```

---

## Настройка события (`/api/setup`)

### GET `/api/setup`

```json
{
  "ok": true,
  "data": {
    "eventId": "...",
    "eventName": "...",
    "raceGuid": "...",
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

Preview парсинга URL.

**Тело:** `{ "url": "https://..." }`

**Ответ:** `{ "ok": true, "data": { "raceGuid", "stageGuid", "categoryGuid" } }`

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

После сохранения — перезапуск polling и немедленный `refreshData`.

---

## Данные гонки

### POST `/sheet1`

Возвращает **displayList** (с учётом freeze) — массив строк таблицы.

**Ответ:** JSON-массив объектов `{ место, участник, номер, ... }`.

Используется UI каждые 3 с.

---

### POST `/updateData`

Принудительный poll Limetime.

**Ответ:**

```json
{ "ok": true, "mode": "live", "count": 55 }
```

---

### POST `/export`

Poll + ответ с информацией об Excel.

**Ответ:**

```json
{
  "ok": true,
  "export": { "filename": "data.xlsx", "filepath": "D:\\...\\exports\\data.xlsx" }
}
```

---

## vMix

### POST `/vmixCommand`

Показ оверлея победителя(ей).

**Тело:**

```json
{ "data": "winner1" }
```

| `data` | Действие |
|--------|----------|
| `winner1`, `winner2`, `winner3` | Один победитель + OverlayInput1 |
| `winners` | Тройка на шаблоне winners |
| `lider` | Legacy → winner1 |
| `lider4` | Legacy → winners |

Данные берутся из `getDisplayData().leaders` (или displayList как fallback).

**Ответ:** `"ok"` (text).

---

### POST `/row1`

Ручная отправка страницы в vMix (клик по блоку в UI).

**Тело:**

```json
{
  "index": 0,
  "item": [ /* до 10 строк displayList */ ]
}
```

`index` — номер страницы (0-based). Заполняются шаблоны `result` и `startlist` (manual).

**Ответ:** строка с `index`.

---

## Плашки кругов (`/api/laps`)

### GET `/api/laps/recent`

Polling для Browser Source (рекомендуемый способ).

**Query:**

| Параметр | По умолчанию | Описание |
|----------|--------------|----------|
| `categoryId` | `config.activeCategoryId` | Фильтр категории |
| `limit` | 10, макс. 50 | Число последних событий |

**Ответ:**

```json
{
  "ok": true,
  "dataFrozen": false,
  "lapState": {
    "completedLap": 5,
    "currentLap": 6,
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
      "at": "2026-07-31T19:00:00.000Z",
      "categoryId": "men"
    }
  ]
}
```

При `dataFrozen: true` массив `events` всегда пустой.

Клиент должен дедuplicate по `id` — одни и те же события могут приходить повторно в `recent`.

---

### GET `/api/laps/status`

Состояние отсчёта кругов лидера для категории.

---

### POST `/api/laps/simulate-leader`

Тестовая отсечка лидера. **409** если frozen.

---

### POST `/api/laps/reset`

Сброс счётчика кругов категории.

---

### GET `/api/laps/stream`

**SSE** (legacy). Поток `text/event-stream`, события `data: {...}\n\n`.

Query: `categoryId` — фильтр (опционально).

> В vMix Browser Source надёжнее использовать polling (`/api/laps/recent`), не SSE.

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

**409** если данные заморожены.

---

### POST `/api/laps/replay`

Воспроизведение **кругов лидера** из `raceData.lapDetails` (только `groupRacePosition === 1`) с задержкой (демо/отладка).

**Query или body:**

| Параметр | По умолчанию |
|----------|--------------|
| `categoryId` | active |
| `delayMs` | 800 |

**Ответ (сразу):**

```json
{ "ok": true, "count": 120, "categoryId": "men" }
```

События публикуются асинхронно через `deliverLapEvent`.

**400** если нет lapDetails. **409** если frozen.

---

## Коды ошибок

| Код | Типичная причина |
|-----|------------------|
| 400 | Невалидный setup URL, нет lap data для replay |
| 409 | Операция запрещена при `dataFrozen` |
| 500 | Ошибка сервера, export |

Ошибки setup/setup parse возвращают `{ "ok": false, "error": "текст" }`.

---

## Периодичность запросов (рекомендации)

| Клиент | Интервал | Эндпоинт |
|--------|----------|----------|
| Панель `/` | 3000 ms | `/sheet1` + `/api/config` |
| Оверлей `/laps` | 1000 ms | `/api/laps/recent` |
| Сервер (poll) | `pollIntervalMs` (5000) | Limetime API |

---

## Примеры curl

```bash
# Сменить категорию
curl -X POST http://localhost:3000/api/category \
  -H "Content-Type: application/json" \
  -d '{"categoryId":"women"}'

# Заморозить
curl -X POST http://localhost:3000/api/freeze \
  -H "Content-Type: application/json" \
  -d '{"frozen":true}'

# Победитель 1 в vMix
curl -X POST http://localhost:3000/vmixCommand \
  -H "Content-Type: application/json" \
  -d '{"data":"winner1"}'

# Последние плашки
curl "http://localhost:3000/api/laps/recent?categoryId=men&limit=5"
```
