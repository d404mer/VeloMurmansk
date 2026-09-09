const path = require('path');

const IMAGES_DIR = path.resolve(__dirname, '..', 'assets', 'images');

const REGIONS = [
  { name: 'Республика Адыгея', code: 'АДГ', file: 'Республика Адыгея.jpg', aliases: ['адыгея'] },
  { name: 'Республика Алтай', code: 'АЛТ', file: 'Республика Алтай.jpg', aliases: ['республика алтай', 'респ алтай', 'горный алтай'] },
  { name: 'Республика Башкортостан', code: 'БАШ', file: 'Республика Башкортостан.jpg', aliases: ['башкортостан', 'башкирия'] },
  { name: 'Республика Бурятия', code: 'БУР', file: 'Республика Бурятия.jpg', aliases: ['бурятия'] },
  { name: 'Республика Дагестан', code: 'ДАГ', file: 'Республика Дагестан.jpg', aliases: ['дагестан'] },
  { name: 'Республика Ингушетия', code: 'ИНГ', file: 'Республика Ингушетия.jpg', aliases: ['ингушетия'] },
  {
    name: 'Кабардино-Балкарская Республика',
    code: 'КБЛ',
    file: 'Республика Кабардино-Балкария.jpg',
    aliases: ['кабардино балкарская республика', 'кабардино балкария', 'кбр'],
  },
  { name: 'Республика Калмыкия', code: 'КЛМ', file: 'Республика Калмыкия.jpg', aliases: ['калмыкия'] },
  {
    name: 'Карачаево-Черкесская Республика',
    code: 'КЧР',
    file: 'Республика Карачаево-Черкеская.jpg',
    aliases: ['карачаево черкесская республика', 'карачаево черкесия', 'карачаево черкесская'],
  },
  { name: 'Республика Карелия', code: 'КАР', file: 'Республика Карелия.jpg', aliases: ['карелия'] },
  { name: 'Республика Коми', code: 'КОМ', file: 'Республика Коми.jpg', aliases: ['коми'] },
  {
    name: 'Республика Крым',
    code: 'КРМ',
    file: 'Автономная Республика Крым.jpg',
    aliases: ['автономная республика крым', 'крым'],
  },
  { name: 'Республика Марий Эл', code: 'МЭЛ', file: 'Республика Мари Эл.jpg', aliases: ['марий эл', 'мари эл'] },
  { name: 'Республика Мордовия', code: 'МОР', file: 'Республика Мордовия.jpg', aliases: ['мордовия'] },
  {
    name: 'Республика Саха (Якутия)',
    code: 'САХ',
    file: 'Республика Саха Якутия.jpg',
    aliases: ['республика саха якутия', 'республика саха', 'якутия', 'респ саха'],
  },
  {
    name: 'Республика Северная Осетия - Алания',
    code: 'СОА',
    file: 'Республика Северная Осетия-Алания.jpg',
    aliases: ['северная осетия алания', 'северная осетия', 'алания'],
  },
  { name: 'Республика Татарстан', code: 'ТАТ', file: 'Республика Татарстан.jpg', aliases: ['татарстан'] },
  { name: 'Республика Тыва', code: 'ТЫВ', file: 'Республика Тыва.jpg', aliases: ['тыва', 'тува'] },
  {
    name: 'Удмуртская Республика',
    code: 'УДМ',
    file: 'Республика Удмуртия.jpg',
    aliases: ['удмуртская республика', 'удмуртия'],
  },
  { name: 'Республика Хакасия', code: 'ХАК', file: 'Республика Хакасия.jpg', aliases: ['хакасия'] },
  {
    name: 'Чеченская Республика',
    code: 'ЧЕЧ',
    file: 'Республика Чечня.jpg',
    aliases: ['чеченская республика', 'чечня'],
  },
  {
    name: 'Чувашская Республика',
    code: 'ЧУВ',
    file: 'Республика Чувашия.jpg',
    aliases: ['чувашская республика', 'чувашия'],
  },
  { name: 'Алтайский край', code: 'АЛТ', file: 'Алтайский Край.jpg', aliases: ['алтайский край', 'алтайский кр', 'алт край'] },
  { name: 'Забайкальский край', code: 'ЗАБ', file: 'Забайкальский Край.jpg', aliases: ['забайкальский край', 'забайкалье'] },
  { name: 'Камчатский край', code: 'КМЧ', file: 'Камчатский Край.jpg', aliases: ['камчатский край', 'камчатка'] },
  { name: 'Краснодарский край', code: 'КРД', file: 'Краснодарский Край.jpg', aliases: ['краснодарский край', 'краснодар'] },
  { name: 'Красноярский край', code: 'КРЯ', file: 'Красноярский Край.jpg', aliases: ['красноярский край', 'красноярск'] },
  { name: 'Пермский край', code: 'ПРМ', file: 'Пермский Край.jpg', aliases: ['пермский край', 'пермь'] },
  { name: 'Приморский край', code: 'ПРК', file: 'Приморский Край.jpg', aliases: ['приморский край', 'приморье'] },
  { name: 'Ставропольский край', code: 'СТВ', file: 'Ставропольский Край.jpg', aliases: ['ставропольский край', 'ставрополь'] },
  { name: 'Хабаровский край', code: 'ХАБ', file: 'Хабаровский Край.jpg', aliases: ['хабаровский край', 'хабаровск'] },
  { name: 'Амурская область', code: 'АМУ', file: 'Амурская область.jpg', aliases: ['амурская область'] },
  { name: 'Архангельская область', code: 'АРХ', file: 'Архангельская область.jpg', aliases: ['архангельская область', 'архангельск'] },
  { name: 'Астраханская область', code: 'АСТ', file: 'Астраханская область.jpg', aliases: ['астраханская область', 'астрахань'] },
  { name: 'Белгородская область', code: 'БЕЛ', file: 'Белгородская область.jpg', aliases: ['белгородская область', 'белгород'] },
  { name: 'Брянская область', code: 'БРЯ', file: 'Брянская область.jpg', aliases: ['брянская область', 'брянск'] },
  { name: 'Владимирская область', code: 'ВЛД', file: 'Владимирская область.jpg', aliases: ['владимирская область', 'владимир'] },
  { name: 'Волгоградская область', code: 'ВГГ', file: 'Волгоградская область.jpg', aliases: ['волгоградская область', 'волгоград'] },
  { name: 'Вологодская область', code: 'ВЛГ', file: 'Вологодская область.jpg', aliases: ['вологодская область', 'вологда'] },
  { name: 'Воронежская область', code: 'ВОР', file: 'Воронежская область.jpg', aliases: ['воронежская область', 'воронеж'] },
  { name: 'Ивановская область', code: 'ИВН', file: 'Ивановская область.jpg', aliases: ['ивановская область', 'иваново'] },
  { name: 'Иркутская область', code: 'ИРК', file: 'Иркутская область.jpg', aliases: ['иркутская область', 'иркутск'] },
  { name: 'Калининградская область', code: 'КЛГ', file: 'Калининградская область.jpg', aliases: ['калининградская область', 'калининград'] },
  { name: 'Калужская область', code: 'КЛЖ', file: 'Калужская область.jpg', aliases: ['калужская область', 'калуга'] },
  { name: 'Кемеровская область', code: 'КЕМ', file: 'Кемеровская область.jpg', aliases: ['кемеровская область', 'кемерово', 'кузбасс'] },
  { name: 'Кировская область', code: 'КИР', file: 'Кировская область.jpg', aliases: ['кировская область', 'киров'] },
  { name: 'Костромская область', code: 'КСТ', file: 'Костромская область.jpg', aliases: ['костромская область', 'кострома'] },
  { name: 'Курганская область', code: 'КРГ', file: 'Курганская область.jpg', aliases: ['курганская область', 'курган'] },
  { name: 'Курская область', code: 'КРС', file: 'Курская область.jpg', aliases: ['курская область', 'курск'] },
  { name: 'Ленинградская область', code: 'ЛЕН', file: 'Ленинградская область.jpg', aliases: ['ленинградская область', 'ленобласть'] },
  { name: 'Липецкая область', code: 'ЛИП', file: 'Липецкая область.jpg', aliases: ['липецкая область', 'липецк'] },
  { name: 'Магаданская область', code: 'МГД', file: 'Магаданская область.jpg', aliases: ['магаданская область', 'магадан'] },
  { name: 'Московская область', code: 'МСО', file: 'Московская область.jpg', aliases: ['московская область', 'подмосковье'] },
  { name: 'Мурманская область', code: 'МУР', file: 'Мурманская область.jpg', aliases: ['мурманская область', 'мурманск'] },
  { name: 'Нижегородская область', code: 'НЖГ', file: 'Нижегородская область.jpg', aliases: ['нижегородская область', 'нижний новгород', 'н новгород'] },
  { name: 'Новгородская область', code: 'НВГ', file: 'Новгородская область.jpg', aliases: ['новгородская область', 'великий новгород', 'новгород'] },
  { name: 'Новосибирская область', code: 'НВС', file: 'Новосибирская область.jpg', aliases: ['новосибирская область', 'новосибирск'] },
  { name: 'Омская область', code: 'ОМС', file: 'Омская область.jpg', aliases: ['омская область', 'омск'] },
  { name: 'Оренбургская область', code: 'ОРЕ', file: 'Оренбургская область.jpg', aliases: ['оренбургская область', 'оренбург'] },
  { name: 'Орловская область', code: 'ОРЛ', file: 'Орловская область.jpg', aliases: ['орловская область', 'орел'] },
  { name: 'Пензенская область', code: 'ПНЗ', file: 'Пензенская область.jpg', aliases: ['пензенская область', 'пенза'] },
  { name: 'Псковская область', code: 'ПСК', file: 'Псковская область.jpg', aliases: ['псковская область', 'псков'] },
  { name: 'Ростовская область', code: 'РСТ', file: 'Ростовская область.jpg', aliases: ['ростовская область', 'ростов на дону', 'ростов'] },
  { name: 'Рязанская область', code: 'РЯЗ', file: 'Рязанская область.jpg', aliases: ['рязанская область', 'рязань'] },
  { name: 'Самарская область', code: 'САМ', file: 'Самарская область.jpg', aliases: ['самарская область', 'самара'] },
  { name: 'Саратовская область', code: 'САР', file: 'Саратовская область.jpg', aliases: ['саратовская область', 'саратов'] },
  { name: 'Сахалинская область', code: 'САХ', file: 'Сахалинская область.jpg', aliases: ['сахалинская область', 'сахалинская обл', 'сахалин'] },
  { name: 'Свердловская область', code: 'СВР', file: 'Свердловская область.jpg', aliases: ['свердловская область', 'екатеринбург'] },
  { name: 'Смоленская область', code: 'СМЛ', file: 'Смоленская область.jpg', aliases: ['смоленская область', 'смоленск'] },
  { name: 'Тамбовская область', code: 'ТАМ', file: 'Тамбовская область.jpg', aliases: ['тамбовская область', 'тамбов'] },
  { name: 'Тверская область', code: 'ТВЕ', file: 'Тверская область.jpg', aliases: ['тверская область', 'тверь'] },
  { name: 'Томская область', code: 'ТОМ', file: 'Томская область.jpg', aliases: ['томская область', 'томск'] },
  { name: 'Тульская область', code: 'ТУЛ', file: 'Тульская область.jpg', aliases: ['тульская область', 'тула'] },
  { name: 'Тюменская область', code: 'ТЮМ', file: 'Тюменская область.jpg', aliases: ['тюменская область', 'тюмень'] },
  { name: 'Ульяновская область', code: 'УЛН', file: 'Ульяновская область.jpg', aliases: ['ульяновская область', 'ульяновск'] },
  { name: 'Челябинская область', code: 'ЧЛБ', file: 'Челябинская область.jpg', aliases: ['челябинская область', 'челябинск', 'чел', 'магнитка', 'магнитогорск', 'златоуст', 'миасс'] },
  { name: 'Ярославская область', code: 'ЯРС', file: 'Ярославская область.jpg', aliases: ['ярославская область', 'ярославль'] },
  { name: 'город Москва', code: 'МСК', file: 'город Москва.jpg', aliases: ['москва', 'г москва', 'гор москва'] },
  {
    name: 'город Санкт-Петербург',
    code: 'СПБ',
    file: 'город Санкт Петербург.jpg',
    aliases: ['санкт петербург', 'г санкт петербург', 'петербург', 'питер', 'спб'],
  },
  { name: 'город Севастополь', code: 'СВС', file: 'город Севастополь.jpg', aliases: ['севастополь', 'г севастополь'] },
  { name: 'Еврейская автономная область', code: 'ЕВР', file: 'Еврейская автономная область.jpg', aliases: ['еврейская ао'] },
  { name: 'Ненецкий автономный округ', code: 'НЕН', file: 'Ненецкий автономный округ.jpg', aliases: ['ненецкий ао', 'нао'] },
  {
    name: 'Ханты-Мансийский автономный округ - Югра',
    code: 'ХМН',
    file: 'Ханты-Мансийский автономный округ.jpg',
    aliases: ['ханты мансийский автономный округ югра', 'ханты мансийский ао', 'ханты мансийский автономный округ', 'югра', 'хмао'],
  },
  { name: 'Чукотский автономный округ', code: 'ЧУК', file: 'Чукотский автономный округ.jpg', aliases: ['чукотский ао', 'чукотка'] },
  {
    name: 'Ямало-Ненецкий автономный округ',
    code: 'ЯМН',
    file: 'Ямало-ненецкий автономный округ.jpg',
    aliases: ['ямало ненецкий автономный округ', 'ямало ненецкий ао', 'янао'],
  },
  { name: 'Донецкая народная республика', code: 'ДНР', file: 'Республика ДНР.jpg', aliases: ['донецкая народная республика', 'республика днр', 'днр', 'донецк'] },
  { name: 'Луганская народная республика', code: 'ЛНР', file: 'Республика ЛНР.jpg', aliases: ['луганская народная республика', 'республика лнр', 'лнр', 'луганск'] },
  { name: 'Запорожская область', code: 'ЗАП', file: 'Запорожская область.jpg', aliases: ['запорожская область', 'запорожье'] },
  { name: 'Херсонская область', code: 'ХРО', file: 'Херсонская область.jpg', aliases: ['херсонская область', 'херсон'] },
];

