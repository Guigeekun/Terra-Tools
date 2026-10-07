import { useState, useEffect, useMemo, useRef } from 'react';
import { useGameData } from '../../contexts/GameDataContext';
import { usePersistentState } from '../../hooks/usePersistentState';
import { loc } from '../../utils/localization';
import {
  rarityLabels, speciesTranslations, weaponMeta, skillAttribMeta, elementMeta,
  skillKindLabels, SKILL_EMIT_CONDITIONS,
} from '../../utils/constants';
import {
  emptyDraft, isCurrentDraft, newSkill, newJob, newCharacter, newBuddy,
  nextFreeIds, buildModSpec, validateDraft,
  buildImagesRecipe, buildServerBuddies, draftFromSpec,
  LANGS, JOB_STATS, BUDDY_STATS,
} from '../../utils/modSpec';

const TERRAMOD_URL = 'https://github.com/iaydios/TerraMod';

// Editable SkillType fields, in display order. Values start at the template's
// (greyed in the input); touching one writes it into the spec's `set` diff.
// Titles are player-facing hover help — assume game knowledge, not internals.
const SKILL_SET_FIELDS = [
  { key: 'condition', label: 'Trigger position', type: 'select', options: 'conditions',
    title: 'When/where the skill can activate. "Any position" fires anywhere in a pincer; "Pincer Initiator only" fires only when this unit starts the pincer; the counter variants respond to this unit being pincered.' },
  { key: 'kind', label: 'Kind', type: 'select', options: 'kinds',
    title: 'What the skill does mechanically: Attack, Heal, Counter, Status Attack, and so on. Kind 20 (Hop Break) is a tap skill the player triggers manually.' },
  { key: 'emitRatio', label: 'Activation', type: 'int',
    title: 'Chance to activate, in %. Tap skills (kind 20) instead use this as their number of charges per battle.' },
  { key: 'power', label: 'Power', type: 'float', step: 0.1,
    title: 'Damage multiplier. 1.0 = a normal pincer hit, 2.0 = double damage.' },
  { key: 'spower', label: 'Status power', type: 'float', step: 0.1,
    title: 'Potency of an inflicted status effect (used by status skills). Copy the template value unless you know the scale.' },
  { key: 'attrib', label: 'Element', type: 'select', options: 'skillAttribs',
    title: 'Element of the skill\'s damage or healing — drives elemental weaknesses/resistances.' },
  { key: 'weap', label: 'Weapon', type: 'select', options: 'weapons',
    title: 'Weapon type associated with the skill (sword, spear, bow, staff).' },
  { key: 'range', label: 'Reach', type: 'int',
    title: 'How many tiles away the skill can reach.' },
  { key: 'sx', label: 'Area X', type: 'int',
    title: 'Width of the area the skill covers around its target.' },
  { key: 'sy', label: 'Area Y', type: 'int',
    title: 'Height of the area the skill covers around its target.' },
  { key: 'status', label: 'Status effect', type: 'int',
    title: 'Which status effect to inflict (paralysis, sleep, poison…). Easiest: copy the value from a similar existing skill.' },
  { key: 'successRate', label: 'Success %', type: 'int',
    title: 'Chance that the status/effect lands. The special value 4242 enables the random_power native patch (synced random damage) instead.' },
  { key: 'life', label: 'Turns', type: 'int',
    title: 'How long the effect lasts, in turns.' },
  { key: 'effID', label: 'Effect ID', type: 'int',
    title: 'Which visual effect plays when the skill fires (from the game\'s EffectSet). Keep the template\'s value unless you know the IDs.' },
  { key: 'blowOff', label: 'Knock-back', type: 'int',
    title: 'How many tiles the target is pushed away.' },
];

// Editable job fields (everything else lands in the raw JSON escape hatch).
const JOB_FIELD_EDITORS = [
  { key: 'Species', label: 'Species', type: 'select', options: 'species',
    title: 'Playable species: Human, Lizardfolk, Beastfolk or Stonefolk. Some skills and companions care about it.' },
  { key: 'Gender', label: 'Gender', type: 'int',
    title: '0 or 1. Gender-specific skills check this value — keep the template\'s unless you mean to change it.' },
  { key: 'Attrib', label: 'Element', type: 'select', options: 'elements',
    title: 'The unit\'s own element, shown on the character and used by elemental interactions.' },
  { key: 'SkillAttrib', label: 'Skill element', type: 'select', options: 'skillAttribs',
    title: 'Default element of the job\'s skills.' },
  { key: 'RANGE', label: 'Move range', type: 'int',
    title: 'How many tiles the unit can move per turn on the battle board.' },
  { key: 'HPcoeff', label: 'HP curve', type: 'float', step: 0.1,
    title: 'How fast HP grows with level: 1.0 is the standard curve, higher values ramp up more at high levels.' },
  { key: 'ATKcoeff', label: 'ATK curve', type: 'float', step: 0.1,
    title: 'How fast ATK grows with level: 1.0 is the standard curve, higher values ramp up more at high levels.' },
  { key: 'DEFcoeff', label: 'DEF curve', type: 'float', step: 0.1,
    title: 'How fast DEF grows with level: 1.0 is the standard curve, higher values ramp up more at high levels.' },
  { key: 'SATKcoeff', label: 'SATK curve', type: 'float', step: 0.1,
    title: 'How fast SATK (magic attack) grows with level.' },
  { key: 'SDEFcoeff', label: 'SDEF curve', type: 'float', step: 0.1,
    title: 'How fast SDEF (magic defense) grows with level.' },
  { key: 'EXPcoeff', label: 'EXP curve', type: 'float', step: 0.1,
    title: 'Shape of the EXP curve — higher means steeper growth requirements late. Λ recodes use about 2.1.' },
  { key: 'EXPmax', label: 'EXP to Lv99', type: 'int',
    title: 'Total EXP needed from level 1 to the cap. Λ recodes typically use 9,000,000.' },
];

// Dropdown option tables (built once).
const conditionOptions = Object.entries(SKILL_EMIT_CONDITIONS)
  .map(([v, m]) => ({ value: Number(v), label: `${v} · ${m.label}`, title: m.title }));
const kindOptions = Object.entries(skillKindLabels)
  .map(([v, label]) => ({ value: Number(v), label: `${v} · ${label}` }));
const skillAttribOptions = Object.entries(skillAttribMeta)
  .map(([v, m]) => ({ value: Number(v), label: `${v} · ${m.name}` }));
const weaponOptions = Object.entries(weaponMeta)
  .map(([v, m]) => ({ value: Number(v), label: `${v} · ${m.name}` }));
const speciesOptions = Object.entries(speciesTranslations)
  .filter(([v]) => Number(v) <= 3)
  .map(([v, m]) => ({ value: Number(v), label: `${v} · ${m.en}` }));
const elementOptions = [0, 1, 2, 3, 4]
  .map(v => ({ value: v, label: `${v} · ${elementMeta[v]?.name || v}` }));

const OPTION_TABLES = {
  conditions: conditionOptions, kinds: kindOptions, skillAttribs: skillAttribOptions,
  weapons: weaponOptions, species: speciesOptions, elements: elementOptions,
};

// Load an image URL and report its intrinsic size (null when unavailable).
function probeImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const gameAssetUrl = (path) => (path ? `/api/assets/image?path=${encodeURIComponent(path)}` : null);

