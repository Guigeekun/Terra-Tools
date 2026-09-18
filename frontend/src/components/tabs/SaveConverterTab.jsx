import { useState, useRef, useEffect, useMemo } from 'react';
import { useGameData } from '../../contexts/GameDataContext';
import { loc } from '../../utils/localization';
import { detectSaveFormat, inspectSaveData, convertSaveData } from '../../utils/saveConverter';
import { inspectSave, convertSave } from '../../api';

// Characters visible in the roster box (roughly) before the "scroll to see all" hint shows.
const ROSTER_HINT_THRESHOLD = 12;

export default function SaveConverterTab() {
  const { data: gameData, lang, loadCategory } = useGameData();
  const gamedataCharacters = gameData?.characters || null;

  // Character names come from the game database; load the catalog lazily and
  // cache it in the shared context so the Characters tab reuses it.
  useEffect(() => {
    if (!gamedataCharacters) loadCategory('characters');
  }, [gamedataCharacters, loadCategory]);

  const charNameById = useMemo(() => {
    const map = {};
    (gamedataCharacters || []).forEach(c => {
      if (c && c.ID !== undefined) map[c.ID] = loc(c.NameString, lang, `Character #${c.ID}`);
    });
    return map;
  }, [gamedataCharacters, lang]);

  const [sourceData, setSourceData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [inspection, setInspection] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [targetFormat, setTargetFormat] = useState('retb');
  const [convertedResult, setConvertedResult] = useState(null);
  const [isWindowDragging, setIsWindowDragging] = useState(false);
  const [showJsonViewer, setShowJsonViewer] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [error, setError] = useState(null);

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
      
      const defaultTarget = inspectRes.format === 'liminal' ? 'retb' : 'liminal';
      setTargetFormat(defaultTarget);

      setLoadingText('Converting savefile...');
      await doConvert(jsonObj, defaultTarget, inspectRes.active_account_id);
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
    if (sourceData) {
      doConvert(sourceData, newTarget, selectedAccountId);
    }
  };

  const handleAccountSelect = (accId) => {
    setSelectedAccountId(accId);
    if (sourceData) {
      doConvert(sourceData, targetFormat, accId);
    }
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const getCharName = (id) => charNameById[id] || `Character #${id}`;

  const activeAccountSummary = inspection?.accounts?.find(a => a.account_id === selectedAccountId) || inspection?.accounts?.[0];

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
                </div>
              </div>
            </div>

            <div className="file-actions">
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

          {/* Account Summary Stats */}
          {activeAccountSummary && (
            <div className="stats-summary-row">
              <div className="mini-stat-card">
                <div className="mini-stat-icon" style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8' }}>
                  <i className="fa-solid fa-user"></i>
                </div>
                <div className="mini-stat-content">
                  <h5>Player Name</h5>
                  <p>{activeAccountSummary.username || 'Player'}</p>
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
                <div className="mini-stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24' }}>
                  <i className="fa-solid fa-coins"></i>
                </div>
                <div className="mini-stat-content">
                  <h5>Coins</h5>
                  <p>{activeAccountSummary.coins.toLocaleString()}</p>
                </div>
              </div>

              <div className="mini-stat-card">
                <div className="mini-stat-icon" style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#4ade80' }}>
                  <i className="fa-solid fa-bolt"></i>
                </div>
                <div className="mini-stat-content">
                  <h5>Energy</h5>
                  <p>{activeAccountSummary.energy_free} Free</p>
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
                {activeAccountSummary.top_characters.map((c, i) => (
                  <div key={`${c.id}-${i}`} className="char-badge-card">
                    <div className="char-icon-circle">
                      {c.id}
                    </div>
                    <div className="char-badge-info">
                      <h5>{getCharName(c.id)}</h5>
                      <p>
                        <span>Job {c.job_id + 1}</span> • <span>SB: {c.sb}%</span> • <span>Luck: {c.luck}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
