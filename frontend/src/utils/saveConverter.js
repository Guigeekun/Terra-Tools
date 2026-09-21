/**
 * Savefile Converter utilities for Project Liminal Gate and ReTB formats.
 * Character display names are resolved in the UI from the loaded game data;
 * summaries only carry the raw character ids.
 */

// Item inventory shape the game client expects: itemList[slot - 1] holds the
// count of item `slot` (ids are 1-based, exactly 181 slots, stack cap 999) --
// mirrors project-liminal-gate save_validation.py and its save editor.
export const ITEM_SLOTS = 181;
export const ITEM_MAX_STACK = 999;

// Held items as {id, count} pairs (ids 1-based) for summaries and the UI.
export function parseHeldItems(itemList) {
  return (Array.isArray(itemList) ? itemList : [])
    .map((count, index) => ({ id: index + 1, count: Number(count) || 0 }))
    .filter(it => it.count > 0);
}

// Companion entries as {iid, bid, lv} copies for summaries and the UI. iid is
// the per-copy inventory id the save keys edits by; bid is the species id.
export function parseBuddyCopies(buddyList) {
  return (Array.isArray(buddyList) ? buddyList : [])
    .map(e => {
      const iid = Math.floor(Number(e && e.iid));
      const bid = Math.floor(Number(e && e.bid));
      const lv = Math.floor(Number(e && e.lv));
      return {
        iid: Number.isFinite(iid) ? iid : 0,
        bid: Number.isFinite(bid) ? bid : 0,
        lv: Number.isFinite(lv) && lv >= 1 ? lv : 1
      };
    })
    .filter(b => b.bid > 0)
    .sort((a, b) => a.iid - b.iid);
}

export function detectSaveFormat(data) {
  if (!data || typeof data !== 'object') return 'unknown';
  if (data.format === 'retb-save/1' || (data.tables && data.tables.session)) {
    return 'retb';
  }
  if (data.accounts || data.active_account_id) {
    return 'liminal';
  }
  return 'unknown';
}

// JSON.stringify cannot emit "0.0" -- in JS the numbers 0 and 0.0 are the same
// value -- so integral doubles that the game client reads through LitJson
// double casts must be re-decimalised in the serialized text. reTB coerces its
// typed session fields at serve time, but chrdata `date` is an untyped extra
// that reaches the client verbatim: an int 0 there hangs the boot on the
// loading screen. (Float-trap list: project-liminal-gate save_validation.py.)
function coerceJsonDoubles(json) {
  return json.replace(
    /("(?:date|lastupdate|refillStartTime)":)(-?\d+)([,}\]])/g,
    '$1$2.0$3'
  );
}

// Build the Liminal Gate buddyInfo.record list: one entry per distinct
// companion species, the best copy held (liminal derives record from the owned
// list; a bare {bid: level} map is not the persisted shape).
function buildLiminalRecord(buddyList, compendium) {
  const best = new Map();
  (Array.isArray(buddyList) ? buddyList : []).forEach(entry => {
    if (entry === null || typeof entry !== 'object') return;
    const species = Number(entry.bid);
    if (!Number.isFinite(species) || Math.floor(species) <= 0) return;
    const lv = Number(entry.lv || 1);
    if (!best.has(species) || lv > Number(best.get(species).lv || 1)) {
      best.set(species, { entry, lv });
    }
  });
  const record = [...best.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([species, { entry }]) => ({
      bid: Math.floor(species),
      chrID: 0,
      date: 0.0,
      exp: 0,
      flag: 1,
      iid: Number.isFinite(Number(entry.iid)) ? Number(entry.iid) : Math.floor(species),
      lv: Number(entry.lv || 1)
    }));
  // Ever-owned species that only live in the compendium (sold / consumed).
  if (compendium && typeof compendium === 'object' && !Array.isArray(compendium)) {
    Object.entries(compendium)
      .map(([k, v]) => ({ bid: Number(k), lv: Number(v) }))
      .filter(({ bid, lv }) => Number.isFinite(bid) && Math.floor(bid) > 0 && Number.isFinite(lv) && !best.has(bid))
      .sort((a, b) => a.bid - b.bid)
      .forEach(({ bid, lv }) => {
        record.push({
          bid: Math.floor(bid),
          chrID: 0,
          date: 0.0,
          exp: 0,
          flag: 1,
          iid: Math.floor(bid),
          lv: Math.max(1, Math.floor(lv || 1))
        });
      });
  }
  return record;
}