// Image filenames on disk carry an md5 prefix (<md5>img_2124.png), so an
// arbitrary image ID can't be turned into a URL client-side — the backend
// resolves IDs against its extracted-asset index. Null = no such art.
async function resolveAsset(category, imageId, prefix) {
  if (!imageId) return null;
  try {
    const res = await fetch(`/api/assets/resolve?category=${category}&image_id=${imageId}&prefix=${prefix}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.path || null;
  } catch {
    return null;
  }
}

export default function ModStudioTab() {
  const { data: gameData, lang, loadCategory } = useGameData();
  const catalogCharacters = gameData?.characters || null;
  const catalogItems = gameData?.items || null;
  const catalogBuddies = gameData?.buddies || null;
  // The full raw skill array is fetched once on app mount.
  const catalogSkills = gameData?.skills || null;

  useEffect(() => { if (!catalogCharacters) loadCategory('characters'); }, [catalogCharacters, loadCategory]);
  useEffect(() => { if (!catalogItems) loadCategory('items'); }, [catalogItems, loadCategory]);
  useEffect(() => { if (!catalogBuddies) loadCategory('buddies'); }, [catalogBuddies, loadCategory]);

  // Draft autosaves to localStorage; a stale shape (older version) resets.
  // The updater runs lazily inside the state setter so async two-step edits
  // (e.g. add character, then fill image dimensions) never clobber each other.
  const [storedDraft, setStoredDraft] = usePersistentState('modstudio.draft', null);
  const draft = isCurrentDraft(storedDraft) ? storedDraft : emptyDraft();
  const setDraft = (updater) => setStoredDraft(prev => {
    const base = isCurrentDraft(prev) ? prev : emptyDraft();
    return typeof updater === 'function' ? updater(base) : updater;
  });

  const catalogs = useMemo(() => ({
    characters: catalogCharacters || [],
    items: catalogItems || [],
    buddies: catalogBuddies || [],
    skills: catalogSkills || [],
  }), [catalogCharacters, catalogItems, catalogBuddies, catalogSkills]);

  const spec = useMemo(() => buildModSpec(draft, catalogs), [draft, catalogs]);
  const issues = useMemo(() => validateDraft(draft, catalogs), [draft, catalogs]);
  const errors = issues.filter(i => i.level === 'error');
  const warnings = issues.filter(i => i.level === 'warning');
  const imagesRecipe = useMemo(() => buildImagesRecipe(draft), [draft]);
  const serverBuddies = useMemo(() => buildServerBuddies(draft), [draft]);

  const nextIds = useMemo(() => nextFreeIds(catalogs.characters, catalogs.buddies), [catalogs]);
  const nextSkillId = catalogs.skills.length + 1;

  const [openSections, setOpenSections] = useState(
    { skills: true, characters: true, buddies: false, images: false, advanced: false, preview: false });
  const toggleSection = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const [toast, setToast] = useState(null);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3500); };
  const [importError, setImportError] = useState(null);
  const importInputRef = useRef(null);

  // ------------------------------------------------------------- name lookups
  const charName = (id) => {
    const c = catalogs.characters.find(x => x?.ID === id);
    return c ? loc(c.NameString, lang, `Character #${id}`) : null;
  };
  const skillById = (id) => (id >= 1 && id <= catalogs.skills.length) ? catalogs.skills[id - 1] : null;
  const skillName = (id) => {
    const s = skillById(id);
    return s ? loc(s.nameString, lang, `Skill #${id}`) : null;
  };
  const buddyById = (id) => catalogs.buddies.find(b => b?.ID === id);
  const buddyName = (id) => {
    const b = buddyById(id);
    return b ? loc(b.NameString, lang, `Companion #${id}`) : null;
  };
  const itemById = (id) => catalogs.items.find(i => i?.item_index === id);
  const itemName = (id) => {
    const it = itemById(id);
    return it ? loc(it.NameString, lang, `Item #${id}`) : null;
  };
  const jobById = (id) => {
    for (const c of catalogs.characters) {
      const j = (c?.JobsInfo || []).find(j => j?.ID === id);
      if (j) return j;
    }
    return null;
  };

  // ------------------------------------------------------------- draft edits
  const updateSkill = (uid, patch) => setDraft(d => ({
    ...d, skills: d.skills.map(s => (s._uid === uid ? { ...s, ...patch } : s)),
  }));
  const updateCharacter = (uid, patch) => setDraft(d => ({
    ...d, characters: d.characters.map(c => (c._uid === uid ? { ...c, ...patch } : c)),
  }));
  const updateJob = (chrUid, jobUid, patch) => setDraft(d => ({
    ...d,
    characters: d.characters.map(c => (c._uid !== chrUid ? c : {
      ...c, jobs: c.jobs.map(j => (j._uid === jobUid ? { ...j, ...patch } : j)),
    })),
  }));
  const updateBuddy = (uid, patch) => setDraft(d => ({
    ...d, buddies: d.buddies.map(b => (b._uid === uid ? { ...b, ...patch } : b)),
  }));

  const addSkillFromTemplate = (templateSkillId) => {
    const sk = newSkill(templateSkillId);
    const t = skillById(templateSkillId);
    sk.key = `skill_${templateSkillId}`;
    if (t?.nameString?.en) sk.name = { en: t.nameString.en };
    setDraft(d => ({ ...d, skills: [...d.skills, sk] }));
  };

  const addCharacterFromTemplate = async (templateChrId) => {
    const tpl = catalogs.characters.find(c => c?.ID === templateChrId);
    const tplJobs = tpl?.JobsInfo || [];
    const c = newCharacter(templateChrId, tpl, tplJobs);
    c.chrId = nextIds.chrId;
    setDraft(d => {
      let chrId = c.chrId;
      while (d.characters.some(x => x.chrId === chrId)) chrId += 1;
      return { ...d, characters: [...d.characters, { ...c, chrId }] };
    });

    // Prefill art dimensions from the template's piece and illustration.
    for (const job of c.jobs) {
      const tplJob = jobById(job.templateJobId);
      if (!tplJob) continue;
      const [piece, illust] = await Promise.all([
        probeImage(gameAssetUrl(tplJob.piece_file)),
        probeImage(gameAssetUrl(tplJob.illust_file)),
      ]);
      const imageDims = {};
      if (piece) imageDims.piece = piece;
      if (illust) imageDims.illust = illust;
      updateJob(c._uid, job._uid, { imageDims, templateImageId: tplJob.ImageID || null });
    }
  };

  const addBuddyFromTemplate = async (templateBuddyId) => {
    const tpl = buddyById(templateBuddyId);
    const b = newBuddy(templateBuddyId, tpl);
    b.buddyId = nextIds.buddyId;
    b.sortId = nextIds.sortId;
    setDraft(d => {
      let buddyId = b.buddyId;
      while (d.buddies.some(x => x.buddyId === buddyId)) buddyId += 1;
      return { ...d, buddies: [...d.buddies, { ...b, buddyId }] };
    });
    const [large, thumb] = await Promise.all([
      probeImage(gameAssetUrl(tpl?.image_file)),
      probeImage(gameAssetUrl(tpl?.thumb_file)),
    ]);
    const imageDims = {};
    if (large) {
      imageDims.large = large;
      imageDims.small = { ...large };
    }
    if (thumb) imageDims.thumb = thumb;
    updateBuddy(b._uid, { imageDims });
  };

  // Probing a candidate image ID resolves it against the backend's asset
  // index: taken = art already exists for it (collision), and the resolved
  // paths feed the live preview. The write is guarded on the ID still being
  // current — probes resolve out of order while typing.
  const probeJobImageId = async (chrUid, jobUid, imageId) => {
    if (!imageId) {
      setDraft(d => ({
        ...d,
        characters: d.characters.map(c => (c._uid !== chrUid ? c : {
          ...c,
          jobs: c.jobs.map(j => (j._uid === jobUid && !j.imageId)
            ? { ...j, imageTaken: false, imageFiles: null }
            : j),
        })),
      }));
      return;
    }
    const [piece, illust] = await Promise.all([
      resolveAsset('Pieces', imageId, 'img'),
      resolveAsset('Illust', imageId, 'illust'),
    ]);
    const [pieceDims, illustDims] = await Promise.all([
      piece ? probeImage(gameAssetUrl(piece)) : null,
      illust ? probeImage(gameAssetUrl(illust)) : null,
    ]);
    setDraft(d => ({
      ...d,
      characters: d.characters.map(c => (c._uid !== chrUid ? c : {
        ...c,
        jobs: c.jobs.map(j => {
          if (j._uid !== jobUid || j.imageId !== imageId) return j;
          const imageDims = { ...j.imageDims };
          if (!imageDims.piece && pieceDims) imageDims.piece = pieceDims;
          if (!imageDims.illust && illustDims) imageDims.illust = illustDims;
          return { ...j, imageTaken: Boolean(piece), imageFiles: { piece, illust }, imageDims };
        }),
      })),
    }));
  };
  const probeBuddyImageId = async (uid, imageId) => {
    if (!imageId) {
      setDraft(d => ({
        ...d,
        buddies: d.buddies.map(b => (b._uid === uid && !b.imageId
          ? { ...b, imageTaken: false }
          : b)),
      }));
      return;
    }
    const thumb = await resolveAsset('BuddyThumbs', imageId, 'img');
    const thumbDims = thumb ? await probeImage(gameAssetUrl(thumb)) : null;
    setDraft(d => ({
      ...d,
      buddies: d.buddies.map(b => {
        if (b._uid !== uid || b.imageId !== imageId) return b;
        const imageDims = { ...b.imageDims };
        if (!imageDims.thumb && thumbDims) imageDims.thumb = thumbDims;
        return { ...b, imageTaken: Boolean(thumb), imageDims };
      }),
    }));
  };

  const handleImportFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        const imported = draftFromSpec(parsed);
        imported.fileName = (file.name || '').replace(/\.json$/i, '') || draft.fileName;
        setDraft(imported);
        setImportError(null);
        showToast(`Imported ${file.name}`);
      } catch (err) {
        setImportError(`Could not import "${file.name}": ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleNew = () => {
    if (draft.skills.length || draft.characters.length || draft.buddies.length) {
      if (!window.confirm('Start a new mod? The current draft will be replaced.')) return;
    }
    setDraft(emptyDraft());
    showToast('New mod started');
  };

  // ------------------------------------------------------------- downloads
  const downloadJson = (obj, baseName) => {
    const text = JSON.stringify(obj, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = baseName.endsWith('.json') ? baseName : `${baseName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const specFileName = `${(draft.fileName || 'mod').trim() || 'mod'}.json`;
  const handleDownloadSpec = () => {
    if (errors.length) {
      showToast(`Fix ${errors.length} error${errors.length > 1 ? 's' : ''} before downloading`);
      return;
    }
    downloadJson(spec, specFileName);
    showToast(`Downloaded ${specFileName} — drop it into TerraMod's mods/ folder`);
  };
  const handleCopySpec = () => {
    navigator.clipboard.writeText(JSON.stringify(spec, null, 2));
    showToast('Mod JSON copied to clipboard');
  };

  const hasEntities = draft.skills.length || draft.characters.length || draft.buddies.length;

  return (
    <div className="mod-studio-container">
      <datalist id="modskillkeys">
        {draft.skills.map(s => <option key={s._uid} value={s.key} />)}
      </datalist>
      {toast && (
        <div className="toast-notice">
          <i className="fa-solid fa-circle-check" style={{ color: '#4ade80' }}></i>
          <span>{toast}</span>
        </div>
      )}

      {/* Hero */}
      <div className="save-converter-hero">
        <div className="save-hero-text">
          <h2>
            <i className="fa-solid fa-puzzle-piece" style={{ color: 'var(--accent-blue)' }}></i>
            Mod Studio
          </h2>
          <p>
            Author a <a href={TERRAMOD_URL} target="_blank" rel="noreferrer">TerraMod</a> mod file:
            clone characters, DNA recodes, skills and companions from the game data, then download the
            JSON spec and build it with TerraMod. Nothing is installed server-side — the mod file is yours.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mod-toolbar">
        <label className="mod-file-name">
          <span>File name</span>
          <input
            type="text"
            value={draft.fileName}
            onChange={e => setDraft(d => ({ ...d, fileName: e.target.value }))}
            placeholder="10_my_mod"
            title="TerraMod applies mods/*.json in file-name order — a number prefix keeps the order predictable"
          />
        </label>
        <div className="mod-toolbar-actions">
          <button type="button" className="secondary-btn" onClick={handleNew} title="Start over">
            <i className="fa-solid fa-file"></i> New
          </button>
          <button type="button" className="secondary-btn" onClick={() => importInputRef.current?.click()}>
            <i className="fa-solid fa-file-import"></i> Import
          </button>
          <input
            type="file" ref={importInputRef} style={{ display: 'none' }} accept=".json,application/json"
            onChange={e => { handleImportFile(e.target.files?.[0]); e.target.value = ''; }}
          />
          <button type="button" className="secondary-btn" onClick={handleCopySpec} disabled={!hasEntities}>
            <i className="fa-regular fa-copy"></i> Copy JSON
          </button>
          <button
            type="button"
            className="download-btn"
            onClick={handleDownloadSpec}
            disabled={!hasEntities || errors.length > 0}
            title={errors.length
              ? `Fix the ${errors.length} error${errors.length > 1 ? 's' : ''} listed above to enable the download`
              : undefined}
          >
            <i className={`fa-solid ${errors.length ? 'fa-triangle-exclamation' : 'fa-download'}`}></i>
            {errors.length
              ? `Fix ${errors.length} error${errors.length > 1 ? 's' : ''} to download`
              : `Download ${specFileName}`}
          </button>
        </div>
      </div>

      {importError && (
        <div className="error-banner" style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '16px', padding: '16px 20px', color: '#f87171', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '1.2rem' }}></i>
          <span>{importError}</span>
        </div>
      )}

      {/* Validation summary */}
      {hasEntities && (
        <div className={`mod-validation ${errors.length ? 'has-errors' : warnings.length ? 'has-warnings' : 'is-ok'}`}>
          {errors.length === 0 ? (
            <span className="mod-validation-title">
              <i className="fa-solid fa-circle-check"></i>
              {warnings.length ? ` Ready — ${warnings.length} optional warning${warnings.length > 1 ? 's' : ''}` : ' Ready to download'}
            </span>
          ) : (
            <span className="mod-validation-title">
              <i className="fa-solid fa-triangle-exclamation"></i>
              {errors.length} error{errors.length > 1 ? 's' : ''} blocking the download
            </span>
          )}
          <ul className="mod-validation-list">
            {errors.map((i, n) => (
              <li key={`e${n}`} className="mod-issue error">
                <strong>{i.section}</strong> — {i.message}
              </li>
            ))}
            {warnings.map((i, n) => (
              <li key={`w${n}`} className="mod-issue warning">
                <strong>{i.section}</strong> — {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <SkillNameNote nextSkillId={nextSkillId} />

      {/* ---------------------------------------------------- Skills */}
      <Section
        icon="fa-wand-magic-sparkles" title="Skills" accent="#818cf8"
        count={draft.skills.length} open={openSections.skills} onToggle={() => toggleSection('skills')}
      >
        <SkillPicker skills={catalogs.skills} lang={lang} onPick={addSkillFromTemplate} />
        {draft.skills.length === 0 && (
          <p className="item-empty-note">No new skills — search above to clone one as a starting point.</p>
        )}
        {draft.skills.map(sk => (
          <SkillEditor
            key={sk._uid} skill={sk} template={skillById(sk.templateSkillId)} lang={lang}
            onChange={patch => updateSkill(sk._uid, patch)}
            onEnableNative={name => setDraft(d => (
              d.native.includes(name) ? d : { ...d, native: [...d.native, name] }
            ))}
            onRemove={() => setDraft(d => ({ ...d, skills: d.skills.filter(s => s._uid !== sk._uid) }))}
          />
        ))}
      </Section>

      {/* ---------------------------------------------------- Characters */}
      <Section
        icon="fa-users" title="Characters" accent="#38bdf8"
        count={draft.characters.length} open={openSections.characters} onToggle={() => toggleSection('characters')}
      >
        <CharacterPicker
          characters={catalogs.characters} lang={lang}
          takenIds={draft.characters.map(c => c.templateChrId)}
          onPick={addCharacterFromTemplate}
        />
        {draft.characters.length === 0 && (
          <p className="item-empty-note">No characters yet — search above and pick a character to clone.</p>
        )}
        {draft.characters.map(c => (
          <CharacterEditor
            key={c._uid} character={c} catalogs={catalogs} lang={lang} nextIds={nextIds}
            charName={charName} skillName={skillName} itemName={itemName}
            jobById={jobById}
            onChangeCharacter={patch => updateCharacter(c._uid, patch)}
            onChangeJob={(jobUid, patch) => updateJob(c._uid, jobUid, patch)}
            onProbeJobImage={(jobUid, imageId) => probeJobImageId(c._uid, jobUid, imageId)}
            onRemove={() => setDraft(d => ({ ...d, characters: d.characters.filter(x => x._uid !== c._uid) }))}
          />
        ))}
      </Section>

      {/* ---------------------------------------------------- Companions */}
      <Section
        icon="fa-paw" title="Companions" accent="#34d399"
        count={draft.buddies.length} open={openSections.buddies} onToggle={() => toggleSection('buddies')}
      >
        <BuddyPicker
          buddies={catalogs.buddies} lang={lang}
          onPick={addBuddyFromTemplate}
        />
        {draft.buddies.length === 0 && (
          <p className="item-empty-note">No companions — search above to clone one as a starting point.</p>
        )}
        {draft.buddies.map(b => (
          <BuddyEditor
            key={b._uid} buddy={b} catalogs={catalogs} lang={lang} nextIds={nextIds}
            charName={charName} buddyName={buddyName} skillName={skillName}
            onChange={patch => updateBuddy(b._uid, patch)}
            onProbeImage={imageId => probeBuddyImageId(b._uid, imageId)}
            onRemove={() => setDraft(d => ({ ...d, buddies: d.buddies.filter(x => x._uid !== b._uid) }))}
          />
        ))}
      </Section>

      {/* ---------------------------------------------------- Images */}
      <Section
        icon="fa-images" title="Images" accent="#fbbf24"
        count={imagesRecipe.length} open={openSections.images} onToggle={() => toggleSection('images')}
      >
        <p className="mod-section-hint">
          Every new image ID needs art files — TerraMod builds them into the game's downloadable
          format from your PNG/JPEGs. Dimensions below are prefilled from the template art.
        </p>
        <ImagesTable draft={draft}
          onChangeJob={(chrUid, jobUid, patch) => updateJob(chrUid, jobUid, patch)}
          onChangeBuddy={(uid, patch) => updateBuddy(uid, patch)} />
        {imagesRecipe.length > 0 && (
          <div className="mod-download-row">
            <button type="button" className="secondary-btn"
              onClick={() => { downloadJson(imagesRecipe, 'images.json'); showToast('Downloaded images.json'); }}>
              <i className="fa-solid fa-download"></i> Download images.json
            </button>
            <span className="mod-download-hint">Feeds <code>make_images.py</code> — put your art under <code>art/</code> using the listed file names.</span>
          </div>
        )}
      </Section>

      {/* ---------------------------------------------------- Advanced */}
      <Section
        icon="fa-flask" title="Advanced" accent="#f87171"
        count={draft.native.length ? draft.native.length : ''}
        open={openSections.advanced} onToggle={() => toggleSection('advanced')}
      >
        <div className="mod-native-row">
          <label className="mod-checkbox" title="SkillType.successRate == 4242 triggers a synced random damage multiplier (game's own RNG, battles stay deterministic)">
            <input type="checkbox"
              checked={draft.native.includes('random_power')}
              onChange={e => setDraft(d => ({
                ...d,
                native: e.target.checked ? [...d.native, 'random_power'] : d.native.filter(n => n !== 'random_power'),
              }))} />
            <span><code>random_power</code> native patch</span>
          </label>
          <label className="mod-checkbox" title="Skills with range 10 and sx >= 7 also cover the full row and column">
            <input type="checkbox"
              checked={draft.native.includes('star_range')}
              onChange={e => setDraft(d => ({
                ...d,
                native: e.target.checked ? [...d.native, 'star_range'] : d.native.filter(n => n !== 'star_range'),
              }))} />
            <span><code>star_range</code> native patch</span>
          </label>
        </div>
        <label className="mod-assetver">
          <span>Image cache version</span>
          <input type="number" min="1" value={draft.assetVer}
            onChange={e => setDraft(d => ({ ...d, assetVer: Number(e.target.value) || 1 }))}
            title="Written into the asset index; only matters when re-shipping an image players may have cached" />
        </label>
        {serverBuddies.length > 0 && (
          <div className="mod-download-row">
            <button type="button" className="secondary-btn"
              onClick={() => { downloadJson(serverBuddies, 'buddies.json'); showToast('Downloaded buddies.json'); }}>
              <i className="fa-solid fa-download"></i> Download server buddies.json
            </button>
            <span className="mod-download-hint">
              Feeds <code>host_mod.py --buddies</code> — draw pools, unique companions and the guaranteed coin draw.
            </span>
          </div>
        )}
      </Section>

      {/* ---------------------------------------------------- Preview */}
      <Section
        icon="fa-code" title="Mod file preview" accent="#94a3b8"
        open={openSections.preview} onToggle={() => toggleSection('preview')}
      >
        <div className="json-viewer-card">
          <pre className="json-pre-block">{JSON.stringify(spec, null, 2)}</pre>
        </div>
        <div className="mod-help-box">
          <h4><i className="fa-solid fa-circle-info"></i> How to build this mod</h4>
          <ol>
            <li>Put your art under TerraMod's <code>art/</code> with the file names from <code>images.json</code>.</li>
            <li>Drop <code>{specFileName}</code> into TerraMod's <code>mods/</code> folder{serverBuddies.length > 0 ? ', and the downloaded buddies rules into server/buddies.json' : ''}.</li>
            <li>Run <code>sh build_all.sh</code> from the TerraMod folder (see its README for inputs and first-time setup).</li>
          </ol>
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- small pieces

function Section({ icon, title, accent, count, open, onToggle, children }) {
  return (
    <div className={`mod-section${open ? ' open' : ''}`}>
      <button type="button" className="mod-section-head" onClick={onToggle}>
        <span className="mod-section-icon" style={{ background: `${accent}1a`, color: accent }}>
          <i className={`fa-solid ${icon}`}></i>
        </span>
        <h3>{title}</h3>
        {count !== '' && count !== 0 && <span className="mod-section-count">{count}</span>}
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} mod-section-chev`}></i>
      </button>
      {open && <div className="mod-section-body">{children}</div>}
    </div>
  );
}

// A reusable searchable picker over catalog entries. Rows: [{id, label, meta, taken}].
function Picker({ search, setSearch, rows, onPick, placeholder, emptyText }) {
  return (
    <div className="item-picker mod-picker">
      <div className="item-picker-controls">
        <div className="item-picker-search">
          <i className="fa-solid fa-magnifying-glass"></i>
          <input
            type="text"
            value={search}
            placeholder={placeholder}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>
      {search.trim() !== '' && (
        rows.length ? (
          <div className="item-picker-results">
            {rows.map(r => (
              <div key={r.id} className={`item-picker-result${r.taken ? ' owned' : ''}`}>
                <span className="item-picker-name">{r.label}</span>
                <span className="item-picker-id">{r.meta}</span>
                {r.taken ? (
                  <span className="char-owned-tag" title="Already cloned into this mod">
                    <i className="fa-solid fa-check"></i> Cloned
                  </span>
                ) : (
                  <button
                    type="button"
                    className="item-add-btn"
                    onClick={() => {
                      onPick(r.id);
                      // One pick per query: close the results until the user
                      // edits the search again.
                      setSearch('');
                    }}
                  >
                    <i className="fa-solid fa-plus"></i> Add
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="item-picker-empty">{emptyText}</p>
        )
      )}
    </div>
  );
}

// Rank: exact name first, then prefix matches, then substring hits.
const rankMatch = (name, q) => (name === q ? 0 : name.startsWith(q) ? 1 : 2);
const PICKER_LIMIT = 50;

function SkillPicker({ skills, lang, onPick }) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!q) return [];
    const out = [];
    for (let i = 0; i < skills.length; i++) {
      const s = skills[i];
      if (!s) continue;
      const name = loc(s.nameString, lang, '').toLowerCase();
      const id = i + 1;
      if (name.includes(q) || String(id) === q) {
        out.push({
          id,
          label: loc(s.nameString, lang, `Skill #${id}`),
          meta: `ID ${id} · ${skillKindLabels[s.kind] ?? 'Skill'}`,
          rank: rankMatch(name, q),
        });
      }
    }
    out.sort((a, b) => a.rank - b.rank || a.id - b.id);
    return out.slice(0, PICKER_LIMIT);
  }, [skills, q, lang]);
  return (
    <Picker search={search} setSearch={setSearch} rows={rows} onPick={onPick}
      placeholder="Search a skill to clone (name or ID)…"
      emptyText="No matching skill." />
  );
}

function CharacterPicker({ characters, lang, takenIds, onPick }) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const taken = useMemo(() => new Set(takenIds || []), [takenIds]);
  const rows = useMemo(() => {
    if (!q) return [];
    const out = [];
    for (const c of characters) {
      const id = c?.ID;
      if (id === undefined) continue;
      const name = loc(c.NameString, lang, '').toLowerCase();
      if (name.includes(q) || String(id) === q) {
        out.push({
          id,
          label: loc(c.NameString, lang, `Character #${id}`),
          meta: `ID ${id} · ${rarityLabels[c.rarity] || `R${c.rarity}`}`,
          taken: taken.has(id),
          rank: rankMatch(name, q),
        });
      }
    }
    out.sort((a, b) => a.rank - b.rank || a.id - b.id);
    return out.slice(0, PICKER_LIMIT);
  }, [characters, q, lang, taken]);
  return (
    <Picker search={search} setSearch={setSearch} rows={rows} onPick={onPick}
      placeholder="Search a character to clone (name or ID)…"
      emptyText="No matching character." />
  );
}

function BuddyPicker({ buddies, lang, onPick }) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!q) return [];
    const out = [];
    for (const b of buddies) {
      const id = b?.ID;
      if (id === undefined) continue;
      const name = loc(b.NameString, lang, '').toLowerCase();
      if (name.includes(q) || String(id) === q) {
        out.push({
          id,
          label: loc(b.NameString, lang, `Companion #${id}`),
          meta: `ID ${id}`,
          rank: rankMatch(name, q),
        });
      }
    }
    out.sort((a, b) => a.rank - b.rank || a.id - b.id);
    return out.slice(0, PICKER_LIMIT);
  }, [buddies, q, lang]);
  return (
    <Picker search={search} setSearch={setSearch} rows={rows} onPick={onPick}
      placeholder="Search a companion to clone (name or ID)…"
      emptyText="No matching companion." />
  );
}

