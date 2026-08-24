import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchPaginatedCategory } from '../api';
import { useGameData } from '../contexts/GameDataContext';

export function usePaginatedCategory(category, filters = {}, limit = 20) {
  const { lang, data } = useGameData();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
  
  const sentinelRef = useRef(null);
  const activeRequestRef = useRef(0);

  // Debounce filters (e.g. search string) by 250ms
  const [debouncedFilters, setDebouncedFilters] = useState(filters);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedFilters(filters);
    }, 250);
    return () => clearTimeout(handler);
  }, [JSON.stringify(filters)]);

  const filtersKey = JSON.stringify(debouncedFilters);

  // Fetch Page 1 on mount or when category/debouncedFilters change
  useEffect(() => {
    const requestId = ++activeRequestRef.current;
    setIsInitialLoading(true);
    setPage(1);

    fetchPaginatedCategory(category, { page: 1, limit, ...debouncedFilters })
      .then(res => {
        if (requestId !== activeRequestRef.current) return;
        const fetchedItems = Array.isArray(res) ? res : (res.items || []);
        const totalCount = res.total ?? fetchedItems.length;
        const more = res.has_more ?? (fetchedItems.length === limit);

        setItems(fetchedItems);
        setTotal(totalCount);
        setHasMore(more);
        setIsInitialLoading(false);
      })
      .catch(err => {
        console.error(`Error fetching page 1 for ${category}:`, err);
        if (requestId === activeRequestRef.current) {
          setIsInitialLoading(false);
        }
      });
  }, [category, filtersKey, limit]);

  // Load next page function
  const loadNextPage = useCallback(() => {
    if (isInitialLoading || isFetchingNextPage || !hasMore) return;

    const nextPage = page + 1;
    const requestId = activeRequestRef.current;
    setIsFetchingNextPage(true);

    fetchPaginatedCategory(category, { page: nextPage, limit, ...debouncedFilters })
      .then(res => {
        if (requestId !== activeRequestRef.current) return;
        const newItems = Array.isArray(res) ? res : (res.items || []);
        const more = res.has_more ?? (newItems.length === limit);

        setItems(prev => [...prev, ...newItems]);
        setPage(nextPage);
        setHasMore(more);
        setIsFetchingNextPage(false);
      })
      .catch(err => {
        console.error(`Error fetching page ${nextPage} for ${category}:`, err);
        if (requestId === activeRequestRef.current) {
          setIsFetchingNextPage(false);
        }
      });
  }, [category, debouncedFilters, limit, page, isInitialLoading, isFetchingNextPage, hasMore]);

  // IntersectionObserver for scroll sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFetchingNextPage && !isInitialLoading) {
          loadNextPage();
        }
      },
      { rootMargin: '350px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinelRef, hasMore, isFetchingNextPage, isInitialLoading, loadNextPage]);

  return {
    items,
    total,
    page,
    hasMore,
    isInitialLoading,
    isFetchingNextPage,
    sentinelRef,
    lang,
    data
  };
}
