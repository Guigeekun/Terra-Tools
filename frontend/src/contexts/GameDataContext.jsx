import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchInitialData, fetchCategoryData } from '../api';

const GameDataContext = createContext(null);

export function GameDataProvider({ children }) {
  const [data, setData] = useState(null);
  const [lang, setLang] = useState('en');
  const [loading, setLoading] = useState(true);
  const [loadingCategory, setLoadingCategory] = useState({});

  useEffect(() => {
    fetchInitialData()
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(e => {
        console.error('Error fetching initial game data:', e);
        setLoading(false);
      });
  }, []);

  const loadCategory = useCallback((category) => {
    if (!category || (data && data[category])) return Promise.resolve(data ? data[category] : null);
    if (loadingCategory[category]) return Promise.resolve(null);

    setLoadingCategory(prev => ({ ...prev, [category]: true }));
    return fetchCategoryData(category)
      .then(catData => {
        setData(prev => ({ ...prev, [category]: catData }));
        setLoadingCategory(prev => ({ ...prev, [category]: false }));
        return catData;
      })
      .catch(e => {
        console.error(`Error fetching category ${category}:`, e);
        setLoadingCategory(prev => ({ ...prev, [category]: false }));
        return null;
      });
  }, [data, loadingCategory]);

  return (
    <GameDataContext.Provider value={{ data, lang, setLang, loading, loadingCategory, loadCategory }}>
      {children}
    </GameDataContext.Provider>
  );
}

export function useGameData() {
  const ctx = useContext(GameDataContext);
  if (!ctx) throw new Error('useGameData must be used within a GameDataProvider');
  return ctx;
}