function MultilingualInput({ label, value, onChange, multiline, rows = 4, required, title }) {
  const [activeLang, setActiveLang] = useState('en');
  const current = value?.[activeLang] || '';
  return (
    <div className="ms-multilang" title={title}>
      <div className="ms-multilang-head">
        <span className="ms-field-label">
          {label} {required && <em title="English is required — TerraMod fills the other languages from it">*</em>}
        </span>
        <div className="ms-lang-chips">
          {LANGS.map(l => (
            <button
              key={l} type="button"
              className={`ms-lang-chip${l === activeLang ? ' active' : ''}${(value?.[l] || '').trim() ? ' filled' : ''}`}
              onClick={() => setActiveLang(l)}
              title={l}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {multiline ? (
        <textarea className="ms-input" rows={rows} value={current}
          onChange={e => onChange({ ...value, [activeLang]: e.target.value })}
          placeholder={activeLang === 'en' ? 'English text…' : `Leave empty to fall back to English`} />
      ) : (
        <input className="ms-input" type="text" value={current}
          onChange={e => onChange({ ...value, [activeLang]: e.target.value })}
          placeholder={activeLang === 'en' ? 'English text…' : 'Leave empty to fall back to English'} />
      )}
    </div>
  );
}

function NumField({ label, value, onChange, step = 1, min, max, title, placeholder }) {
  return (
    <label className="ms-numfield" title={title}>
      <span>{label}</span>
      <input
        type="number" step={step} min={min} max={max}
        value={value ?? ''} placeholder={placeholder}
        onChange={e => { const v = e.target.value; onChange(v === '' ? null : Number(v)); }}
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options, title }) {
  return (
    <label className="ms-numfield" title={title}>
      <span>{label}</span>
      <select value={value ?? ''} onChange={e => onChange(Number(e.target.value))}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

// A template-backed field: shows the template value until edited; a dot marks
// overrides and a small × reverts them.
function TemplateField(props) {
  const { templateValue, overridden, onOverride, onClear } = props;
  return (
    <div className="ms-tpl-field">
      {props.type === 'select'
        ? <SelectField {...props} value={overridden ? props.value : templateValue} onChange={onOverride} />
        : <NumField {...props} value={overridden ? props.value : templateValue} onChange={onOverride} placeholder={templateValue ?? ''} />}
      {overridden && (
        <button type="button" className="ms-field-clear" title="Revert to the template value" onClick={onClear}>
          <i className="fa-solid fa-rotate-left"></i>
        </button>
      )}
    </div>
  );
}

function SkillNameNote({ nextSkillId }) {
  const inBand = (id) => id >= 3843 && id <= 3852;
  return (
    <p className="mod-skill-note">
      <i className="fa-solid fa-circle-info"></i>
      TerraMod assigns new skill IDs at build time (next free: <strong>{nextSkillId}</strong>
      {inBand(nextSkillId) || nextSkillId > 3842 ? ', skipping the reserved 3843–3852 band' : ''}) —
      here you name skills with a key and reference them as <code>@key</code>.
    </p>
  );
}

// ---------------------------------------------------------------- editors

function SkillEditor({ skill, template, lang, onChange, onEnableNative, onRemove }) {
  const patchSet = (key, value) => {
    const set = { ...skill.set };
    if (value === null || value === '' || value === undefined) delete set[key];
    else set[key] = value;
    onChange({ set });
  };
  const randomPowerOn = skill.randomPower;
  return (
    <div className="mod-entity-card">
      <div className="mod-entity-head">
        <h4>
          <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#818cf8' }}></i>
          {skill.name?.en?.trim() || `Skill @${skill.key || '?'}`}
          <span className="mod-entity-tpl">from ID {skill.templateSkillId} · {template ? loc(template.nameString, lang, '') : '?'}</span>
        </h4>
        <button type="button" className="ms-remove-btn" onClick={onRemove} title="Remove this skill">
          <i className="fa-solid fa-trash"></i>
        </button>
      </div>

      <div className="mod-grid-2">
        <label className="ms-numfield" title="Internal name used to reference this skill in job skill lists (as @key). Never shown in-game — pick anything unique, letters/digits/underscore only.">
          <span>Key <em title="Referenced as @key in job skill lists">*</em></span>
          <input type="text" value={skill.key} placeholder="my_skill"
            onChange={e => onChange({ key: e.target.value.replace(/[^A-Za-z0-9_]/g, '') })} />
        </label>
        <MultilingualInput label="Name" value={skill.name} title="The skill name shown in the game's skill list. English is required; other languages fall back to it."
          onChange={v => onChange({ name: v })} required />
      </div>

      <div className="ms-fields-grid">
        {SKILL_SET_FIELDS.map(f => (
          <TemplateField
            key={f.key} label={f.label} type={f.type} step={f.step} title={f.title}
            options={f.type === 'select' ? OPTION_TABLES[f.options] : undefined}
            templateValue={template ? template[f.key] : undefined}
            value={skill.set?.[f.key]}
            overridden={skill.set && skill.set[f.key] !== undefined && skill.set[f.key] !== ''}
            onOverride={v => patchSet(f.key, v)}
            onClear={() => patchSet(f.key, null)}
          />
        ))}
      </div>

      <div className="mod-grid-2">
        <label className={`mod-checkbox${randomPowerOn ? ' checked' : ''}`}
          title="Requires the random_power native patch. Sets successRate to the magic value 4242 — the game then multiplies damage by a synced random factor.">
          <input type="checkbox" checked={randomPowerOn}
            onChange={e => {
              onChange({ randomPower: e.target.checked });
              if (e.target.checked) onEnableNative('random_power');
            }} />
          <span>Random damage multiplier <code>(×{skill.set?.power ?? template?.power ?? 1} base)</code></span>
        </label>
      </div>

      <MultilingualInput label="Description" value={skill.desc} title="The skill description text shown in-game (the flavour text under the name)."
        onChange={v => onChange({ desc: v })} />
      <MultilingualInput label="Range text" value={skill.range} onChange={v => onChange({ range: v })}
        title="Short text shown after the skill name in the skill list (area summary). Often empty for plain attacks."
        hint="Shown in the skill list (often empty for attacks)" />
    </div>
  );
}

function CharacterEditor({ character, catalogs, lang, nextIds, draft, charName, skillName, itemName, jobById,
  onChangeCharacter, onChangeJob, onProbeJobImage, onRemove }) {
  const c = character;
  const recodeSourceName = c.recode.fromChrId ? charName(c.recode.fromChrId) : null;
  return (
    <div className="mod-entity-card mod-character">
      <div className="mod-entity-head">
        <h4>
          <i className="fa-solid fa-user" style={{ color: '#38bdf8' }}></i>
          {c.name?.en?.trim() || `Character #${c.chrId ?? '?'}`}
          <span className="mod-entity-tpl">clones {charName(c.templateChrId) || `#${c.templateChrId}`}</span>
        </h4>
        <button type="button" className="ms-remove-btn" onClick={onRemove} title="Remove this character">
          <i className="fa-solid fa-trash"></i>
        </button>
      </div>

      <div className="mod-grid-4">
        <NumField label="Character ID" value={c.chrId} min={1}
          onChange={v => onChangeCharacter({ chrId: v })}
          title={`Unique number identifying this character in the game database. Must be unused — the next free value is ${nextIds.chrId}.`} />
        <NumField label="Rarity" value={c.rarity} min={2} max={8}
          onChange={v => onChangeCharacter({ rarity: v })}
          title="Character class shown in-game: 2 D · 3 C · 4 B · 5 A · 6 S · 7 SS · 8 Z." />
        <NumField label="Generation" value={c.generation} min={1} max={3}
          onChange={v => onChangeCharacter({ generation: v })}
          title="Release era of the character (1 = original roster, 2 = recode era, 3 = late additions). Keep the template's value unless you know better." />
        <label className="mod-checkbox" title="Λ (Lambda) is the upgraded recode form: shows the Λ badge next to the name. Keep it checked when cloning a Λ template.">
          <input type="checkbox" checked={Boolean(c.isLambda)}
            onChange={e => onChangeCharacter({ isLambda: e.target.checked })} />
          <span>Λ form</span>
        </label>
      </div>

      <MultilingualInput label="Name" value={c.name} title="Character name shown everywhere in-game. English is required; other languages fall back to it."
        onChange={v => onChangeCharacter({ name: v })} required />

      {c.jobs.map((job, idx) => (
        <JobEditor key={job._uid} job={job} index={idx} character={c}
          catalogs={catalogs} lang={lang} draft={draft} skillName={skillName} jobById={jobById}
          onChange={patch => onChangeJob(job._uid, patch)}
          onProbeImage={imageId => onProbeJobImage(job._uid, imageId)}
          onRemove={() => {
            onChangeCharacter({ jobs: c.jobs.filter(j => j._uid !== job._uid) });
          }}
        />
      ))}
      <div className="mod-add-row">
        <AddJobControl templateJobs={jobById(c.templateChrId) ? (catalogs.characters.find(x => x?.ID === c.templateChrId)?.JobsInfo || []) : []} lang={lang}
          onAdd={tplJob => {
            const job = newJob(tplJob.ID, tplJob);
            job.templateImageId = tplJob.ImageID || null;
            onChangeCharacter({ jobs: [...c.jobs, job] });
          }} />
      </div>

      {/* DNA recode */}
      <div className={`mod-recode-box${c.recode.enabled ? ' enabled' : ''}`}
        title="A DNA recode lets an existing character be transformed into this one in-game, like Ma'curi into Ma'curi Λ. The source keeps its levels and equipment.">
        <label className="mod-checkbox">
          <input type="checkbox" checked={Boolean(c.recode.enabled)}
            onChange={e => onChangeCharacter({ recode: { ...c.recode, enabled: e.target.checked } })} />
          <h5><i className="fa-solid fa-dna"></i> DNA Recode <span className="mod-entity-tpl">turns an existing character into this one</span></h5>
        </label>
        {c.recode.enabled && (
          <>
            <div className="mod-grid-4">
              <RecodeSourceField c={c} catalogs={catalogs} lang={lang} charName={charName}
                onChange={onChangeCharacter} />
              <NumField label="Coins" value={c.recode.coins} min={0}
                onChange={v => onChangeCharacter({ recode: { ...c.recode, coins: v ?? 0 } })}
                title="Coin cost to perform the recode in-game — 20,000 is the usual price." />
            </div>
            <p className="mod-section-hint">Exactly 3 items and 2 companion materials — the game's recode ritual.</p>
            {c.recode.items.map((it, i) => (
              <RecodeItemRow key={i} index={i} row={it} catalogs={catalogs} lang={lang} itemName={itemName}
                onChange={row => {
                  const items = [...c.recode.items];
                  items[i] = row;
                  onChangeCharacter({ recode: { ...c.recode, items } });
                }} />
            ))}
            {c.recode.mons.map((m, i) => (
              <RecodeMonRow key={i} index={i} row={m} catalogs={catalogs} lang={lang} charName={charName}
                onChange={row => {
                  const mons = [...c.recode.mons];
                  mons[i] = row;
                  onChangeCharacter({ recode: { ...c.recode, mons } });
                }} />
            ))}
            {recodeSourceName && (
              <p className="mod-recode-summary">
                <i className="fa-solid fa-arrow-right-long"></i> {recodeSourceName} → {c.name?.en || 'this character'} for {c.recode.coins} coins
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RecodeSourceField({ c, catalogs, lang, charName, onChange }) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!q) return [];
    const out = [];
    for (const ch of catalogs.characters) {
      const id = ch?.ID;
      if (id === undefined) continue;
      const name = loc(ch.NameString, lang, '').toLowerCase();
      if (name.includes(q) || String(id) === q) {
        out.push({
          id,
          label: loc(ch.NameString, lang, `Character #${id}`),
          meta: ch.recode?.length ? 'already recoded' : `ID ${id}`,
          taken: Boolean(ch.recode?.length) || id === c.chrId,
          rank: rankMatch(name, q),
        });
      }
    }
    out.sort((a, b) => a.rank - b.rank || a.id - b.id);
    return out.slice(0, PICKER_LIMIT);
  }, [catalogs.characters, q, lang, c.chrId]);
  return (
    <div className="ms-numfield ms-recode-source">
      <span title="The character that gets transformed into this one in-game. It must not already have a DNA recode.">Recode source</span>
      {c.recode.fromChrId ? (
        <div className="ms-picked-row">
          <span>{charName(c.recode.fromChrId)}</span>
          <button type="button" className="ms-field-clear" title="Clear"
            onClick={() => onChange({ recode: { ...c.recode, fromChrId: null } })}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      ) : (
        <input type="text" value={search} placeholder="Search…"
          onChange={e => setSearch(e.target.value)} />
      )}
      {search.trim() !== '' && !c.recode.fromChrId && (
        <div className="item-picker-results ms-inline-results">
          {rows.length ? rows.map(r => (
            <div key={r.id} className={`item-picker-result${r.taken ? ' owned' : ''}`}>
              <span className="item-picker-name">{r.label}</span>
              <span className="item-picker-id">{r.meta}</span>
              {!r.taken && (
                <button type="button" className="item-add-btn"
                  onClick={() => { onChange({ recode: { ...c.recode, fromChrId: r.id } }); setSearch(''); }}>
                  <i className="fa-solid fa-plus"></i> Pick
                </button>
              )}
            </div>
          )) : <p className="item-picker-empty">No match.</p>}
        </div>
      )}
    </div>
  );
}

function RecodeItemRow({ index, row, catalogs, lang, itemName, onChange }) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!q) return [];
    const out = [];
    for (const it of catalogs.items) {
      const id = it?.item_index;
      if (id === undefined) continue;
      const name = loc(it.NameString, lang, '').toLowerCase();
      if (name.includes(q) || String(id) === q) {
        out.push({
          id,
          label: loc(it.NameString, lang, `Item #${id}`),
          meta: `ID ${id}`,
          rank: rankMatch(name, q),
        });
      }
    }
    out.sort((a, b) => a.rank - b.rank || a.id - b.id);
    return out.slice(0, 12);
  }, [catalogs.items, q, lang]);
  return (
    <div className="mod-recode-row">
      <span className="mod-recode-row-label" title="One of the three items the recode requires (like the items jobs need to unlock).">Item {index + 1}</span>
      <div className="ms-recode-source">
        {row.itemId ? (
          <div className="ms-picked-row">
            <span>{itemName(row.itemId)}</span>
            <button type="button" className="ms-field-clear" title="Clear"
              onClick={() => onChange({ ...row, itemId: null })}>
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        ) : (
          <input type="text" value={search} placeholder="Search an item…"
            onChange={e => setSearch(e.target.value)} />
        )}
        {search.trim() !== '' && !row.itemId && (
          <div className="item-picker-results ms-inline-results">
            {rows.length ? rows.map(r => (
              <div key={r.id} className="item-picker-result">
                <span className="item-picker-name">{r.label}</span>
                <span className="item-picker-id">{r.meta}</span>
                <button type="button" className="item-add-btn"
                  onClick={() => { onChange({ ...row, itemId: r.id }); setSearch(''); }}>
                  <i className="fa-solid fa-plus"></i> Pick
                </button>
              </div>
            )) : <p className="item-picker-empty">No match.</p>}
          </div>
        )}
      </div>
      <label className="ms-numfield" title="How many of this item the recode costs (max 255 — the game stores the count in a single byte).">
        <span>Count</span>
        <input type="number" min={1} max={255} value={row.count ?? ''}
          onChange={e => onChange({ ...row, count: e.target.value === '' ? null : Number(e.target.value) })} />
      </label>
    </div>
  );
}

function RecodeMonRow({ index, row, catalogs, lang, charName, onChange }) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!q) return [];
    const out = [];
    for (const ch of catalogs.characters) {
      const id = ch?.ID;
      if (id === undefined) continue;
      const name = loc(ch.NameString, lang, '').toLowerCase();
      if (name.includes(q) || String(id) === q) {
        out.push({
          id,
          label: loc(ch.NameString, lang, `Character #${id}`),
          meta: `ID ${id}`,
          rank: rankMatch(name, q),
        });
      }
    }
    out.sort((a, b) => a.rank - b.rank || a.id - b.id);
    return out.slice(0, 12);
  }, [catalogs.characters, q, lang]);
  return (
    <div className="mod-recode-row">
      <span className="mod-recode-row-label" title="A character consumed as material for the recode (like feeding Ma'curi companions to the ritual).">Material {index + 1}</span>
      <div className="ms-recode-source">
        {row.chrId ? (
          <div className="ms-picked-row">
            <span>{charName(row.chrId)}</span>
            <button type="button" className="ms-field-clear" title="Clear"
              onClick={() => onChange({ ...row, chrId: null })}>
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        ) : (
          <input type="text" value={search} placeholder="Search a character…"
            onChange={e => setSearch(e.target.value)} />
        )}
        {search.trim() !== '' && !row.chrId && (
          <div className="item-picker-results ms-inline-results">
            {rows.length ? rows.map(r => (
              <div key={r.id} className="item-picker-result">
                <span className="item-picker-name">{r.label}</span>
                <span className="item-picker-id">{r.meta}</span>
                <button type="button" className="item-add-btn"
                  onClick={() => { onChange({ ...row, chrId: r.id }); setSearch(''); }}>
                  <i className="fa-solid fa-plus"></i> Pick
                </button>
              </div>
            )) : <p className="item-picker-empty">No match.</p>}
          </div>
        )}
      </div>
      <label className="ms-numfield" title="The level this material character must be to perform the recode.">
        <span>Level</span>
        <input type="number" min={1} max={99} value={row.level ?? ''}
          onChange={e => onChange({ ...row, level: e.target.value === '' ? null : Number(e.target.value) })} />
      </label>
    </div>
  );
}

