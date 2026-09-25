import { useEffect, useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchDocs, fetchDoc } from '../../api';
import { usePersistentState } from '../../hooks/usePersistentState';

// Tags are free-form slugs in each doc's frontmatter; known ones get a proper
// label, unknown ones fall back to a title-cased reading of the slug.
const TAG_LABELS = {
  retb: 'reTB',
  'project-liminal-gate': 'Project Liminal Gate'
};

function tagLabel(tag) {
  const known = TAG_LABELS[tag.toLowerCase()];
  if (known) return known;
  return tag.split(/[-_]/).filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
}

function formatDate(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' :
    date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function DocsTab() {
  const [docs, setDocs] = useState(null);
  const [tags, setTags] = useState([]);
  const [error, setError] = useState(null);
  const [activeTag, setActiveTag] = usePersistentState('docs-tag', 'all');
  const [search, setSearch] = useState('');
  const [slug, setSlug] = useState(null);
  const [doc, setDoc] = useState(null);
  const [docLoading, setDocLoading] = useState(false);

  useEffect(() => {
    fetchDocs()
      .then(res => { setDocs(res.docs); setTags(res.tags); })
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setDoc(null);
    setDocLoading(true);
    fetchDoc(slug)
      .then(fetched => { if (!cancelled) setDoc(fetched); })
      .catch(e => {
        if (cancelled) return;
        setError(e.message);
        setSlug(null);
      })
      .finally(() => { if (!cancelled) setDocLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  const visibleDocs = useMemo(() => {
    if (!docs) return [];
    const query = search.trim().toLowerCase();
    return docs.filter(d =>
      (activeTag === 'all' || d.tags.includes(activeTag)) &&
      (!query || d.title.toLowerCase().includes(query) || d.description.toLowerCase().includes(query))
    );
  }, [docs, activeTag, search]);

  if (error) {
    return (
      <div className="tab-content">
        <div className="docs-error">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <p>{error}</p>
          <button className="results-reset" onClick={() => setError(null)}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-content">
      {slug ? (
        <div className="docs-article">
          <button className="docs-back-btn" onClick={() => { setSlug(null); setDoc(null); }}>
            <i className="fa-solid fa-arrow-left"></i> All docs
          </button>
          {docLoading && (
            <p className="docs-status"><i className="fa-solid fa-spinner fa-spin"></i> Loading…</p>
          )}
          {doc && (
            <>
              <div className="docs-article-head">
                <h2>{doc.title}</h2>
                <div className="docs-card-tags">
                  {doc.tags.map(t => <span key={t} className="docs-tag-chip">{tagLabel(t)}</span>)}
                </div>
              </div>
              {doc.updated && <p className="docs-updated">Updated {formatDate(doc.updated)}</p>}
              <div className="docs-markdown">
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" /> }}
                >
                  {doc.content}
                </Markdown>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="filter-bar docs-filter-bar">
            <div className="docs-tag-chips">
              <button
                className={`docs-tag-chip ${activeTag === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTag('all')}
              >
                All <span className="docs-tag-count">{docs?.length ?? '…'}</span>
              </button>
              {tags.map(({ tag, count }) => (
                <button
                  key={tag}
                  className={`docs-tag-chip ${activeTag === tag ? 'active' : ''}`}
                  onClick={() => setActiveTag(tag)}
                >
                  {tagLabel(tag)} <span className="docs-tag-count">{count}</span>
                </button>
              ))}
            </div>
            <div className="search-input-wrapper">
              <i className="fa-solid fa-magnifying-glass"></i>
              <input
                type="text"
                placeholder="Search docs…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <p className="results-meta">
            <i className="fa-solid fa-file-lines"></i> {visibleDocs.length} document{visibleDocs.length === 1 ? '' : 's'}
          </p>

          {docs && visibleDocs.length === 0 && (
            <div className="docs-empty">
              <i className="fa-solid fa-book-open"></i>
              <p>No documents match this filter yet.</p>
              <button className="results-reset" onClick={() => { setActiveTag('all'); setSearch(''); }}>
                Reset filters
              </button>
            </div>
          )}

          <div className="docs-grid">
            {visibleDocs.map(d => (
              <article key={d.slug} className="docs-card" onClick={() => setSlug(d.slug)}>
                <h3>{d.title}</h3>
                {d.description && <p>{d.description}</p>}
                <div className="docs-card-foot">
                  <div className="docs-card-tags">
                    {d.tags.map(t => <span key={t} className="docs-tag-chip">{tagLabel(t)}</span>)}
                  </div>
                  {d.updated && <span className="docs-updated">{formatDate(d.updated)}</span>}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