export function parseAccountSummaryLiminal(accountId, acc) {
  const ud = acc.userdata || {};
  const username = acc.username || ud.username || 'Player';
  const chrdata = ud.chrdata || [];

  const buddyList = Array.isArray(ud.buddyInfo) ? ud.buddyInfo
    : Array.isArray(ud.buddyInfo?.list) ? ud.buddyInfo.list
    : Array.isArray(ud.buddyInfo?.user_companions) ? ud.buddyInfo.user_companions
    : [];

  const itemList = ud.itemList || [];
  const itemCount = itemList.filter(n => n && n > 0).length;
  const questClears = Object.keys(ud.questClearDate || {}).length;

  return {
    account_id: accountId,
    username,
    character_count: chrdata.length,
    buddy_count: buddyList.length,
    coins: ud.coins || (ud.valuables && ud.valuables.coins) || 0,
    energy_free: ud.freeEnergy || (ud.valuables && ud.valuables.freeEnergy) || 0,
    energy_paid: ud.energy || (ud.valuables && ud.valuables.energy) || 0,
    stamina: 20,
    item_count: itemCount,
    items: parseHeldItems(itemList),
    buddies: parseBuddyCopies(buddyList),
    quest_clears: questClears,
    progress_code: ud.progressCode || 0,
    tutorial_phase: acc.tutorial_phase || 'free_roam',
    top_characters: chrdata.map(c => ({
      id: c.id,
      job_id: c.jobID || 0,
      luck: c.luck || 0,
      sb: c.skillBoost || 0,
      job_levels: c.jobLevels || [1, 0, 0]
    }))
  };
}

export function parseAccountSummaryRetb(retbData) {
  const userid = retbData.userid || (retbData.tables?.users?.rows?.[0]?.[0]) || '';
  const username = retbData.username || 'Player';
  const tables = retbData.tables || {};

  let sessionData = {};
  const sessionRow = tables.session?.rows?.[0];
  if (sessionRow && sessionRow[1]) {
    try {
      sessionData = typeof sessionRow[1] === 'string' ? JSON.parse(sessionRow[1]) : sessionRow[1];
    } catch (e) {
      sessionData = {};
    }
  }

  const chrRows = tables.characters?.rows || [];
  const sessionChrs = sessionData.chrdata || [];
  const charCount = Math.max(chrRows.length, sessionChrs.length);

  let coins = sessionData.valuables?.coins || 0;
  let freeEnergy = sessionData.valuables?.freeEnergy || 0;
  let paidEnergy = sessionData.valuables?.energy || 0;
  let stamina = sessionData.current_stamina || 20;

  if (tables.user_valuables?.rows?.[0]) {
    const vrow = tables.user_valuables.rows[0];
    const vcols = tables.user_valuables.cols || [];
    const vdict = {};
    vcols.forEach((col, idx) => { vdict[col] = vrow[idx]; });
    if (!coins && vdict.coins) coins = vdict.coins;
    if (!freeEnergy && vdict.max_free_energy) freeEnergy = vdict.max_free_energy;
    if (vdict.stamina) stamina = vdict.stamina;
  }

  const buddyList = Array.isArray(sessionData.buddyInfo) ? sessionData.buddyInfo
    : Array.isArray(sessionData.buddyInfo?.user_companions) ? sessionData.buddyInfo.user_companions
    : [];
  const itemList = sessionData.itemList || [];
  const itemCount = itemList.filter(n => n && n > 0).length;
  const questClears = Object.keys(sessionData.extra_quest_clears || {}).length;
  let topChrs = [];
  if (sessionChrs.length > 0) {
    topChrs = sessionChrs.map(c => ({
      id: c.id,
      job_id: c.jobID || 0,
      luck: c.luck || 0,
      sb: c.skillBoost || 0,
      job_levels: c.jobLevels || [1, 0, 0]
    }));
  } else if (chrRows.length > 0) {
    topChrs = chrRows.map(r => {
      let jl = r[5];
      if (typeof jl === 'string') {
        try { jl = JSON.parse(jl); } catch (e) { jl = [1, 0, 0]; }
      }
      return {
        id: r[1],
        luck: r[2] || 0,
        sb: r[3] || 0,
        job_id: r[4] || 0,
        job_levels: jl
      };
    });
  }

  return {
    account_id: userid,
    username,
    character_count: charCount,
    buddy_count: buddyList.length,
    coins,
    energy_free: freeEnergy,
    energy_paid: paidEnergy,
    stamina,
    item_count: itemCount,
    items: parseHeldItems(itemList),
    buddies: parseBuddyCopies(buddyList),
    quest_clears: questClears,
    progress_code: sessionData.progressCode || 0,
    tutorial_phase: 'free_roam',
    top_characters: topChrs
  };
}

export function inspectSaveData(data) {
  const fmt = detectSaveFormat(data);
  if (fmt === 'unknown') {
    throw new Error('Unrecognized savefile format.');
  }

  if (fmt === 'liminal') {
    const accounts = data.accounts || {};
    const activeId = data.active_account_id || Object.keys(accounts)[0] || '';
    const summaries = Object.entries(accounts).map(([aid, acc]) => parseAccountSummaryLiminal(aid, acc));
    return {
      format: 'liminal',
      format_label: 'Project Liminal Gate (bootstrap-state)',
      active_account_id: activeId,
      account_count: Object.keys(accounts).length,
      accounts: summaries
    };
  } else {
    const summary = parseAccountSummaryRetb(data);
    return {
      format: 'retb',
      format_label: 'ReTB Save (tb-save)',
      active_account_id: summary.account_id,
      account_count: 1,
      accounts: [summary]
    };
  }
}

