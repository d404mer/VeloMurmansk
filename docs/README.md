# Документация velo-limetime

Сервис для трансляции велогонок: опрос Limetime API, панель оператора, вывод в vMix и оверлей плашек кругов.

## Содержание

| Документ | Описание |
|----------|----------|
| [architecture.md](./architecture.md) | Общая архитектура, потоки данных, конфигурация, фронтенд |
| [backend-modules.md](./backend-modules.md) | Модули `lib/` — ответственность и алгоритмы |
| [api-reference.md](./api-reference.md) | HTTP API и форматы запросов/ответов |

## Быстрый обзор

```
Limetime API  ──poll──►  server.js  ──►  transform.js  ──►  raceData
                              │                              │
                              ├──►  vmixPush.js  ──TCP──►  vMix
                              ├──►  lapTracker.js  ──►  /laps (Browser Source)
                              └──►  excelExport.js  ──►  exports/data.xlsx
```

**Стек:** Node.js, Express, Vue 3 (CDN), axios, node-vmix, ExcelJS.

**Точка входа:** `server.js` — HTTP-сервер на порту `3000` (или `PORT` из окружения).

**Конфигурация:** `config.json` — Limetime, vMix, события и категории.

## Страницы

| URL | Назначение |
|-----|------------|
| `/` | Панель оператора (таблица, vMix, заморозка) |
| `/config` | Настройка события и 4 категорий по ссылкам Limetime |
| `/laps` | Browser Source — плашки при прохождении круга |

## Связанные материалы

- [README.md](../README.md) — краткая справка по запуску
- [GUIDE.md](../GUIDE.md) — руководство пользователя