// Job art preview: shows the typed image ID's art when it already exists in
// the game (paths resolved by the backend); otherwise the template art as a
// dashed placeholder — a free ID is the goal, the mod ships its own art.
function JobImagePreview({ job, template }) {
  const newPiece = job.imageTaken ? job.imageFiles?.piece : null;
  const newIllust = job.imageTaken ? job.imageFiles?.illust : null;
  const pieceSrc = newPiece ? gameAssetUrl(newPiece) : gameAssetUrl(template?.piece_file);
  const illustSrc = newIllust ? gameAssetUrl(newIllust) : gameAssetUrl(template?.illust_file);
  const title = !job.imageId
    ? 'Template art — no new image ID set'
    : newPiece || newIllust
      ? `Existing game art for image ID ${job.imageId}`
      : `Image ID ${job.imageId} is free — the mod ships new art here (template art shown)`;
  const placeholder = (newPiece || newIllust) ? '' : ' ms-art-placeholder';
  return (
    <>
      {pieceSrc && (
        <img src={pieceSrc} alt="" title={title} className={placeholder.trim()}
          onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
          onLoad={e => { e.currentTarget.style.visibility = 'visible'; }} />
      )}
      {illustSrc && (
        <img className={`ms-illust${placeholder}`} src={illustSrc} alt="" title={title}
          onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
          onLoad={e => { e.currentTarget.style.visibility = 'visible'; }} />
      )}
    </>
  );
}

