const endpoints = {
  characters: '/api/characters',
  buddies:    '/api/buddies',
  items:      '/api/items',
  skills:     '/api/skills',
  stages:     '/api/stages',
  strings:    '/api/strings',
  audio:      '/api/audio',
  assets:     '/api/assets',
};

export async function fetchInitialData() {
  const [strings, stats] = await Promise.all([
    fetch('/api/strings').then(r => r.json()),
    fetch('/api/stats').then(r => r.json())
  ]);
  return { strings, stats, audio: stats.audio };
}

export async function fetchCategoryData(category) {
  if (!endpoints[category]) return null;
  const res = await fetch(endpoints[category]);
  return res.json();
}

export async function fetchPaginatedCategory(category, params = {}) {
  if (!endpoints[category]) return { items: [], total: 0, page: 1, has_more: false };
  
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      query.append(key, val);
    }
  });
  
  const url = `${endpoints[category]}?${query.toString()}`;
  const res = await fetch(url);
  return res.json();
}

export async function fetchAllData() {
  const keys = Object.keys(endpoints);
  const results = await Promise.all(
    Object.values(endpoints).map(url => fetch(url).then(r => r.json()))
  );
  const data = {};
  keys.forEach((key, i) => { data[key] = results[i]; });
  return data;
}

export async function fetchItemDetails(itemId) {
  const res = await fetch(`/api/item/${itemId}`);
  return res.json();
}
