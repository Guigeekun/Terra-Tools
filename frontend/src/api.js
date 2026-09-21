const endpoints = {
  characters: '/api/characters',
  buddies:    '/api/buddies',
  items:      '/api/items',
  skills:     '/api/skills',
  stages:     '/api/stages',
  chapters:   '/api/chapters',
  strings:    '/api/strings',
  audio:      '/api/audio',
};

export async function fetchChapters() {
  const res = await fetch('/api/chapters');
  return res.json();
}

export async function fetchInitialData() {
  const [strings, stats, skills] = await Promise.all([
    fetch('/api/strings').then(r => r.json()),
    fetch('/api/stats').then(r => r.json()),
    fetch('/api/skills').then(r => r.json())
  ]);
  return { strings, stats, skills, audio: stats.audio };
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

export async function fetchCharacter(charId) {
  const res = await fetch(`/api/characters/${charId}`);
  if (!res.ok) throw new Error(`Failed to fetch character ${charId}`);
  return res.json();
}

export async function inspectSave(saveData) {
  const res = await fetch('/api/saves/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(saveData)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to inspect save' }));
    throw new Error(err.detail || 'Inspection failed');
  }
  return res.json();
}

export async function convertSave(saveData, targetFormat = null, accountId = null) {
  const res = await fetch('/api/saves/convert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: saveData,
      target_format: targetFormat,
      account_id: accountId
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to convert save' }));
    throw new Error(err.detail || 'Conversion failed');
  }
  return res.json();
}

