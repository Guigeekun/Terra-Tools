import { useEffect } from 'react';
import { useGameData } from '../contexts/GameDataContext';

// Fire-and-forget preload: every caller just wants the category fetched; the
// data itself arrives through useGameData.
export function useLazyCategory(category) {
  const { data, loadCategory } = useGameData();

  useEffect(() => {
    if (category && (!data || data[category] === undefined)) {
      loadCategory(category);
    }
  }, [category, data, loadCategory]);
}

export function TabSpinner({ message = "Loading data..." }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 20px',
      color: 'var(--text-secondary)'
    }}>
      <div className="loading-spinner" style={{ marginBottom: 16 }}></div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{message}</div>
    </div>
  );
}
