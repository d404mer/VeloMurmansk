const axios = require('axios');

function buildUrl(baseUrl, raceGuid, stageGuid, categoryGuid) {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/${raceGuid}/${stageGuid}/${categoryGuid}`;
}

async function fetchResults(limetimeConfig, raceGuid, stageGuid, categoryGuid) {
  const url = buildUrl(limetimeConfig.baseUrl, raceGuid, stageGuid, categoryGuid);
  const response = await axios.get(url, {
    headers: {
      accept: 'application/json, text/plain, */*',
      'limetime-api-key': limetimeConfig.apiKey,
      Origin: limetimeConfig.origin,
      Referer: limetimeConfig.referer,
    },
    timeout: 15000,
  });

  if (!response.data || response.data.isSuccess !== true) {
    throw new Error('Limetime API returned unsuccessful response');
  }

  return response.data.data || [];
}

module.exports = {
  buildUrl,
  fetchResults,
};
