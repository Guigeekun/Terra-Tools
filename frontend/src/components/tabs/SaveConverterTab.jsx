import { useState, useRef, useEffect, useMemo } from 'react';
import { useGameData } from '../../contexts/GameDataContext';
import { loc } from '../../utils/localization';
import { detectSaveFormat, inspectSaveData, convertSaveData, applySaveEdits, EMPTY_SAVE_EDITS, hasSaveEdits, sanitizeCountInput, ITEM_MAX_STACK } from '../../utils/saveConverter';
import { inspectSave, convertSave } from '../../api';

// Characters visible in the roster box (roughly) before the "scroll to see all" hint shows.
const ROSTER_HINT_THRESHOLD = 12;

// Add-item search results shown before the list needs scrolling.
const ITEM_PICKER_LIMIT = 8;

export default function SaveConverterTab() {
  const { data: gameData, lang, loadCategory } = useGameData();
  const gamedataCharacters = gameData?.characters || null;
  const gamedataItems = gameData?.items || null;

  // Character + item names come from the game database; load the catalogs
  // lazily and cache them in the shared context so the Characters/Items tabs
  // reuse them.
  useEffect(() => {
    if (!gamedataCharacters) loadCategory('characters');
  }, [gamedataCharacters, loadCategory]);

  useEffect(() => {
    if (!gamedataItems) loadCategory('items');
  }, [gamedataItems, loadCategory]);

  const charNameById = useMemo(() => {
    const map = {};
    (gamedataCharacters || []).forEach(c => {
      if (c && c.ID !== undefined) map[c.ID] = loc(c.NameString, lang, `Character #${c.ID}`);
    });
    return map;
  }, [gamedataCharacters, lang]);

  const itemNameById = useMemo(() => {
    const map = {};
    (gamedataItems || []).forEach(it => {
      if (it && it.item_index !== undefined) map[it.item_index] = loc(it.NameString, lang, `Item #${it.item_index}`);
    });
    return map;
  }, [gamedataItems, lang]);

  const [sourceData, setSourceData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [inspection, setInspection] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [targetFormat, setTargetFormat] = useState('retb');
  const [convertedResult, setConvertedResult] = useState(null);
  const [edits, setEdits] = useState(EMPTY_SAVE_EDITS);
  const [isWindowDragging, setIsWindowDragging] = useState(false);
  const [showJsonViewer, setShowJsonViewer] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [error, setError] = useState(null);
  const [itemSearch, setItemSearch] = useState('');
  const [itemAddCount, setItemAddCount] = useState('1');

  const fileInputRef = useRef(null);
  const dragCounter = useRef(0);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Global window drag & drop event handling
  useEffect(() => {
    const handleWindowDragEnter = (e) => {
      e.preventDefault();
      dragCounter.current += 1;
      if (e.dataTransfer?.items?.length > 0) {
        setIsWindowDragging(true);
      }
    };

    const handleWindowDragLeave = (e) => {
      e.preventDefault();
      dragCounter.current -= 1;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setIsWindowDragging(false);
      }
    };

    const handleWindowDragOver = (e) => {
      e.preventDefault();
    };

    const handleWindowDrop = (e) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsWindowDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        readFile(file);
      }
    };

    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, []);

  const processJsonData = async (jsonObj, name = 'savefile.json', sizeStr = '') => {
    setError(null);
    setConvertedResult(null);
    try {
      setLoading(true);
      setLoadingText('Inspecting savefile structure...');

      const fmt = detectSaveFormat(jsonObj);
      if (fmt === 'unknown') {
        throw new Error('Unrecognized savefile format. Expected Project Liminal Gate or ReTB JSON.');
      }

      let inspectRes;
      try {
        inspectRes = inspectSaveData(jsonObj);
      } catch (e) {
        inspectRes = await inspectSave(jsonObj);
      }

      setSourceData(jsonObj);
      setFileName(name);
      setFileSize(sizeStr);
      setInspection(inspectRes);
      setSelectedAccountId(inspectRes.active_account_id);
      setEdits(EMPTY_SAVE_EDITS);

      const defaultTarget = inspectRes.format === 'liminal' ? 'retb' : 'liminal';
      setTargetFormat(defaultTarget);

      showToast(`Loaded ${name} (${inspectRes.format_label})`);
    } catch (err) {
      setError(err.message || 'Failed to parse savefile JSON.');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  const doConvert = async (dataToConvert, targetFmt, accId) => {
    try {
      let res;
      try {
        res = convertSaveData(dataToConvert, targetFmt, accId);
      } catch (e) {
        res = await convertSave(dataToConvert, targetFmt, accId);
      }
      setConvertedResult(res);
    } catch (err) {
      setError(`Conversion error: ${err.message}`);
    }
  };

  // Single conversion trigger: any change to the loaded file, target format,
  // selected account, or inline edits re-runs the conversion (debounced so
  // typing in an edit field doesn't convert every keystroke).
  useEffect(() => {
    if (!sourceData) return;
    const handle = setTimeout(() => {
      const dataToConvert = applySaveEdits(sourceData, edits, selectedAccountId);
      doConvert(dataToConvert, targetFormat, selectedAccountId);
    }, 300);
    return () => clearTimeout(handle);
  }, [sourceData, edits, targetFormat, selectedAccountId]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readFile(file);
  };

  const readFile = (file) => {
    if (!file.name.toLowerCase().endsWith('.json') && file.type && !file.type.includes('json')) {
      setError(`File "${file.name}" is not a JSON file. Please drop a valid .json savefile.`);
      return;
    }

    setLoading(true);
    setLoadingText(`Reading ${file.name}...`);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const parsed = JSON.parse(text);
        const sizeKb = (file.size / 1024).toFixed(1);
        const sizeStr = file.size > 1024 * 1024 
          ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` 
          : `${sizeKb} KB`;
        processJsonData(parsed, file.name, sizeStr);
      } catch (e) {
        setLoading(false);
        setError(`Failed to parse JSON in "${file.name}": ${e.message}`);
      }
    };
    reader.onerror = () => {
      setLoading(false);
      setError(`Error reading "${file.name}".`);
    };
    reader.readAsText(file);
  };

  const handleTargetFormatChange = (newTarget) => {
    setTargetFormat(newTarget);
  };

  const handleAccountSelect = (accId) => {
    setSelectedAccountId(accId);
    setEdits(EMPTY_SAVE_EDITS);
  };

  const handleResetEdits = () => {
    setEdits(EMPTY_SAVE_EDITS);
    showToast('Edits reverted to the loaded save.');
  };

  const handleEditChange = (field, value) => {
    setEdits(prev => ({
      ...prev,
      [field]: field === 'username' ? value : sanitizeCountInput(value)
    }));
  };

  const handleCharEdit = (charId, field, raw) => {
    setEdits(prev => {
      const characters = { ...prev.characters };
      const entry = { ...(characters[charId] || {}) };
      const value = sanitizeCountInput(raw);
      if (value === null) delete entry[field];
      else entry[field] = value;
      if (Object.keys(entry).length === 0) delete characters[charId];
      else characters[charId] = entry;
      return { ...prev, characters };
    });
  };

  // Item counts: '' clears the edit (back to the loaded save), an explicit 0
  // removes the item from the pouch.
  const handleItemEdit = (itemId, raw) => {
    setEdits(prev => {
      const items = { ...prev.items };
      const value = sanitizeCountInput(raw);
      if (value === null) delete items[itemId];
      else items[itemId] = Math.min(value, ITEM_MAX_STACK);
      return { ...prev, items };
    });
  };

  const handleAddItem = (itemId) => {
    const count = Math.max(1, Math.min(sanitizeCountInput(itemAddCount) ?? 1, ITEM_MAX_STACK));
    setEdits(prev => ({ ...prev, items: { ...prev.items, [itemId]: count } }));
    setItemSearch('');
  };

  const handleDownload = () => {
    if (!convertedResult?.data) return;
    const jsonStr = JSON.stringify(convertedResult.data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = convertedResult.suggested_filename || 'converted-save.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${convertedResult.suggested_filename}!`);
  };

  const handleCopyJson = () => {
    if (!convertedResult?.data) return;
    const jsonStr = JSON.stringify(convertedResult.data, null, 2);
    navigator.clipboard.writeText(jsonStr);
    showToast('Converted JSON copied to clipboard!');
  };

  const handleReset = () => {
    setSourceData(null);
    setInspection(null);
    setConvertedResult(null);
    setFileName('');
    setFileSize('');
    setError(null);
    setEdits(EMPTY_SAVE_EDITS);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const getCharName = (id) => charNameById[id] || `Character #${id}`;

  const getItemName = (id) => itemNameById[id] || `Item #${id}`;

  const itemIconUrl = (id) => `/api/assets/item/item_${String(id).padStart(2, '0')}.png`;

  const editsActive = hasSaveEdits(edits);

  const activeAccountSummary = inspection?.accounts?.find(a => a.account_id === selectedAccountId) || inspection?.accounts?.[0];

  // Effective item pouch: the loaded save's held items overlaid with count
  // edits (a zeroed edit removes the item entirely).
  const heldItems = useMemo(() => {
    const map = new Map();
    (activeAccountSummary?.items || []).forEach(it => map.set(it.id, { count: it.count, edited: false }));
    Object.entries(edits.items || {}).forEach(([k, v]) => {
      const id = Number(k);
      if (!Number.isFinite(id) || v === null || v === undefined) return;
      map.set(id, { count: v, edited: true });
    });
    return [...map.entries()]
      .filter(([, it]) => it.count > 0)
      .sort((a, b) => a[0] - b[0])
      .map(([id, it]) => ({ id, count: it.count, edited: it.edited }));
  }, [activeAccountSummary, edits.items]);

  const heldItemIds = useMemo(() => new Set(heldItems.map(it => it.id)), [heldItems]);

  // Add-item picker: search the game catalog by name or id, held items excluded.
  const itemMatches = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q || !gamedataItems) return [];
    const matches = [];
    for (const it of gamedataItems) {
      const id = it?.item_index;
      if (id === undefined || heldItemIds.has(id)) continue;
      const name = (itemNameById[id] || '').toLowerCase();
      if (name.includes(q) || String(id) === q) {
        matches.push(id);
        if (matches.length >= ITEM_PICKER_LIMIT) break;
      }
    }
    return matches;
  }, [gamedataItems, itemSearch, heldItemIds, itemNameById]);

  return (
    <div className="save-converter-container">
      {/* Fullscreen drag overlay when file is dragged anywhere over the window */}
      {isWindowDragging && (
        <div className="drag-fullscreen-overlay">
          <div className="dropzone-icon" style={{ width: '90px', height: '90px', fontSize: '36px' }}>
            <i className="fa-solid fa-file-import"></i>
          </div>
          <h2>Drop Savefile to Convert</h2>
          <p>Supports Project Liminal Gate and ReTB save formats</p>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast-notice">
          <i className="fa-solid fa-circle-check" style={{ color: '#4ade80' }}></i>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hero Header */}
      <div className="save-converter-hero">
        <div className="save-hero-text">
          <h2>
            <i className="fa-solid fa-arrow-right-arrow-left" style={{ color: 'var(--accent-blue)' }}></i>
            Savefile Converter
          </h2>
          <p>
            Drop or select a savegame file to instantly convert between <strong>Project Liminal Gate</strong> (<code>bootstrap-state.json</code>) and <strong>ReTB</strong> (<code>tb-save.json</code>) formats.
          </p>
        </div>
      </div>

      {loading && (
        <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '16px', padding: '16px 20px', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.2rem' }}></i>
          <span>{loadingText || 'Processing save file...'}</span>
        </div>
      )}

      {error && (
        <div className="error-banner" style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '16px', padding: '16px 20px', color: '#f87171', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '1.2rem' }}></i>
          <span>{error}</span>
        </div>
      )}

      {/* Upload Dropzone */}
      <div
        className="save-dropzone"
        onClick={() => fileInputRef.current?.click()}
        style={{ display: sourceData ? 'none' : 'flex' }}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".json,application/json"
          style={{ display: 'none' }}
        />
        <div className="dropzone-icon">
          <i className="fa-solid fa-cloud-arrow-up"></i>
        </div>
        <h3>Drag and drop your savefile here</h3>
        <p>Supports Project Liminal Gate (<code>bootstrap-state*.json</code>) and ReTB (<code>tb-save*.json</code>)</p>
        <button type="button" className="browse-btn" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
          <i className="fa-solid fa-folder-open" style={{ marginRight: '8px' }}></i>
          Browse File
        </button>
      </div>

      {/* Loaded File Overview Banner */}
      {sourceData && inspection && (
        <>
          <div className="save-overview-banner">
            <div className="file-info-badge">
              <i className="fa-solid fa-file-code file-icon"></i>
              <div className="file-details">
                <h3>{fileName || 'Savefile.json'}</h3>
                <div className="file-meta-tags">
                  <span className={`meta-tag ${inspection.format}`}>
                    {inspection.format === 'liminal' ? 'Project Liminal Gate' : 'ReTB Save'}
                  </span>
                  {fileSize && <span className="meta-tag size">{fileSize}</span>}
                  <span className="meta-tag size">{inspection.account_count} {inspection.account_count === 1 ? 'Account' : 'Accounts'}</span>
                  {editsActive && <span className="meta-tag modified">Modified</span>}
                </div>
              </div>
            </div>

            <div className="file-actions">
              {editsActive && (
                <button className="secondary-btn reset-edits-btn" onClick={handleResetEdits} title="Revert all inline edits">
                  <i className="fa-solid fa-eraser"></i>
                  Reset Changes
                </button>
              )}
              <button className="secondary-btn" onClick={handleReset} title="Load another save file">
                <i className="fa-solid fa-arrow-rotate-left"></i>
                Load Another
              </button>
            </div>
          </div>

          {/* Multi-Account Selector if Liminal Gate save has multiple accounts */}
          {inspection.accounts && inspection.accounts.length > 1 && (
            <div className="account-selector-box">
              <h4>
                <i className="fa-solid fa-users"></i>
                Select Account to Convert ({inspection.accounts.length} found)
              </h4>
              <div className="account-cards-grid">
                {inspection.accounts.map(acc => (
                  <button
                    key={acc.account_id}
                    type="button"
                    className={`account-card ${selectedAccountId === acc.account_id ? 'active' : ''}`}
                    onClick={() => handleAccountSelect(acc.account_id)}
                  >
                    <div className="acc-card-head">
                      <span className="acc-card-name">{acc.username}</span>
                      {selectedAccountId === acc.account_id && (
                        <i className="fa-solid fa-circle-check" style={{ color: 'var(--accent-blue)' }}></i>
                      )}
                    </div>
                    <div className="acc-card-id">{acc.account_id.slice(0, 12)}...</div>
                    <div className="acc-card-stats">
                      <span><i className="fa-solid fa-user"></i> {acc.character_count} chars</span>
                      <span><i className="fa-solid fa-coins" style={{ color: 'var(--accent-amber)' }}></i> {acc.coins.toLocaleString()}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Account Summary Stats (name / coins / energy are inline-editable) */}
          {activeAccountSummary && (
            <div className="stats-summary-row">
              <div className="mini-stat-card">
                <div className="mini-stat-icon" style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8' }}>
                  <i className="fa-solid fa-user"></i>
                </div>
                <div className="mini-stat-content">
                  <h5>Player Name</h5>
                  <input
                    className="stat-input"
                    type="text"
                    value={edits.username}
                    placeholder={activeAccountSummary.username || 'Player'}
                    onChange={(e) => handleEditChange('username', e.target.value)}
                    title="Edit player name"
                    maxLength={32}
                  />
                </div>
              </div>

              <div className="mini-stat-card">
                <div className="mini-stat-icon" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8' }}>
                  <i className="fa-solid fa-users"></i>
                </div>
                <div className="mini-stat-content">
                  <h5>Characters</h5>
                  <p>{activeAccountSummary.character_count}</p>
                </div>
              </div>

              <div className="mini-stat-card">
                <div className="mini-stat-icon" style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#f472b6' }}>
                  <i className="fa-solid fa-paw"></i>
                </div>
                <div className="mini-stat-content">
                  <h5>Companions</h5>
                  <p>{activeAccountSummary.buddy_count}</p>
                </div>
              </div>

              <div className="mini-stat-card">
                <div className="mini-stat-icon" style={{ background: 'rgba(74, 222, 128, 0.1)', color: '#4ade80' }}>
                  <i className="fa-solid fa-flask"></i>
                </div>
                <div className="mini-stat-content">
                  <h5>Items Held</h5>
                  <p>{heldItems.length}</p>
                </div>
              </div>

              <div className="mini-stat-card">
                <div className="mini-stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24' }}>
                  <i className="fa-solid fa-coins"></i>
                </div>
                <div className="mini-stat-content">
                  <h5>Coins</h5>
                  <input
                    className="stat-input stat-input-num"
                    type="number"
                    min="0"
                    value={edits.coins ?? ''}
                    placeholder={activeAccountSummary.coins.toLocaleString()}
                    onChange={(e) => handleEditChange('coins', e.target.value)}
                    title="Edit coins"
                  />
                </div>
              </div>

              <div className="mini-stat-card">
                <div className="mini-stat-icon" style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#4ade80' }}>
                  <i className="fa-solid fa-bolt"></i>
                </div>
                <div className="mini-stat-content">
                  <h5>Energy (Free)</h5>
                  <input
                    className="stat-input stat-input-num"
                    type="number"
                    min="0"
                    value={edits.freeEnergy ?? ''}
                    placeholder={String(activeAccountSummary.energy_free)}
                    onChange={(e) => handleEditChange('freeEnergy', e.target.value)}
                    title="Edit free energy"
                  />
                </div>
              </div>

              <div className="mini-stat-card">
                <div className="mini-stat-icon" style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#c084fc' }}>
                  <i className="fa-solid fa-map-location-dot"></i>
                </div>
                <div className="mini-stat-content">
                  <h5>Cleared Quests</h5>
                  <p>{activeAccountSummary.quest_clears}</p>
                </div>
              </div>
            </div>
          )}

          {/* Conversion Control Bar */}
          <div className="conversion-control-bar">
            <div className="conversion-path">
              <span className="format-pill source">
                {inspection.format === 'liminal' ? 'Liminal Gate' : 'ReTB'}
              </span>
              <i className="fa-solid fa-arrow-right swap-direction-icon"></i>
              <span className="format-pill target">
                {targetFormat === 'retb' ? 'ReTB Save (tb-save.json)' : 'Liminal Gate (bootstrap-state.json)'}
              </span>
            </div>

            <div className="conversion-actions">
              <button 
                type="button" 
                className="action-btn"
                onClick={() => handleTargetFormatChange(targetFormat === 'retb' ? 'liminal' : 'retb')}
                title="Toggle target format"
              >
                <i className="fa-solid fa-right-left"></i>
                Swap Target
              </button>

              <button 
                type="button" 
                className="action-btn"
                onClick={() => setShowJsonViewer(prev => !prev)}
                title="View JSON content"
              >
                <i className="fa-solid fa-code"></i>
                {showJsonViewer ? 'Hide JSON' : 'Inspect JSON'}
              </button>

              <button 
                type="button" 
                className="action-btn"
                onClick={handleCopyJson}
                disabled={!convertedResult}
              >
                <i className="fa-regular fa-copy"></i>
                Copy JSON
              </button>

              <button 
                type="button" 
                className="download-btn"
                onClick={handleDownload}
                disabled={!convertedResult}
              >
                <i className="fa-solid fa-download"></i>
                Download Converted Save
              </button>
            </div>
          </div>

          {/* Character Roster Preview (full roster, scrollable) */}
          {activeAccountSummary?.top_characters && activeAccountSummary.top_characters.length > 0 && (
            <div className="roster-preview-card">
              <div className="roster-header">
                <h4>
                  <i className="fa-solid fa-id-card"></i>
                  Character Roster ({activeAccountSummary.top_characters.length}{' '}
                  {activeAccountSummary.top_characters.length === 1 ? 'Character' : 'Characters'})
                </h4>
                {activeAccountSummary.top_characters.length > ROSTER_HINT_THRESHOLD && (
                  <span className="roster-scroll-hint">
                    <i className="fa-solid fa-computer-mouse"></i>
                    Scroll to see all
                  </span>
                )}
              </div>

              <div className="roster-grid">
                {activeAccountSummary.top_characters.map((c, i) => {
                  const charEdit = edits.characters[c.id];
                  const isEdited = Boolean(charEdit);
                  return (
                    <div key={`${c.id}-${i}`} className={`char-badge-card${isEdited ? ' edited' : ''}`}>
                      <div className="char-icon-circle">
                        {c.id}
                      </div>
                      <div className="char-badge-info">
                        <h5>{getCharName(c.id)}</h5>
                        <div className="char-edit-row">
                          <span className="char-job-tag">Job {c.job_id + 1}</span>
                          <label className="char-edit-field">
                            <span>SB</span>
                            <input
                              type="number"
                              min="0"
                              value={charEdit?.sb ?? c.sb}
                              onChange={(e) => handleCharEdit(c.id, 'sb', e.target.value)}
                              title="Skill Boost %"
                            />
                          </label>
                          <label className="char-edit-field">
                            <span>LCK</span>
                            <input
                              type="number"
                              min="0"
                              value={charEdit?.luck ?? c.luck}
                              onChange={(e) => handleCharEdit(c.id, 'luck', e.target.value)}
                              title="Luck"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Item Inventory (counts editable, any game item addable) */}
          <div className="roster-preview-card">
            <div className="roster-header">
              <h4>
                <i className="fa-solid fa-flask"></i>
                Item Inventory ({heldItems.length} {heldItems.length === 1 ? 'Item' : 'Items'} Held)
              </h4>
              <span className="roster-scroll-hint" title={`Stacks are capped at ${ITEM_MAX_STACK}; clearing a count reverts to the loaded save`}>
                <i className="fa-solid fa-pen"></i>
                Edit counts, or search to add items
              </span>
            </div>

            <div className="item-picker">
              <div className="item-picker-controls">
                <div className="item-picker-search">
                  <i className="fa-solid fa-magnifying-glass"></i>
                  <input
                    type="text"
                    value={itemSearch}
                    placeholder="Search an item to add (name or ID)..."
                    onChange={(e) => setItemSearch(e.target.value)}
                  />
                </div>
                <label className="item-picker-count">
                  <span>Qty</span>
                  <input
                    type="number"
                    min="1"
                    max={ITEM_MAX_STACK}
                    value={itemAddCount}
                    onChange={(e) => setItemAddCount(e.target.value)}
                    title="Count given to newly added items"
                  />
                </label>
              </div>

              {itemSearch.trim() !== '' && (
                itemMatches.length > 0 ? (
                  <div className="item-picker-results">
                    {itemMatches.map(id => (
                      <div key={id} className="item-picker-result">
                        <img src={itemIconUrl(id)} alt="" onError={(e) => { e.target.style.visibility = 'hidden'; }} />
                        <span className="item-picker-name">{getItemName(id)}</span>
                        <span className="item-picker-id">ID {id}</span>
                        <button type="button" className="item-add-btn" onClick={() => handleAddItem(id)}>
                          <i className="fa-solid fa-plus"></i>
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="item-picker-empty">No matching item in the game catalog (already held items are listed below).</p>
                )
              )}
            </div>

            {heldItems.length === 0 ? (
              <p className="item-empty-note">
                The pouch is empty — search above to add an item.
              </p>
            ) : (
              <div className="roster-grid">
                {heldItems.map(({ id, count, edited }) => (
                  <div key={id} className={`char-badge-card${edited ? ' edited' : ''}`}>
                    <img
                      className="item-thumb"
                      src={itemIconUrl(id)}
                      alt=""
                      loading="lazy"
                      onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }}
                    />
                    <div className="item-thumb-fallback">
                      <i className="fa-solid fa-gem"></i>
                    </div>
                    <div className="char-badge-info">
                      <h5>{getItemName(id)}</h5>
                      <div className="char-edit-row">
                        <span className="char-job-tag">Item {id}</span>
                        <label className="char-edit-field">
                          <span>Qty</span>
                          <input
                            type="number"
                            min="0"
                            max={ITEM_MAX_STACK}
                            value={edits.items[id] ?? count}
                            onChange={(e) => handleItemEdit(id, e.target.value)}
                            title={`Count 0–${ITEM_MAX_STACK}; 0 removes the item, clearing the field reverts`}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* JSON Viewer */}
          {showJsonViewer && convertedResult?.data && (
            <div className="json-viewer-card">
              <div className="json-viewer-head">
                <h4>
                  <i className="fa-solid fa-file-lines"></i>
                  Converted Output Preview ({convertedResult.suggested_filename})
                </h4>
                <button className="secondary-btn" onClick={handleCopyJson}>
                  <i className="fa-regular fa-copy"></i> Copy
                </button>
              </div>
              <pre className="json-pre-block">
                {JSON.stringify(convertedResult.data, null, 2)}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