export function convertSaveData(data, targetFormat = null, accountId = null) {
  const sourceFormat = detectSaveFormat(data);
  if (sourceFormat === 'unknown') {
    throw new Error('Unrecognized savefile format.');
  }

  const targetFmt = targetFormat || (sourceFormat === 'retb' ? 'liminal' : 'retb');
  const now = Math.floor(Date.now() / 1000);

  if (sourceFormat === 'liminal' && targetFmt === 'retb') {
    const accounts = data.accounts || {};
    const targetAccId = accountId || data.active_account_id || Object.keys(accounts)[0];
    if (!accounts[targetAccId]) {
      throw new Error(`Account ${targetAccId} not found in save.`);
    }

    const acc = accounts[targetAccId];
    const ud = acc.userdata || {};
    const username = acc.username || ud.username || 'Player';
    const userid = targetAccId;
    const coins = ud.coins || (ud.valuables?.coins) || 0;
    const freeEnergy = ud.freeEnergy || (ud.valuables?.freeEnergy) || 0;

    const chrdata = ud.chrdata || [];
    // The characters table stores DECODED job levels (plain ints, cap 90), not
    // the packed (exp << 12) | level floats used on the client wire.
    const decodeJobLevel = (v) => {
      const n = Math.floor(Number(v) || 0) & 0xFFF;
      return Math.max(0, Math.min(90, n));
    };
    const charRows = chrdata.map(c => [
      userid,
      c.id || 0,
      c.luck || 0,
      c.skillBoost || 0,
      c.jobID || 0,
      JSON.stringify(
        Array.isArray(c.jobLevels) && c.jobLevels.length
          ? c.jobLevels.map(decodeJobLevel)
          : [1, 0, 0]
      ),
      now
    ]);

    // Process buddyInfo. The Companion Compendium (_buddy_compendium) MUST be
    // keyed by the buddy species id (bid): reTB serves it back as
    // buddyInfo.record and the game looks each id up in its BuddyData table.
    // The per-copy inventory id (iid) grows without bound and would crash the
    // client, so entries without a usable bid are skipped.
    const foldCompendium = (entries) => {
      (entries || []).forEach(entry => {
        let species;
        let level = 1;
        if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
          species = Number(entry.bid);
          level = Number(entry.lv || 1);
        } else {
          species = Number(entry);
        }
        if (!Number.isFinite(species) || Math.floor(species) <= 0) return;
        if (!Number.isFinite(level) || level < 1) level = 1;
        const key = String(Math.floor(species));
        const lv = Math.floor(level);
        if (!(key in buddyCompendium) || lv > buddyCompendium[key]) {
          buddyCompendium[key] = lv;
        }
      });
    };
    const limBuddyInfo = ud.buddyInfo;
    let retbBuddyList = [];
    let buddyCompendium = {};
    if (typeof limBuddyInfo === 'object' && limBuddyInfo !== null) {
      if (Array.isArray(limBuddyInfo.list)) {
        retbBuddyList = JSON.parse(JSON.stringify(limBuddyInfo.list));
      } else if (Array.isArray(limBuddyInfo.user_companions)) {
        retbBuddyList = JSON.parse(JSON.stringify(limBuddyInfo.user_companions));
      }
      const rec = limBuddyInfo.record;
      if (Array.isArray(rec)) {
        foldCompendium(rec);
      } else if (rec && typeof rec === 'object') {
        // A map-shaped record is already keyed by species id.
        foldCompendium(Object.entries(rec).map(([k, v]) => (
          (v && typeof v === 'object') ? { bid: Number(k), lv: v.lv } : { bid: Number(k), lv: v }
        )));
      }
      // Every owned companion is "ever owned" too (mirrors reTB's
      // sync_buddy_compendium), so the live inventory folds into the ledger.
      foldCompendium(retbBuddyList);
    } else if (Array.isArray(limBuddyInfo)) {
      retbBuddyList = JSON.parse(JSON.stringify(limBuddyInfo));
      foldCompendium(retbBuddyList);
    }

    const sessionData = JSON.parse(JSON.stringify(ud));
    sessionData.username = username;
    sessionData.buddyInfo = retbBuddyList;
    sessionData._buddy_compendium = buddyCompendium;
    sessionData._buddy_inventory_seq = ud.nextCompanionInventoryId || (retbBuddyList.length + 1);

    if (!sessionData.current_stamina) sessionData.current_stamina = 20.0;
    if (sessionData.bonus_stamina === undefined) sessionData.bonus_stamina = 0;
    if (!sessionData.countryId) sessionData.countryId = 1;
    if (!sessionData.countryCode) sessionData.countryCode = 'us';
    if (!sessionData.lastUpdate) sessionData.lastUpdate = Number(now);
    if (!sessionData.stamina_updated_at) sessionData.stamina_updated_at = Number(now);
    if (!sessionData.worldProgressCode) {
      sessionData.worldProgressCode = { '0': ud.progressCode || 16777216 };
    }
    if (!sessionData.extra_quest_clears) {
      sessionData.extra_quest_clears = ud.questClearDate || {};
    }
    if (!sessionData.multipleFlags) sessionData.multipleFlags = {};
    if (!sessionData._vanquish_counts) sessionData._vanquish_counts = {};
    if (!sessionData._pending_luckup) sessionData._pending_luckup = {};
    if (!sessionData._pending_ltc) sessionData._pending_ltc = [];
    if (sessionData._pending_animata === undefined) sessionData._pending_animata = 0;
    if (!sessionData.achivementReadFlags) sessionData.achivementReadFlags = ud.achivementReadFlags || [];
    if (!sessionData._achievement_granted) sessionData._achievement_granted = [];
    if (!sessionData.exchange_remain) sessionData.exchange_remain = {};
    if (!sessionData._tutorial_env1_chr) sessionData._tutorial_env1_chr = chrdata[0]?.id || 3;
    if (!sessionData._last_quest_chapter) sessionData._last_quest_chapter = 3000;
    if (!sessionData._last_quest_section) sessionData._last_quest_section = 1;
    if (sessionData._energy_chapters_granted === undefined) sessionData._energy_chapters_granted = 0;
    if (sessionData._event_chapters_granted === undefined) sessionData._event_chapters_granted = 0;
    if (sessionData._ticket_chapters_granted === undefined) sessionData._ticket_chapters_granted = 0;
    if (!sessionData._energy_daily_quest_date) sessionData._energy_daily_quest_date = '';
    if (!sessionData._daily_quest_play_date) sessionData._daily_quest_play_date = '';
    if (!sessionData._daily_quest_play_times) sessionData._daily_quest_play_times = {};
    if (!sessionData._daily_quest_clear_ids) sessionData._daily_quest_clear_ids = [];
    if (!sessionData._ad_view_times) sessionData._ad_view_times = {};
    if (!sessionData._compensation_gift_date) {
      sessionData._compensation_gift_date = new Date().toISOString().split('T')[0];
    }
    if (!sessionData.userNumber) {
      // Deterministic 9-digit id (reTB serves it as the transfer User ID, so it
      // must not change between conversions).
      let h = 2166136261;
      for (let i = 0; i < userid.length; i++) {
        h ^= userid.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      sessionData.userNumber = String(100000000 + (h >>> 0) % 900000000);
    }
    if (!sessionData.migrationID) sessionData.migrationID = '';
    if (!sessionData.migrationPassword) sessionData.migrationPassword = '';
    if (!sessionData.changeUsernameDate) sessionData.changeUsernameDate = Number(now);

    const pendingMsgs = [];
    if (acc.messages) {
      Object.entries(acc.messages).forEach(([mid, mval]) => {
        if (typeof mval === 'object' && mval !== null) {
          const gifts = {};
          if (mval.coins) gifts.coins = mval.coins;
          if (mval.free_energy) gifts.energy = mval.free_energy;
          if (mval.items) {
            gifts.item = Object.entries(mval.items).map(([k, v]) => ({ id: parseInt(k, 10), num: v }));
          }
          pendingMsgs.push({
            id: String(mval.id || mid),
            date: mval.date || now,
            read: mval.read || false,
            daysLast: mval.days_last || 30,
            gifts,
            messages: mval.messages || { default: 'Gift', en: 'Gift', ja: 'Gift' }
          });
        }
      });
    }
    sessionData.pending_messages = pendingMsgs;
    sessionData._message_id_seq = pendingMsgs.length;

    const tables = {
      users: {
        keycol: 'userid',
        cols: ['userid', 'username', 'level', 'country_id', 'country_code', 'created_at', 'last_login', 'last_login_date', 'login_days', 'consecutive_login_days', 'np_bonus_day', 'updated'],
        rows: [[userid, username, 1, 1, 'US', Math.floor(ud.lastupdate || now), now, new Date().toISOString().split('T')[0], acc.login_bonus_total_days || 1, acc.login_bonus_consecutive_days || 1, 7, now]]
      },
      user_valuables: {
        keycol: 'userid',
        cols: ['userid', 'coins', 'stamina', 'max_stamina', 'max_free_energy', 'energy_art_time', 'refill_interval', 'refill_cost', 'valuables_raw', 'updated'],
        rows: [[userid, coins, 20, 20, freeEnergy > 0 ? freeEnergy : 999, 0, 60, 1, '0', now]]
      },
      user_progression: {
        keycol: 'userid',
        cols: ['userid', 'chapter', 'section', 'max_parties', 'record_json', 'achievement_json', 'quest_clear_date_json', 'updated'],
        rows: [[
          userid,
          0,
          0,
          15,
          '[]',
          JSON.stringify((typeof ud.achievement === 'object' && ud.achievement !== null && !Array.isArray(ud.achievement)) ? ud.achievement : {}),
          JSON.stringify((typeof ud.questClearDate === 'object' && ud.questClearDate !== null && !Array.isArray(ud.questClearDate)) ? ud.questClearDate : {}),
          now
        ]]
      },
      user_misc: {
        keycol: 'userid',
        cols: ['userid', 'messages_json', 'multiple_flags_json', 'extra_json', 'updated'],
        rows: [[userid, JSON.stringify(pendingMsgs), '{}', '{}', now]]
      },
      session: {
        keycol: 'key',
        cols: ['key', 'data', 'updated'],
        rows: [[userid, coerceJsonDoubles(JSON.stringify(sessionData)), now]]
      },
      characters: {
        keycol: 'userid',
        cols: ['userid', 'chr_id', 'luck', 'sb', 'job_id', 'job_levels', 'updated'],
        rows: charRows
      }
    };

    const totalRows = Object.values(tables).reduce((sum, t) => sum + (t.rows ? t.rows.length : 0), 0);

    return {
      source_format: 'liminal',
      target_format: 'retb',
      suggested_filename: `tb-save-${username}-${now}.json`,
      data: {
        format: 'retb-save/1',
        generator: 'terra-tools/2',
        userid,
        username,
        label: username,
        created: now,
        tables,
        rows: totalRows
      }
    };
  } else if (sourceFormat === 'retb' && targetFmt === 'liminal') {
    let userid = data.userid || (data.tables?.users?.rows?.[0]?.[0]) || '';
    if (!userid) {
      userid = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();
    }
    const username = data.username || 'Player';
    const tables = data.tables || {};

    let sessionData = {};
    const sessionRow = tables.session?.rows?.[0];
    if (sessionRow && sessionRow[1]) {
      try {
        sessionData = typeof sessionRow[1] === 'string' ? JSON.parse(sessionRow[1]) : sessionRow[1];
      } catch (e) {
        sessionData = {};
      }
    }

    const ud = JSON.parse(JSON.stringify(sessionData || {}));

    // Liminal Gate reads the LOWERCASE lastupdate key; the ReTB session only
    // carries the camelCase lastUpdate spelling.
    if (typeof ud.lastupdate !== 'number') {
      ud.lastupdate = typeof ud.lastUpdate === 'number' ? ud.lastUpdate : 1.0;
    }

    // Sync currencies
    if (ud.valuables) {
      if (ud.valuables.coins !== undefined && ud.coins === undefined) ud.coins = ud.valuables.coins;
      if (ud.valuables.freeEnergy !== undefined && ud.freeEnergy === undefined) ud.freeEnergy = ud.valuables.freeEnergy;
      if (ud.valuables.energy !== undefined && ud.energy === undefined) ud.energy = ud.valuables.energy;
    }

    if (!ud.chrdata || ud.chrdata.length === 0) {
      const chrRows = tables.characters?.rows || [];
      ud.chrdata = chrRows.map(r => {
        let jl = r[5];
        if (typeof jl === 'string') {
          try { jl = JSON.parse(jl); } catch (e) { jl = [1, 0, 0]; }
        }
        return {
          buddy: 0,
          date: 0.0,
          flags: 1,
          id: r[1],
          jobID: r[4] || 0,
          jobLevels: Array.isArray(jl) ? jl : [1.0, 0.0, 0.0],
          jobSlots: [0.0, 0.0, 0.0],
          luck: r[2] || 0,
          skillBoost: r[3] || 0
        };
      });
    }

    // Format buddyInfo for Liminal Gate: record is a LIST of best-copy entries
    const retbBuddy = ud.buddyInfo;
    if (Array.isArray(retbBuddy)) {
      ud.buddyInfo = {
        list: retbBuddy,
        record: buildLiminalRecord(retbBuddy, ud._buddy_compendium)
      };
    } else if (typeof retbBuddy === 'object' && retbBuddy !== null) {
      ud.buddyInfo = retbBuddy;
    } else {
      ud.buddyInfo = {
        list: [],
        record: []
      };
    }

    // Default arrays and objects
    if (!ud.itemList) ud.itemList = Array(181).fill(0);
    if (!ud.summonList) ud.summonList = [1, 1, ...Array(14).fill(0)];
    if (!ud.teamMembers) ud.teamMembers = Array(90).fill(0);
    if (!ud.teamMembers_VS) ud.teamMembers_VS = Array(18).fill(0);
    if (!ud.teamBuddies_VS) ud.teamBuddies_VS = Array(18).fill(0);
    if (!ud.questClearDate) ud.questClearDate = {};
    if (!ud.multiplayData) {
      ud.multiplayData = { roomHistory: [], teamData: { teamBuddies: Array(18).fill(0), teamMembers: Array(90).fill(0), teamNo: 1 } };
    }
    if (!ud.valuables) {
      ud.valuables = { coins: ud.coins || 0, energy: 0, freeEnergy: ud.freeEnergy || 0, energyAppStore: 0, energyGooglePlay: 0, energyAndApp: 0 };
    }

    const messages = {};
    if (Array.isArray(ud.pending_messages)) {
      ud.pending_messages.forEach((m, idx) => {
        const mid = String(m.id || idx + 1);
        messages[mid] = {
          character_id: 0,
          coins: m.gifts?.coins || 0,
          companion_id: 0,
          companion_level: 1,
          date: m.date || now,
          days_last: m.daysLast || 30,
          free_energy: m.gifts?.energy || 0,
          id: mid,
          items: {},
          messages: m.messages || { default: 'Gift' },
          read: m.read || false
        };
        if (m.gifts?.item && Array.isArray(m.gifts.item)) {
          m.gifts.item.forEach(it => {
            if (it && it.id) messages[mid].items[String(it.id)] = it.num || 1;
          });
        }
      });
    }

    let loginDays = 1;
    let consecutiveDays = 1;
    if (tables.users?.rows?.[0]) {
      const urow = tables.users.rows[0];
      const ucols = tables.users.cols || [];
      const udict = {};
      ucols.forEach((col, idx) => { udict[col] = urow[idx]; });
      if (udict.login_days) loginDays = udict.login_days;
      if (udict.consecutive_login_days) consecutiveDays = udict.consecutive_login_days;
    }

    const tokenHex = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();

    // Side-world progression carried over from the reTB per-world map
    // (key "0" is the main story, which travels via progressCode).
    const worldProgress = {};
    Object.entries(ud.worldProgressCode || {}).forEach(([k, v]) => {
      if (k !== '0' && Number.isFinite(Number(v))) worldProgress[k] = Number(v);
    });
    if (!Object.keys(worldProgress).length) worldProgress['1'] = 50338049;

    const accountObj = {
      achievement_requests: {},
      active_battle_continue_coins: 0,
      active_generic_story: null,
      active_hunt: null,
      active_hunt_ticket_spent: null,
      active_luck_result: [],
      active_luck_up: [],
      active_world_map_special: null,
      chapter_energy_granted: [],
      chapter_milestones_issued: [],
      claimed_achievements: [],
      daily_quest_clears: {},
      daily_quest_energy_granted: {},
      daily_quest_play_times: {},
      exchange_remaining: {},
      exchange_requests: {},
      exchange_total: 0,
      exchange_week: 0,
      initial_userdata_served: true,
      login_bonus_consecutive_days: consecutiveDays,
      login_bonus_last_utc_day: 0,
      login_bonus_total_days: loginDays,
      message_requests: {},
      messages,
      rebirth_used_material_ids: [],
      released_generic_story: null,
      stage_energy_history: [],
      tutorial_phase: 'free_roam',
      tutorial_requests: {},
      userdata: ud,
      username: ud.username || username,
      username_changed_at: 0.0,
      world_progress: worldProgress
    };

    return {
      source_format: 'retb',
      target_format: 'liminal',
      suggested_filename: `bootstrap-state-${ud.username || username}-${now}.json`,
      data: {
        account_aliases: {},
        accounts: { [userid]: accountObj },
        active_account_id: userid,
        client_hosts: { '127.0.0.1': userid },
        tokens: { [tokenHex]: userid }
      }
    };
  }

  return {
    source_format: sourceFormat,
    target_format: targetFmt,
    suggested_filename: `save-${targetFmt}-${now}.json`,
    data
  };
}

