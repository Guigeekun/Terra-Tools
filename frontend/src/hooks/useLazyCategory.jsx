import { useEffect } from 'react';
import { useGameData } from '../contexts/GameDataContext';

export function useLazyCategory(category) {
  const { data, loadingCategory, loadCategory, lang } = useGameData();

  useEffect(() => {
    if (category && (!data || data[category] === undefined)) {
      loadCategory(category);
    }
  }, [category, data, loadCategory]);

  const isLoaded = Boolean(data && data[category] !== undefined && data[category] !== null);
  const isLoading = Boolean(loadingCategory[category]) || (!isLoaded && Boolean(category));

  return {
    categoryData: data ? data[category] : null,
    isLoaded,
    isLoading,
    lang,
    data
  };
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
