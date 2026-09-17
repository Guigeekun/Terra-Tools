import { useState, useEffect } from 'react';

const PREFIX = 'terratools.';

/**
 * useState synced to localStorage under the "terratools." namespace.
 * The initial value is read synchronously so the first render — and the first
 * data fetch driven by it — already uses the persisted value. Storage failures
 * (private mode, quota) degrade gracefully to plain in-memory state.
 */
export function usePersistentState(key, defaultValue) {
  const storageKey = PREFIX + key;

  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw !== null) return JSON.parse(raw);
    } catch {
      // corrupted entry or storage unavailable: fall back to the default
    }
    return defaultValue;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // storage full or blocked: keep the value in memory only
    }
  }, [storageKey, value]);

  return [value, setValue];
}
