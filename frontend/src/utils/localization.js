import { speciesTranslations } from './constants';

export function getLocalizedString(stringObj, fallback = '-') {
  if (!stringObj) return fallback;
  // lang is passed in or defaults to 'en'
  return stringObj.__currentLang || stringObj['en'] || stringObj['ja'] || fallback;
}

// A version that takes lang explicitly (preferred in React)
export function loc(stringObj, lang = 'en', fallback = '-') {
  if (!stringObj) return fallback;
  if (typeof stringObj === 'string') return stringObj;
  return stringObj[lang] || stringObj['en'] || stringObj['ja'] || fallback;
}

/**
 * Return the localized story subtitle/flavor text for a main story section (Chapters 1-42).
 * Indices 57-454 in strings.scenarioSet map 1:1 to Chapters 1-42 sections.
 */
export function getSectionSubtitle(chapterNo, secNum, lang = 'en', strings) {
  if (!strings?.scenarioSet || !chapterNo || !secNum) return null;
  const ch = Number(chapterNo);
  const sec = Number(secNum);
  if (ch >= 1 && ch <= 42 && sec >= 1) {
    let base;
    if (ch === 1) base = 57;
    else if (ch === 2) base = 62;
    else if (ch === 3) base = 67;
    else base = 72 + (ch - 4) * 10;

    const idx = base + (sec - 1);
    const entry = strings.scenarioSet[idx];
    if (entry) {
      return entry[lang] || entry['en'] || entry['ja'] || '';
    }
  }
  return null;
}

import { translateStageTitleFallback } from './stageTranslations';

export function translateStageTitle(titleOrSec, lang = 'en', strings, chapterNo, secNum) {
  if (!titleOrSec && !chapterNo) return 'Section Details';

  // Support passing section object directly
  if (typeof titleOrSec === 'object' && titleOrSec !== null) {
    if (titleOrSec.title_loc) {
      return loc(titleOrSec.title_loc, lang, titleOrSec.title);
    }
    chapterNo = chapterNo || titleOrSec.chapter || titleOrSec.chapter_no;
    secNum = secNum || titleOrSec.section_index || titleOrSec.sec_num;
    titleOrSec = titleOrSec.title || titleOrSec.section_title || '';
  }

  // If chapterNo and secNum are known for main story (1-42)
  const ch = Number(chapterNo);
  const sec = Number(secNum);
  if (ch >= 1 && ch <= 42 && sec >= 1) {
    const sub = getSectionSubtitle(ch, sec, lang, strings);
    return sub ? `Stage ${ch}-${sec}: ${sub}` : `Stage ${ch}-${sec}`;
  }

  if (!titleOrSec) {
    return ch && sec ? `Stage ${ch}-${sec}` : 'Section Details';
  }

  // If lang is Japanese, return original raw string
  if (lang === 'ja') return String(titleOrSec);

  return translateStageTitleFallback(titleOrSec);
}