/**
 * Inline save editing: the tab keeps a sparse "edits" overlay and folds it
 * into a deep clone of the source save before conversion, so both the
 * converted output and its suggested filename automatically reflect edits
 * while the loaded file on disk stays untouched.
 */

// Fold companion entries into the ever-owned compendium map (bid -> max lv).
// Keyed by the SPECIES id: per-copy inventory ids grow without bound, point
// past the end of the game's BuddyData table and crash the client when served
// back as buddyInfo.record.
function foldBuddyCompanion(compendium, entries) {
  (Array.isArray(entries) ? entries : []).forEach(entry => {
    let bid;
    let lv = 1;
    if (entry !== null && typeof entry === 'object') {
      bid = Math.floor(Number(entry.bid));
      lv = Math.floor(Number(entry.lv || 1));
    } else {
      bid = Math.floor(Number(entry));
    }
    if (!Number.isFinite(bid) || bid <= 0) return;
    if (!Number.isFinite(lv) || lv < 1) lv = 1;
    const key = String(bid);
    if (!(key in compendium) || lv > compendium[key]) compendium[key] = lv;
  });
}

// Apply level edits / removals keyed by the per-copy iid: an edited level
// replaces the copy's lv, a 0 removes the copy entirely.
function patchBuddyCopies(list, buddyEdits) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach(entry => {
    if (!entry || typeof entry !== 'object') { out.push(entry); return; }
    const e = buddyEdits[entry.iid];
    if (!e) { out.push(entry); return; }
    const lv = Math.floor(Number(e.lv));
    if (!Number.isFinite(lv) || lv <= 0) return;
    out.push({ ...entry, lv: Math.min(99, lv) });
  });
  return out;
}

