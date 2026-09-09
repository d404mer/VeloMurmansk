const ATHLETE_KEYS = {
  num: 'номер',
  name: 'участник',
  age: 'возраст',
  city: 'клуб',
  place: 'место',
  result: 'результат',
  gap: 'доЛидера',
};

const TARGET_FIELDS = ['num', 'name', 'age', 'city', 'place', 'result', 'gap'];

const DEFAULT_FIELD_MAPPING = {
  num: 'number',
  name: 'account.lastName+account.firstName',
  age: 'account.age',
  city: 'club',
  place: 'position',
  result: 'resultTime',
  gap: 'leaderDifference',
};

const AVAILABLE_SOURCE_FIELDS = [
  'number',
  'bib',
  'club',
  'team',
  'city',
  'nationality',
  'position',
  'resultTime',
  'leaderDifference',
  'isFinished',
  'isOnStart',
  'account.firstName',
  'account.lastName',
  'account.age',
  'firstname',
  'lastname',
  'year',
  'startTime',
  'race',
  'category',
  'laps',
];

const SOURCE_ALIASES = {
  bib: 'number',
  lastname: 'account.lastName',
  firstname: 'account.firstName',
  lastName: 'account.lastName',
  firstName: 'account.firstName',
  year: 'account.age',
  birthyear: 'account.age',
};

function getOwnOrCi(obj, part) {
  if (obj == null || typeof obj !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, part)) return obj[part];
  const want = String(part).toLowerCase();
  const key = Object.keys(obj).find((k) => String(k).toLowerCase() === want);
  return key != null ? obj[key] : undefined;
}

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  let current = obj;
  for (const part of String(path).trim().split('.')) {
    if (current == null) return undefined;
    current = getOwnOrCi(current, part);
  }
  return current;
}

function resolvePathPart(root, part) {
  const direct = getByPath(root, part);
  if (direct != null && direct !== '') return direct;
  const alias = SOURCE_ALIASES[part] || SOURCE_ALIASES[String(part).toLowerCase()];
  if (alias && alias !== part) return getByPath(root, alias);
  return direct;
}

function resolvePathExpression(root, pathExpression) {
  const parts = String(pathExpression)
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);

  const values = parts
    .map((part) => {
      const value = resolvePathPart(root, part);
      if (value == null || value === '') return '';
      return String(value).trim();
    })
    .filter(Boolean);

  return values.join(' ');
}

function legacyAthleteValue(athlete, fieldKey) {
  if (!athlete) return '';
  const mappedKey = ATHLETE_KEYS[fieldKey];
  if (mappedKey && athlete[mappedKey] != null && athlete[mappedKey] !== '') {
    return athlete[mappedKey];
  }
  if (fieldKey === 'name') {
    return athlete.participant || athlete.name || '';
  }
  if (fieldKey === 'num') {
    return athlete.number != null ? String(athlete.number) : '';
  }
  if (fieldKey === 'city') {
    return athlete.club || athlete.city || '';
  }
  if (fieldKey === 'age') {
    return athlete.age != null ? String(athlete.age) : '';
  }
  if (fieldKey === 'place') {
    return athlete.место ?? athlete.place ?? '';
  }
  if (fieldKey === 'result') {
    return athlete.результат ?? athlete.result ?? athlete.resultTime ?? '';
  }
  if (fieldKey === 'gap') {
    return athlete.доЛидера ?? athlete.gapToLeader ?? athlete.leaderDifference ?? '';
  }
  return '';
}

function resolveAthleteValue(rawOrMappedAthlete, targetFieldKey, mapping) {
  if (!rawOrMappedAthlete) return '';

  const pathExpression = mapping?.[targetFieldKey];
  if (pathExpression != null && pathExpression !== '') {
    const root = rawOrMappedAthlete.raw ?? rawOrMappedAthlete;
    return resolvePathExpression(root, pathExpression);
  }

  return legacyAthleteValue(rawOrMappedAthlete, targetFieldKey);
}

function normalizeFieldMapping(input) {
  if (!input || typeof input !== 'object') return {};
  const normalized = {};
  for (const key of TARGET_FIELDS) {
    if (input[key] == null) continue;
    const value = String(input[key]).trim();
    if (value) normalized[key] = value;
  }
  return normalized;
}

module.exports = {
  ATHLETE_KEYS,
  TARGET_FIELDS,
  DEFAULT_FIELD_MAPPING,
  AVAILABLE_SOURCE_FIELDS,
  SOURCE_ALIASES,
  getByPath,
  resolvePathExpression,
  legacyAthleteValue,
  resolveAthleteValue,
  normalizeFieldMapping,
};