function AddJobControl({ templateJobs, lang, onAdd }) {
  if (!templateJobs.length) return null;
  return (
    <div className="mod-add-job">
      <span>Add another job cloned from:</span>
      {templateJobs.map(j => (
        <button key={j.ID} type="button" className="secondary-btn"
          onClick={() => onAdd(j)}>
          <i className="fa-solid fa-plus"></i> {loc(j.NameString, lang, `Job ${j.ID}`)}
        </button>
      ))}
    </div>
  );
}

function JobEditor({ job, index, lang, skillName, jobById, onChange, onProbeImage, onRemove }) {
  const template = jobById(job.templateJobId);
  const tplSkills = template?.skills || [];
  const fieldsBadJson = job._extraFieldsError;
  return (
    <div className="mod-job-card">
      <div className="mod-entity-head">
        <h5><i className="fa-solid fa-briefcase"></i> Job {index + 1}
          <span className="mod-entity-tpl">from job ID {job.templateJobId} · {template ? loc(template.NameString, lang, '') : '?'}</span>
        </h5>
        <button type="button" className="ms-remove-btn" onClick={onRemove} title="Remove this job">
          <i className="fa-solid fa-trash"></i>
        </button>
      </div>

      <div className="mod-grid-4">
        <NumField label="Job ID" value={job.jobId} min={1} onChange={v => onChange({ jobId: v })}
          title="Unique number for this job (a job = one stat block + skill kit, like Job 1/2/3). Must be unused across the whole game." />
        <NumField label="Image ID" value={job.imageId} min={1} placeholder="e.g. 3001"
          onChange={v => { onChange({ imageId: v }); onProbeImage(v); }}
          title="The art set for this job: the battle piece, the illustration and the profile picture all use this one number. A free ID shows the template art as a dashed preview — you supply the new art separately." />
        <div className="ms-image-preview">
          <JobImagePreview job={job} template={template} />
        </div>
        <MultilingualInput label="Job name" value={job.name} onChange={v => onChange({ name: v })}
          title="Name of this job (shown on the job tabs). Defaults to the character name when left empty."
          hint="Defaults to the character name" />
      </div>

      {job.imageTaken && (
        <p className="mod-inline-warning"><i className="fa-solid fa-triangle-exclamation"></i> Image ID {job.imageId} already exists in the game.</p>
      )}

      <div className="ms-fields-grid">
        {JOB_FIELD_EDITORS.map(f => (
          <TemplateField
            key={f.key} label={f.label} type={f.type} step={f.step} title={f.title}
            options={f.type === 'select' ? OPTION_TABLES[f.options] : undefined}
            templateValue={template ? template[f.key] : undefined}
            value={job.fields?.[f.key]}
            overridden={job.fields && job.fields[f.key] !== undefined && job.fields[f.key] !== ''}
            onOverride={v => {
              const fields = { ...job.fields };
              if (v === null || v === '') delete fields[f.key];
              else fields[f.key] = v;
              onChange({ fields });
            }}
            onClear={() => {
              const fields = { ...job.fields };
              delete fields[f.key];
              onChange({ fields });
            }}
          />
        ))}
      </div>

      {/* Stats */}
      <div className="ms-fields-grid ms-stats-grid" title="Stat at level 1 (min) and at the level cap (max). The curve fields above shape the growth between the two.">
        {JOB_STATS.map(s => (
          <div key={s} className="ms-stat-pair">
            <span className="ms-field-label" title={`Stat at level 1 (min) and at the level cap (max).${s === 'SATK' ? ' SATK = magic attack.' : s === 'SDEF' ? ' SDEF = magic defense.' : ''}`}>{s}</span>
            <div className="ms-stat-inputs">
              <NumField label="min" value={job.stats?.[s]?.min}
                onChange={v => onChange({ stats: { ...job.stats, [s]: { ...job.stats[s], min: v ?? 0 } } })}
                title={`${s} at level 1.`} />
              <NumField label="max" value={job.stats?.[s]?.max}
                onChange={v => onChange({ stats: { ...job.stats, [s]: { ...job.stats[s], max: v ?? 0 } } })}
                title={`${s} at the level cap (99).`} />
            </div>
          </div>
        ))}
      </div>
      <p className="mod-section-hint" title="The formula the game uses to interpolate the stat between min (level 1) and max (level 99).">
        Level curve: <code>stat(L) = min + (max−min) · ((L−1)/98)^coeff</code> — the curve fields above shape it.
      </p>

      {/* Skill slots */}
      <div className="mod-slots"
        title="The job's skill kit. 'Keep template skill' clones the original; 'New skill' references a skill defined in this mod by its key; 'Existing skill ID' points at any game skill.">
        <span className="ms-field-label">Skill kit ({tplSkills.length} slots — must match the template job)</span>
        {(job.skillSlots || []).map((slot, i) => (
          <div key={i} className="mod-slot-row">
            <span className="mod-slot-index">Lv&nbsp;{job.skillLevels?.[i] ?? '?'}</span>
            <select value={slot.type}
              onChange={e => {
                const slots = [...job.skillSlots];
                slots[i] = { type: e.target.value, key: '', skillId: tplSkills[i] ?? null };
                onChange({ skillSlots: slots });
              }}>
              <option value="keep">Keep template skill</option>
              <option value="new">New skill (@key)</option>
              <option value="existing">Existing skill ID</option>
            </select>
            {slot.type === 'keep' && (
              <span className="mod-slot-value">{skillName(tplSkills[i]) || `#${tplSkills[i]}`}</span>
            )}
            {slot.type === 'new' && (
              <>
                <span className="mod-slot-at">@</span>
                <input type="text" list="modskillkeys" value={slot.key}
                  onChange={e => {
                    const slots = [...job.skillSlots];
                    slots[i] = { ...slot, key: e.target.value.replace(/[^A-Za-z0-9_]/g, '') };
                    onChange({ skillSlots: slots });
                  }} />
              </>
            )}
            {slot.type === 'existing' && (
              <>
                <input type="number" min={1} value={slot.skillId ?? ''}
                  onChange={e => {
                    const slots = [...job.skillSlots];
                    slots[i] = { ...slot, skillId: e.target.value === '' ? null : Number(e.target.value) };
                    onChange({ skillSlots: slots });
                  }} />
                <span className="mod-slot-value">{skillName(slot.skillId) || ''}</span>
              </>
            )}
          </div>
        ))}
        <div className="mod-slot-levels" title="The level at which each skill slot unlocks (slot order matches the list above). A common spread is 1 / 30 / 50 / 80.">
          <span className="ms-field-label">Unlock levels</span>
          {(job.skillLevels || []).map((lv, i) => (
            <input key={i} type="number" min={1} max={99} value={lv ?? ''}
              onChange={e => {
                const levels = [...job.skillLevels];
                levels[i] = e.target.value === '' ? null : Number(e.target.value);
                onChange({ skillLevels: levels });
              }} />
          ))}
        </div>
      </div>

      <MultilingualInput label="Profile story" value={job.profile} title="The character story shown on the profile screen. English is required; other languages fall back to it."
        onChange={v => onChange({ profile: v })} multiline rows={6} />

      <details className="mod-raw-fields" title="Advanced escape hatch: any other job field from the game database, merged into the spec as-is. Must be valid JSON.">
        <summary>Extra job fields (JSON, advanced)</summary>
        <textarea
          value={job._extraFieldsText ?? (Object.keys(job.extraFields || {}).length ? JSON.stringify(job.extraFields, null, 2) : '')}
          onChange={e => {
            const text = e.target.value;
            if (text.trim() === '') {
              onChange({ extraFields: {}, _extraFieldsText: '', _extraFieldsError: null });
              return;
            }
            try {
              const parsed = JSON.parse(text);
              if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) throw new Error('must be an object');
              onChange({ extraFields: parsed, _extraFieldsText: text, _extraFieldsError: null });
            } catch (err) {
              onChange({ _extraFieldsText: text, _extraFieldsError: err.message });
            }
          }}
          rows={4}
          placeholder='{ "SkillBoost": 0, "WAIT": 0 }'
        />
        {fieldsBadJson && <p className="mod-inline-warning"><i className="fa-solid fa-triangle-exclamation"></i> {fieldsBadJson}</p>}
      </details>
    </div>
  );
}

