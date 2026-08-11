# Документация VELO Limetime

Сервис для трансляции велогонок: опрос Limetime API, панель оператора, vMix (6×10), Browser Source плашек отсечек, Excel.

## Содержание

| Документ | Описание |
|----------|----------|
| [architecture.md](./architecture.md) | Архитектура, потоки данных, vMix, laps, конфиг, фронтенд |
| [backend-modules.md](./backend-modules.md) | Модули `lib/` — ответственность и алгоритмы |
| [api-reference.md](./api-reference.md) | Полный справочник HTTP API |
| [GUIDE.md](./GUIDE.md) | Руководство оператора (эфир, vMix, troubleshooting) |

## Быстрый обзор

```
Limetime API  ──poll──►  server.js  ──►  transform.js  ──►  raceData
                              │                              │
                              ├──►  lapTracker.js  ──►  /laps (Browser Source)
                              ├──►  vmixPush.js  ──TCP──►  vMix (diff-кэш SetText)
                              └──►  excelExport.js  ──►  exports/data.xlsx (если excelExportEnabled)
```

**Стек:** Node.js, Express, Vue 3 (CDN), axios, node-vmix, ExcelJS.

**Точка входа:** `server.js` — HTTP на порту `3000` (или `PORT`).

**Конфигурация:** `config.json` + API/UI без рестарта для vMix, laps, Excel toggle.

## Страницы

| URL | Назначение |
|-----|------------|
| `/` | Панель оператора (вкладки: Результаты, Победители, vMix, Маппинг, Шаблоны) |
| `/config` | Настройка события и 4 категорий Limetime |
| `/laps` | Browser Source — плашки отсечек |

## Ключевые API (кратко)

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/api/config` | Состояние UI, lapsMode, excelExportEnabled |
| POST | `/api/freeze` | Заморозка vMix и плашек |
| POST | `/api/excel-export` | Вкл/выкл автосохранения Excel |
| POST | `/api/laps/mode` | Режим отсечек `leader` / `all` |
| GET | `/api/vmix/preview` | Превью полей vMix без TCP |
| GET/POST | `/api/vmix/templates` | Шаблоны и поля vMix |
| GET/POST | `/api/vmix/field-mapping` | Маппинг Limetime → vMix |

Полный список — [api-reference.md](./api-reference.md).

## Связанные материалы

- [README.md](../README.md) — быстрый старт и эксплуатация
- [GUIDE.md](./GUIDE.md) — пошаговое руководство