function normalizeRegionText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[()«»"'`]/g, ' ')
    .replace(/[.,]/g, ' ')
    .replace(/[-–—_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesPhrase(haystack, needle) {
  if (!haystack || !needle) return false;
  if (haystack === needle) return true;
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) return false;
    const beforeOk = idx === 0 || haystack[idx - 1] === ' ';
    const afterIdx = idx + needle.length;
    const afterOk = afterIdx === haystack.length || haystack[afterIdx] === ' ';
    if (beforeOk && afterOk) return true;
    from = idx + 1;
  }
  return false;
}

function flagPathFor(file) {
  if (!file) return '';
  return path.resolve(IMAGES_DIR, file);
}

function withFlag(region) {
  if (!region) return null;
  return {
    name: region.name,
    code: region.code,
    file: region.file,
    flagPath: flagPathFor(region.file),
  };
}

const exactMap = new Map();
const phrases = [];
const codeCounts = new Map();

for (const region of REGIONS) {
  codeCounts.set(region.code, (codeCounts.get(region.code) || 0) + 1);
}

for (const region of REGIONS) {
  const keys = new Set();
  keys.add(normalizeRegionText(region.name));
  keys.add(normalizeRegionText(region.file.replace(/\.jpg$/i, '')));
  for (const alias of region.aliases || []) {
    keys.add(normalizeRegionText(alias));
  }
  if (codeCounts.get(region.code) === 1) {
    keys.add(normalizeRegionText(region.code));
  }
  for (const key of keys) {
    if (!key) continue;
    if (!exactMap.has(key)) exactMap.set(key, region);
    phrases.push({ alias: key, region });
  }
}

phrases.sort((a, b) => b.alias.length - a.alias.length);

function resolveRegion(text) {
  const normalized = normalizeRegionText(text);
  if (!normalized) return null;

  const exact = exactMap.get(normalized);
  if (exact) return withFlag(exact);

  for (const prefix of ['г ', 'гор ', 'город ']) {
    if (normalized.startsWith(prefix)) {
      const stripped = exactMap.get(normalized.slice(prefix.length));
      if (stripped) return withFlag(stripped);
    }
  }

  for (const { alias, region } of phrases) {
    if (includesPhrase(normalized, alias)) return withFlag(region);
  }

  if (normalized.length >= 6) {
    const reverseHits = [];
    const seen = new Set();
    for (const { alias, region } of phrases) {
      if (!includesPhrase(alias, normalized)) continue;
      if (seen.has(region.name)) continue;
      seen.add(region.name);
      reverseHits.push(region);
      if (reverseHits.length > 1) break;
    }
    if (reverseHits.length === 1) return withFlag(reverseHits[0]);
  }

  return null;
}

function regionCode(text) {
  return resolveRegion(text)?.code || '';
}

function normalizeClubNameMode(mode) {
  return mode === 'full' ? 'full' : 'short';
}

function formatClubDisplay(club, options = {}) {
  const original = club == null ? '' : String(club).trim();
  const nationality = options.nationality == null ? '' : String(options.nationality).trim();
  const mode = normalizeClubNameMode(options.mode);
  if (mode === 'full') {
    return original || nationality;
  }
  return regionCode(original) || regionCode(nationality) || nationality || original;
}

function formatRegionClub(text, options = {}) {
  return formatClubDisplay(text, { mode: 'short', ...options });
}

function regionFlagPath(text) {
  return resolveRegion(text)?.flagPath || '';
}

function regionFlagPathFromClub(club, nationality) {
  return regionFlagPath(club) || regionFlagPath(nationality) || '';
}

module.exports = {
  IMAGES_DIR,
  REGIONS,
  normalizeRegionText,
  resolveRegion,
  regionCode,
  normalizeClubNameMode,
  formatClubDisplay,
  formatRegionClub,
  regionFlagPath,
  regionFlagPathFromClub,
};