function BuddyEditor({ buddy, catalogs, lang, nextIds, charName, buddyName, skillName, onChange, onProbeImage, onRemove }) {
  const b = buddy;
  const template = catalogs.buddies.find(x => x?.ID === b.templateBuddyId);
  const hasServerRules = b.server?.used;
  return (
    <div className="mod-entity-card">
      <div className="mod-entity-head">
        <h4>
          <i className="fa-solid fa-paw" style={{ color: '#34d399' }}></i>
          {b.name?.en?.trim() || `Companion #${b.buddyId ?? '?'}`}
          <span className="mod-entity-tpl">clones {buddyName(b.templateBuddyId) || `#${b.templateBuddyId}`}</span>
        </h4>
        <button type="button" className="ms-remove-btn" onClick={onRemove} title="Remove this companion">
          <i className="fa-solid fa-trash"></i>
        </button>
      </div>

      <div className="mod-grid-4">
        <NumField label="Companion ID" value={b.buddyId} min={1}
          onChange={v => onChange({ buddyId: v })}
          title={`Unique number identifying this companion in the game database. Must be unused — the next free value is ${nextIds.buddyId}.`} />
        <NumField label="Rarity" value={b.rarity} min={1} max={8} onChange={v => onChange({ rarity: v })}
          title="Companion class; 8 = Z (the letter shown in-game derives from this). Exclusive story companions are often Z." />
        <NumField label="Max level" value={b.maxLevel} min={1} onChange={v => onChange({ maxLevel: v })}
          title="The companion's own level cap (companions level separately from characters). Level-1 exclusives are a thing — see the Mech Arm example." />
        <NumField label="Required level" value={b.requiredLevel} min={1} onChange={v => onChange({ requiredLevel: v })}
          title="Player rank needed before this companion can be equipped." />
      </div>

      <MultilingualInput label="Name" value={b.name} title="Companion name shown in-game. English is required; other languages fall back to it."
        onChange={v => onChange({ name: v })} required />
      <MultilingualInput label="Description" value={b.desc} title="Flavour text shown on the companion's detail screen."
        onChange={v => onChange({ desc: v })} multiline rows={3} />

      <div className="ms-fields-grid ms-stats-grid" title="Flat bonuses while the companion is equipped. BOOST raises Skill Boost. Each value is emitted as both min and max — companions are flat-stat.">
        {BUDDY_STATS.map(s => (
          <NumField key={s} label={s} value={b.stats?.[s]}
            onChange={v => onChange({ stats: { ...b.stats, [s]: v ?? 10 } })}
            title={s === 'BOOST'
              ? 'Skill Boost % granted while equipped.'
              : `${s} bonus while equipped.`} />
        ))}
      </div>

      <div className="mod-grid-4">
        <ExclusiveChrField b={b} catalogs={catalogs} lang={lang} charName={charName} onChange={onChange} />
        <NumField label="Image ID" value={b.imageId} min={1} placeholder="e.g. 521"
          onChange={v => { onChange({ imageId: v }); onProbeImage(v); }}
          title="The companion's art set: buddy_<id>a (large), buddy_<id>b (small) and bimg_<id> (thumbnail) all use this number. You supply the art files separately." />
        <label className="mod-checkbox" title="Whether the companion can drop from enemies. Exclusive story companions usually cannot.">
          <input type="checkbox" checked={b.canDrop === 1}
            onChange={e => onChange({ canDrop: e.target.checked ? 1 : 0 })} />
          <span>Can drop</span>
        </label>
      </div>
      {b.imageTaken && (
        <p className="mod-inline-warning"><i className="fa-solid fa-triangle-exclamation"></i> Image ID {b.imageId} already exists in the game.</p>
      )}

      {/* Skill */}
      <div className="mod-slot-row mod-buddy-skill" title="The skill this companion grants while equipped. 'Keep template skill' clones the original; 'New skill' references a skill defined in this mod; 'Existing skill ID' points at any game skill.">
        <span className="ms-field-label">Skill</span>
        <select value={b.skillMode} onChange={e => onChange({ skillMode: e.target.value })}>
          <option value="keep">Keep template skill</option>
          <option value="new">New skill (@key)</option>
          <option value="existing">Existing skill ID</option>
        </select>
        {b.skillMode === 'keep' && (
          <span className="mod-slot-value">{skillName(template?.skill) || `#${template?.skill}`}</span>
        )}
        {b.skillMode === 'new' && (
          <input type="text" list="modskillkeys" value={b.skillKey} placeholder="skill key"
            onChange={e => onChange({ skillKey: e.target.value.replace(/[^A-Za-z0-9_]/g, '') })} />
        )}
        {b.skillMode === 'existing' && (
          <input type="number" min={1} value={b.skillId ?? ''}
            onChange={e => onChange({ skillId: e.target.value === '' ? null : Number(e.target.value) })} />
        )}
      </div>

      <details className="mod-raw-fields" title="Advanced escape hatch: any other companion field from the game database, merged into the spec as-is. Must be valid JSON.">
        <summary>Extra companion fields (JSON, advanced)</summary>
        <textarea
          value={b._extraFieldsText ?? (Object.keys(b.extraFields || {}).length ? JSON.stringify(b.extraFields, null, 2) : '')}
          onChange={e => {
            const text = e.target.value;
            if (text.trim() === '') {
              onChange({ extraFields: {}, _extraFieldsText: '', _extraFieldsError: null });
              return;
            }
            try {
              const parsed = JSON.parse(text);
              if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) throw new Error('must be an object');
              onChange({ extraFields: parsed, _extraFieldsText: text, _extraFieldsError: null });
            } catch (err) {
              onChange({ _extraFieldsText: text, _extraFieldsError: err.message });
            }
          }}
          rows={4}
          placeholder='{ "sortNameJa": "..." }'
        />
        {b._extraFieldsError && <p className="mod-inline-warning"><i className="fa-solid fa-triangle-exclamation"></i> {b._extraFieldsError}</p>}
      </details>

      {/* Server draw rules */}
      <div className={`mod-recode-box${hasServerRules ? ' enabled' : ''}`}>
        <label className="mod-checkbox">
          <input type="checkbox" checked={Boolean(hasServerRules)}
            onChange={e => onChange({ server: { ...b.server, used: e.target.checked } })} />
          <h5><i className="fa-solid fa-server"></i> Server draw rules <span className="mod-entity-tpl">optional — exported as buddies.json</span></h5>
        </label>
        {hasServerRules && (
          <>
            <div className="mod-grid-4">
              <label className="ms-numfield" title="Rarity letter used in the server's companion tables (e.g. Z for exclusive)">
                <span>Rarity letter</span>
                <input type="text" maxLength={1} value={b.server.rarityLetter}
                  onChange={e => onChange({ server: { ...b.server, rarityLetter: e.target.value.toUpperCase() } })} />
              </label>
              <label className="ms-numfield">
                <span>Draw pool</span>
                <select value={b.server.pool || ''} title="Add the companion to a draw pool; empty keeps it out of both"
                  onChange={e => onChange({ server: { ...b.server, pool: e.target.value } })}>
                  <option value="">None</option>
                  <option value="truth">Truth</option>
                  <option value="fellowship">Fellowship (coins)</option>
                </select>
              </label>
              <NumField label="Guaranteed after character" value={b.server.afterChrId} min={1}
                onChange={v => onChange({ server: { ...b.server, afterChrId: v } })}
                title="Once the player owns this character, the next coin draw guarantees this companion (once)" />
              <label className="mod-checkbox" title="At most one copy; delivered locked; cannot be sold or used as material">
                <input type="checkbox" checked={Boolean(b.server.unique)}
                  onChange={e => onChange({ server: { ...b.server, unique: e.target.checked } })} />
                <span>Unique</span>
              </label>
            </div>
            {b.server.afterChrId && (
              <p className="mod-recode-summary">
                <i className="fa-solid fa-gift"></i> Owning {charName(b.server.afterChrId) || `#${b.server.afterChrId}`} guarantees this companion on the next coin draw.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ExclusiveChrField({ b, catalogs, lang, charName, onChange }) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!q) return [];
    const out = [];
    for (const ch of catalogs.characters) {
      const id = ch?.ID;
      if (id === undefined) continue;
      const name = loc(ch.NameString, lang, '').toLowerCase();
      if (name.includes(q) || String(id) === q) {
        out.push({
          id,
          label: loc(ch.NameString, lang, `Character #${id}`),
          meta: `ID ${id}`,
          rank: rankMatch(name, q),
        });
      }
    }
    out.sort((a, b2) => a.rank - b2.rank || a.id - b2.id);
    return out.slice(0, 12);
  }, [catalogs.characters, q, lang]);
  return (
    <div className="ms-numfield ms-recode-source">
      <span title="Only this character (or its recodes) can equip the companion">Exclusive to</span>
      {b.exclusiveChrId ? (
        <div className="ms-picked-row">
          <span>{charName(b.exclusiveChrId)}</span>
          <button type="button" className="ms-field-clear" title="Clear"
            onClick={() => onChange({ exclusiveChrId: null })}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      ) : (
        <input type="text" value={search} placeholder="Any character"
          onChange={e => setSearch(e.target.value)} />
      )}
      {search.trim() !== '' && !b.exclusiveChrId && (
        <div className="item-picker-results ms-inline-results">
          {rows.length ? rows.map(r => (
            <div key={r.id} className="item-picker-result">
              <span className="item-picker-name">{r.label}</span>
              <span className="item-picker-id">{r.meta}</span>
              <button type="button" className="item-add-btn"
                onClick={() => { onChange({ exclusiveChrId: r.id }); setSearch(''); }}>
                <i className="fa-solid fa-plus"></i> Pick
              </button>
            </div>
          )) : <p className="item-picker-empty">No match.</p>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- images table

function ImagesTable({ draft, onChangeJob, onChangeBuddy }) {
  const rows = [];
  for (const c of draft.characters) {
    for (const j of c.jobs) {
      if (!j.imageId) continue;
      rows.push({
        key: j._uid,
        kind: 'Character',
        imageId: j.imageId,
        names: [`img_${j.imageId}`, `illust_${j.imageId}`, `profile_${j.imageId}[_m]`],
        templateImageId: j.imageTemplateOverride || j.templateImageId,
        dims: [j.imageDims?.piece, j.imageDims?.illust],
        dimLabels: ['Piece', 'Illust'],
        onTemplate: v => onChangeJob(c._uid, j._uid, { imageTemplateOverride: v }),
        onDims: (which, d) => onChangeJob(c._uid, j._uid, { imageDims: { ...j.imageDims, [which]: d } }),
      });
    }
  }
  for (const b of draft.buddies) {
    if (!b.imageId) continue;
    rows.push({
      key: b._uid,
      kind: 'Companion',
      imageId: b.imageId,
      names: [`buddy_${b.imageId}a`, `buddy_${b.imageId}b`, `bimg_${b.imageId}`],
      templateImageId: b.imageTemplateOverride || b.templateBuddyId,
      dims: [b.imageDims?.large, b.imageDims?.small, b.imageDims?.thumb],
      dimLabels: ['Large', 'Small', 'Thumb'],
      onTemplate: v => onChangeBuddy(b._uid, { imageTemplateOverride: v }),
      onDims: (which, d) => onChangeBuddy(b._uid, { imageDims: { ...b.imageDims, [which]: d } }),
    });
  }
  if (!rows.length) return <p className="item-empty-note">No image IDs referenced yet.</p>;
  return (
    <div className="mod-images-table">
      {rows.map(r => {
        const tplName = r.templateImageId ? String(r.templateImageId) : '';
        const lengthOk = !tplName || tplName.length === String(r.imageId).length;
        return (
          <div key={r.key} className="mod-image-row">
            <div className="mod-image-names">
              <span className="mod-image-kind">{r.kind}</span>
              <span className="mod-image-id">ID {r.imageId}</span>
              <code>{r.names.join(' · ')}</code>
            </div>
            <label className="ms-numfield" title="Template file TerraMod rebuilds the bundle from — its name must have the same length as the new one">
              <span>Template ID</span>
              <input type="text" value={tplName} placeholder="auto"
                onChange={e => r.onTemplate(e.target.value.replace(/[^0-9]/g, ''))} />
            </label>
            {!lengthOk && (
              <span className="mod-inline-warning">
                <i className="fa-solid fa-triangle-exclamation"></i> Template name length must match ({String(r.imageId).length} digits).
              </span>
            )}
            {r.dims.map((d, i) => (
              <span key={i} className="ms-dims" title="Pixel size of the art file the game expects — prefilled from the template art; fill manually if the probe came up empty.">
                <span className="ms-field-label">{r.dimLabels[i]}</span>
                {d?.w ? (
                  <span className="ms-dims-value">{d.w}×{d.h}</span>
                ) : (
                  <span className="ms-dims-edit">
                    <input type="number" placeholder="w" value={d?.w ?? ''}
                      onChange={e => r.onDims(r.dimLabels[i].toLowerCase(), { ...(d || {}), w: Number(e.target.value) || null })} />
                    ×
                    <input type="number" placeholder="h" value={d?.h ?? ''}
                      onChange={e => r.onDims(r.dimLabels[i].toLowerCase(), { ...(d || {}), h: Number(e.target.value) || null })} />
                  </span>
                )}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}
