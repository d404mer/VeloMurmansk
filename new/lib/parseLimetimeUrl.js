const UUID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function parseLimetimeUrl(input) {
  const raw = (input || '').trim();
  if (!raw) {
    throw new Error('Ссылка не может быть пустой');
  }

  let path = raw;
  try {
    if (/^https?:\/\//i.test(raw)) {
      path = new URL(raw).pathname;
    }
  } catch {
    throw new Error('Некорректный URL');
  }

  const marker = '/results/get/';
  const markerIndex = path.toLowerCase().indexOf(marker);
  if (markerIndex !== -1) {
    path = path.slice(markerIndex + marker.length);
  }

  path = path.replace(/^\/+/, '').replace(/\/+$/, '');
  const guids = path.match(UUID);

  if (!guids || guids.length < 3) {
    throw new Error(
      'Не удалось найти 3 GUID в ссылке. Ожидается формат: .../results/get/{raceGuid}/{stageGuid}/{categoryGuid}'
    );
  }

  const [raceGuid, stageGuid, categoryGuid] = guids.slice(-3);

  return { raceGuid, stageGuid, categoryGuid };
}

module.exports = {
  parseLimetimeUrl,
};