// Next free per-copy inventory id: the save's own counter when sane, grown
// past every iid already held (hand-edited saves can lag behind).
function nextBuddySeq(list, current) {
  let seq = Math.floor(Number(current));
  if (!Number.isFinite(seq) || seq < 1) seq = 1;
  (Array.isArray(list) ? list : []).forEach(entry => {
    const iid = Math.floor(Number(entry && entry.iid));
    if (Number.isFinite(iid) && iid >= seq) seq = iid + 1;
  });
  return seq;
}

// Append buddyAdds ({bid, lv}) as full inventory copies with fresh iids taken
// from `seq`; returns the extended list and the counter bumped past every id
// written (so later in-game acquisitions never collide).
function appendBuddyAdds(list, buddyAdds, seq) {
  const out = list.slice();
  let nextSeq = seq;
  buddyAdds.forEach(add => {
    const bid = Math.floor(Number(add && add.bid));
    if (!Number.isFinite(bid) || bid <= 0) return;
    const lv = Math.max(1, Math.min(99, Math.floor(Number(add && add.lv) || 1)));
    out.push({ bid, chrID: 0, date: 0, exp: 0, flag: 1, iid: nextSeq, lv });
    nextSeq += 1;
  });
  return { list: out, nextSeq };
}

// Rebuild the liminal buddyInfo wrapper ({list, record}) around an edited
// list: record stays the best-copy-per-species view, preserving ever-owned
// species that only live in the old record (sold / consumed copies).
function rebuildLiminalBuddyInfo(oldInfo, list) {
  const compMap = {};
  const oldRec = (oldInfo && typeof oldInfo === 'object' && !Array.isArray(oldInfo)) ? oldInfo.record : null;
  if (Array.isArray(oldRec)) {
    foldBuddyCompanion(compMap, oldRec);
  } else if (oldRec && typeof oldRec === 'object') {
    // A map-shaped record is already keyed by species id.
    foldBuddyCompanion(compMap, Object.entries(oldRec).map(([k, v]) => (
      (v && typeof v === 'object') ? { bid: Number(k), lv: v.lv } : { bid: Number(k), lv: v }
    )));
  }
  foldBuddyCompanion(compMap, list);
  return { list, record: buildLiminalRecord(list, compMap) };
}
export const EMPTY_SAVE_EDITS = Object.freeze({
  username: '',
  coins: null,
  freeEnergy: null,
  characters: {},
  items: {},
  // Companion copies keyed by their per-copy inventory id (iid); lv 0 removes
  // the copy. buddyAdds appends brand-new copies (each gets a fresh iid).
  buddies: {},
  buddyAdds: []
});

