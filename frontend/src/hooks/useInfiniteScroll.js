import { useState, useEffect, useRef } from 'react';

export function useInfiniteScroll(items = [], batchSize = 24) {
  const [displayCount, setDisplayCount] = useState(batchSize);
  const sentinelRef = useRef(null);

  // Reset display count when input items change (e.g. search query or filter change)
  useEffect(() => {
    setDisplayCount(batchSize);
  }, [items, batchSize]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDisplayCount(prev => Math.min(prev + batchSize, items.length));
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [items.length, batchSize]);

  const visibleItems = items.slice(0, displayCount);
  const hasMore = displayCount < items.length;

  return {
    visibleItems,
    hasMore,
    sentinelRef,
    displayCount
  };
}
