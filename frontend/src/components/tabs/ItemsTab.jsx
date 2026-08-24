import { useState, useMemo } from 'react';
import { loc } from '../../utils/localization';
import { TabSpinner } from '../../hooks/useLazyCategory';
import { usePaginatedCategory } from '../../hooks/usePaginatedCategory';

export default function ItemsTab({ onSelectItem }) {
  const [search, setSearch] = useState('');
  const filters = useMemo(() => ({ search }), [search]);

  const { items, total, isInitialLoading, isFetchingNextPage, sentinelRef, lang } = usePaginatedCategory('items', filters, 24);

  return (
    <div className="tab-content">
      <div className="filter-bar">
        <div className="search-input-wrapper">
          <i className="fa-solid fa-search"></i>
          <input placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} />
          {isInitialLoading && <i className="fa-solid fa-circle-notch fa-spin" style={{ marginLeft: 8, color: 'var(--accent-blue)', fontSize: 14 }}></i>}
        </div>
      </div>
      <div className="grid-layout">
        {isInitialLoading && items.length === 0 ? (
          <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center' }}>
            <TabSpinner message="Loading items..." />
          </div>
        ) : items.length === 0 ? (
          <p className="stages-panel-placeholder" style={{ gridColumn: '1/-1' }}>No items found.</p>
        ) : (
          <>
            {items.map((item, idx) => {
              const itemIndex = item.item_index || (idx + 1);
              return (
                <div key={itemIndex} className="card-item" style={{ padding: 16 }} onClick={() => onSelectItem(itemIndex)}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, minHeight: 64 }}>
                    {item.icon_url ? (
                      <img src={item.icon_url} alt={loc(item.NameString, lang)} style={{ width: 64, height: 64, objectFit: 'contain', imageRendering: 'pixelated' }} onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }} />
                    ) : null}
                    <div className="card-image-placeholder" style={{ height: 64, display: item.icon_url ? 'none' : 'flex' }}>
                      <i className="fa-solid fa-gem" style={{ fontSize: 20 }}></i>
                    </div>
                  </div>
                  <h5 className="card-name" style={{ fontSize: 14 }}>{loc(item.NameString, lang)}</h5>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: 4, flexGrow: 1 }}>
                    {loc(item.DescString, lang)}
                  </p>
                  <div className="card-details-row" style={{ marginTop: 8, paddingTop: 6 }}>
                    <span>ID: {itemIndex}</span>
                    <span>Sort: {item.sortOrder || 0}</span>
                  </div>
                </div>
              );
            })}
            <div ref={sentinelRef} style={{ height: 30, gridColumn: '1/-1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isFetchingNextPage && <div className="loading-spinner" style={{ width: 24, height: 24, borderTopColor: 'var(--accent-blue)' }} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