// '' / invalid / negative -> null (= leave the original value untouched).
export function sanitizeCountInput(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export function hasSaveEdits(edits) {
  if (!edits) return false;
  if (edits.username && edits.username.trim()) return true;
  if (edits.coins !== null && edits.coins !== undefined) return true;
  if (edits.freeEnergy !== null && edits.freeEnergy !== undefined) return true;
  if (Object.keys(edits.characters || {}).length > 0) return true;
  if (Object.keys(edits.buddies || {}).length > 0) return true;
  if ((edits.buddyAdds || []).length > 0) return true;
  return Object.keys(edits.items || {}).length > 0;
}

export function applySaveEdits(data, edits, accountId = null) {
  if (!data || typeof data !== 'object' || !hasSaveEdits(edits)) return data;

  const fmt = detectSaveFormat(data);
  if (fmt === 'unknown') return data;

  const next = JSON.parse(JSON.stringify(data));
  const username = (edits.username || '').trim();
  const coins = edits.coins ?? null;
  const freeEnergy = edits.freeEnergy ?? null;
  const charEdits = edits.characters || {};
  const hasCharEdits = Object.keys(charEdits).length > 0;
  const itemEdits = edits.items || {};
  const hasItemEdits = Object.keys(itemEdits).length > 0;
  const buddyEdits = edits.buddies || {};
  const buddyAdds = Array.isArray(edits.buddyAdds) ? edits.buddyAdds : [];
  const hasBuddyEdits = Object.keys(buddyEdits).length > 0 || buddyAdds.length > 0;

  // Edit a companion inventory in place: apply level edits / removals, append
  // new copies (bumping the per-copy iid counter), and fold the result into
  // the ever-owned ledger so newly added species land in the compendium.
  const applyBuddyEditsToList = (buddyList, seqCurrent, onSeq) => {
    const patched = patchBuddyCopies(buddyList, buddyEdits);
    let out = patched;
    if (buddyAdds.length) {
      const res = appendBuddyAdds(patched, buddyAdds, nextBuddySeq(buddyList, seqCurrent));
      out = res.list;
      onSeq(res.nextSeq);
    }
    return out;
  };

  const applyCharEdits = (chrdata) => {
    if (!hasCharEdits || !Array.isArray(chrdata)) return;
    chrdata.forEach(c => {
      const e = c && charEdits[c.id];
      if (!e) return;
      if (e.sb !== null && e.sb !== undefined) c.skillBoost = e.sb;
      if (e.luck !== null && e.luck !== undefined) c.luck = e.luck;
      // Job unlock slots: jobLevels holds (exp << 12) | level wire values, a
      // zero level means the job is locked. Unlock writes a level-1 slot and
      // lock writes 0; locking the equipped job falls back to job 1.
      if (e.jobs && Array.isArray(c.jobLevels)) {
        c.jobLevels = c.jobLevels.map((v, i) => (
          e.jobs[i] === undefined ? v : (e.jobs[i] ? 1 : 0)
        ));
        if (e.jobs[c.jobID] === 0) c.jobID = 0;
      }
    });
  };

  // Grow the list to the full 181 slots and write each edited count into its
  // slot (itemList[slot - 1]); a count of 0 removes the item from the pouch.
  const applyItemEdits = (itemList) => {
    const list = Array.isArray(itemList) ? itemList.slice(0, ITEM_SLOTS) : [];
    while (list.length < ITEM_SLOTS) list.push(0);
    Object.entries(itemEdits).forEach(([k, v]) => {
      const slot = Math.floor(Number(k));
      if (!Number.isFinite(slot) || slot < 1 || slot > ITEM_SLOTS) return;
      list[slot - 1] = Math.max(0, Math.min(ITEM_MAX_STACK, Math.floor(Number(v) || 0)));
    });
    return list;
  };

  if (fmt === 'liminal') {
    const accounts = next.accounts || {};
    const accId = accountId || next.active_account_id || Object.keys(accounts)[0];
    const acc = accounts[accId];
    if (!acc) return data;
    const ud = acc.userdata || (acc.userdata = {});

    if (username) {
      acc.username = username;
      ud.username = username;
    }
    if (coins !== null) {
      ud.coins = coins;
      if (ud.valuables && typeof ud.valuables === 'object') ud.valuables.coins = coins;
    }
    if (freeEnergy !== null) {
      ud.freeEnergy = freeEnergy;
      if (ud.valuables && typeof ud.valuables === 'object') ud.valuables.freeEnergy = freeEnergy;
    }
    applyCharEdits(ud.chrdata);
    if (hasItemEdits) ud.itemList = applyItemEdits(ud.itemList);
    if (hasBuddyEdits) {
      const bi = ud.buddyInfo;
      const buddyList = Array.isArray(bi) ? bi
        : Array.isArray(bi?.list) ? bi.list
        : Array.isArray(bi?.user_companions) ? bi.user_companions
        : [];
      const out = applyBuddyEditsToList(
        buddyList,
        ud.nextCompanionInventoryId ?? ud._buddy_inventory_seq,
        (seq) => { ud.nextCompanionInventoryId = seq; }
      );
      ud.buddyInfo = rebuildLiminalBuddyInfo(bi, out);
    }
  } else {
    const tables = next.tables || {};

    if (username) {
      next.username = username;
      if (tables.users?.rows?.[0]) tables.users.rows[0][1] = username;
    }

    // Session blob is stored as a JSON string row; parse, patch, and write it
    // back through coerceJsonDoubles so integral doubles (chrdata date etc.)
    // survive and the file stays bootable.
    const sessionRow = tables.session?.rows?.[0];
    if (sessionRow && sessionRow[1]) {
      const wasString = typeof sessionRow[1] === 'string';
      let sd = null;
      try {
        sd = wasString ? JSON.parse(sessionRow[1]) : sessionRow[1];
      } catch (err) {
        sd = null;
      }
      if (sd && typeof sd === 'object') {
        if (username) sd.username = username;
        if (coins !== null) {
          if (sd.valuables && typeof sd.valuables === 'object') sd.valuables.coins = coins;
          if ('coins' in sd) sd.coins = coins;
        }
        if (freeEnergy !== null) {
          if (sd.valuables && typeof sd.valuables === 'object') sd.valuables.freeEnergy = freeEnergy;
          if ('freeEnergy' in sd) sd.freeEnergy = freeEnergy;
        }
        applyCharEdits(sd.chrdata);
        if (hasItemEdits) sd.itemList = applyItemEdits(sd.itemList);
        if (hasBuddyEdits) {
          const buddyList = Array.isArray(sd.buddyInfo) ? sd.buddyInfo
            : Array.isArray(sd.buddyInfo?.user_companions) ? sd.buddyInfo.user_companions
            : [];
          const out = applyBuddyEditsToList(
            buddyList,
            sd._buddy_inventory_seq ?? sd.nextCompanionInventoryId,
            (seq) => { sd._buddy_inventory_seq = seq; }
          );
          sd.buddyInfo = out;
          // Ever-owned ledger: normalise legacy list-shaped compendiums to the
          // bid-keyed map the server expects, then fold the edited inventory in
          // (mirrors reTB's sync_buddy_compendium).
          const legacy = Array.isArray(sd._buddy_compendium) ? sd._buddy_compendium : [];
          const comp = (sd._buddy_compendium && typeof sd._buddy_compendium === 'object' && !Array.isArray(sd._buddy_compendium))
            ? sd._buddy_compendium
            : {};
          foldBuddyCompanion(comp, legacy);
          foldBuddyCompanion(comp, out);
          sd._buddy_compendium = comp;
        }
        sessionRow[1] = wasString ? coerceJsonDoubles(JSON.stringify(sd)) : sd;
      }
    }

    // Mirror the currencies into the typed valuables table when present.
    const vrow = tables.user_valuables?.rows?.[0];
    const vcols = tables.user_valuables?.cols || [];
    if (Array.isArray(vrow)) {
      if (coins !== null) {
        const i = vcols.indexOf('coins');
        if (i >= 0) vrow[i] = coins;
      }
      if (freeEnergy !== null) {
        const i = vcols.indexOf('max_free_energy');
        if (i >= 0) vrow[i] = freeEnergy;
      }
    }

    // characters table rows: [userid, chr_id, luck, sb, job_id, job_levels, updated]
    if (hasCharEdits && Array.isArray(tables.characters?.rows)) {
      tables.characters.rows.forEach(r => {
        const e = r && charEdits[r[1]];
        if (!e) return;
        if (e.luck !== null && e.luck !== undefined && r.length > 2) r[2] = e.luck;
        if (e.sb !== null && e.sb !== undefined && r.length > 3) r[3] = e.sb;
        if (e.jobs && r.length > 5) {
          let jl = r[5];
          if (typeof jl === 'string') {
            try { jl = JSON.parse(jl); } catch (err) { jl = null; }
          }
          if (Array.isArray(jl)) {
            r[5] = JSON.stringify(jl.map((v, i) => (
              e.jobs[i] === undefined ? v : (e.jobs[i] ? 1 : 0)
            )));
            if (e.jobs[r[4]] === 0) r[4] = 0;
          }
        }
      });
    }
  }

  return next;
}

