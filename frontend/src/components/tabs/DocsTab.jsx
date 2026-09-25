import { useEffect, useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
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

// Flatten react-markdown children (string | element | array) to plain text so
// a bare autolinked URL can be told apart from a labelled link.
function childText(children) {
  if (children == null) return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(childText).join('');
  if (children.props?.children) return childText(children.props.children);
  return '';
}

// Extract the video id and start timestamp from any share form of a YouTube
// URL (watch?v=, youtu.be/, /embed/, /shorts/, /live/). Returns null for
// non-YouTube URLs; only the id ever reaches the iframe we build.
const VIDEO_ID_RE = /^[\w-]{6,}$/;

function extractYouTube(rawUrl) {
  if (!rawUrl) return null;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  let id = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] || null;
  } else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
    if (url.pathname === '/watch') {
      id = url.searchParams.get('v');
    } else {
      const match = url.pathname.match(/^\/(embed|shorts|live)\/([^/?#]+)/);
      id = match ? match[2] : null;
    }
  }
  if (!id || !VIDEO_ID_RE.test(id)) return null;

  // Shared timestamps arrive as ?t=1m30s (or ?start=<seconds>); the embed
  // player wants a plain seconds count in start=.
  const rawStart = url.searchParams.get('t') ?? url.searchParams.get('start');
  let start = 0;
  if (rawStart && /^\d+$/.test(rawStart)) {
    start = parseInt(rawStart, 10);
  } else if (rawStart) {
    for (const [, num, unit] of rawStart.matchAll(/(\d+)(h|m|s)/g)) {
      start += parseInt(num, 10) * (unit === 'h' ? 3600 : unit === 'm' ? 60 : 1);
    }
  }
  return { id, start };
}

function YouTubeEmbed({ video, title }) {
  const src = `https://www.youtube-nocookie.com/embed/${video.id}` +
    (video.start > 0 ? `?start=${video.start}` : '');
  return (
    <div className="docs-video-embed">
      <iframe
        src={src}
        title={title || 'YouTube video player'}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}

// Raw HTML in docs is parsed (rehype-raw) then constrained to the GitHub
// schema plus bare iframes; the iframe component below rebuilds the player
// itself, so only YouTube embeds ever make it into the DOM.
const DOCS_SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), 'iframe'],
  attributes: {
    ...defaultSchema.attributes,
    iframe: ['src', 'title']
  },
  protocols: {
    ...defaultSchema.protocols,
    src: ['https']
  }
};

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
                  rehypePlugins={[rehypeRaw, [rehypeSanitize, DOCS_SANITIZE_SCHEMA]]}
                  components={{
                    a: ({ node: _node, children, href, ...props }) => {
                      const video = href ? extractYouTube(href) : null;
                      // A bare pasted YouTube URL (GFM autolink: link text
                      // equals the href) becomes an embedded player; a
                      // labelled link stays a link.
                      if (video && childText(children).trim().toLowerCase() === href.trim().toLowerCase()) {
                        return <YouTubeEmbed video={video} />;
                      }
                      return <a {...props} href={href} target="_blank" rel="noreferrer">{children}</a>;
                    },
                    iframe: ({ node: _node, src, title }) => {
                      // Sanitised embed tags are rebuilt from the extracted
                      // video id on the privacy-enhanced player domain.
                      const video = src ? extractYouTube(src) : null;
                      return video ? <YouTubeEmbed video={video} title={title} /> : null;
                    }
                  }}
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
