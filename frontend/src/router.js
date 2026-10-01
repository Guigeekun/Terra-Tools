import { useEffect, useState } from 'react';
import { trackRumView } from './rum.js';

// ---------- hash router ----------
// The app is an SPA served as static files, so routes live in the URL hash —
// the same scheme the Docs tab introduced ('#/docs/<slug>'). Every tab, modal
// and search filter is reflected in the hash, which makes views shareable,
// lets the browser back/forward buttons walk tab and modal history, and lets
// people open several tabs side by side without server-side fallbacks.
//
//   '#/dashboard'                plain tab
//   '#/characters?char=123'      tab with the character modal open
//   '#/stages?item=45&buddy=7'   stacked item + companion modals over Stages
//   '#/skills?q=Nucleus'         tab with a pre-filled search
//   '#/docs/<slug>#<section>'    docs (parsed by DocsTab itself)

const DEFAULT_TAB = 'dashboard';

// Parse the current hash into { tab, params }. Unknown tabs fall back to the
// dashboard so a stale or hand-edited URL never renders a blank app. The Docs
// tab keeps owning everything after '#/docs' — this only needs the tab name.
export function parseHash(hash = window.location.hash) {
  let h = hash.replace(/^#/, '');
  if (!h.startsWith('/')) h = '/' + h; // tolerate the legacy '#docs' spelling
  const [path, search = ''] = h.split('?');
  const tab = path.split('/').filter(Boolean)[0] || DEFAULT_TAB;
  const params = {};
  for (const [key, value] of new URLSearchParams(search)) params[key] = value;
  return { tab, params };
}

// Build a hash for a tab, keeping only defined, non-empty params.
export function tabHash(tab, params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.append(key, value);
  }
  const qs = search.toString();
  return '#/' + tab + (qs ? '?' + qs : '');
}

// Navigate to a hash. Push (default) adds a history entry so Back undoes the
// navigation; replace overwrites the current entry (initial defaults, closing
// a modal that was reached via a pasted URL). replaceState doesn't fire
// 'hashchange' itself, so dispatch one to keep router subscribers in sync.
export function navigate(hash, { replace = false } = {}) {
  const target = hash.startsWith('#') ? hash : '#' + hash;
  if (window.location.hash === target) return;
  if (replace) {
    window.history.replaceState(null, '', target);
    window.dispatchEvent(new Event('hashchange'));
  } else {
    window.location.hash = target;
  }
}

export function useHashRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const sync = () => setRoute(parseHash());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  // Report each tab as a Datadog RUM view; trackRumView no-ops when RUM
  // is not configured.
  useEffect(() => {
    trackRumView(route);
  }, [route]);
  return route;
}
