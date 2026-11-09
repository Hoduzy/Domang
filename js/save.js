/*
 * save.js — 게임 저장(진행 상황)과 설정
 *
 * 둘 다 브라우저 localStorage에 자동 저장한다.
 *   진행 상황  shimpyobu.save.v1      내보내기/불러오기 대상
 *   설정       shimpyobu.settings.v1  기기마다 따로 (내보내기에 포함하지 않음)
 *
 * ===== 저장 데이터 구조 (version 1) =====
 * {
 *   version: 1,
 *   createdAt, updatedAt: 밀리초 타임스탬프
 *   progress: {
 *     chapter: 0,              진행 중인 장 (0 = 프롤로그, 1~6 = 각 장)
 *     stage: 1,                그 장에서 진행 중인 스테이지 (프롤로그 1~5, 각 장 1~10)
 *     cleared: { "0": [1, 2] } 장별로 클리어한 스테이지 번호
 *     lastScreen: "room"       마지막으로 있던 화면
 *   },
 *   characters: {
 *     hayun: {
 *       level: 1, exp: 0,
 *       skillLevels: { skill: 1, heart: 1 },  스킬 / 마음 스킬 (극복 스킬은 얻으면 overcome 추가)
 *       dependency: 0                         선생님에 대한 의존도
 *     }, ...
 *   },
 *   bonds: { "hayun+seojin": 0, ... }  부원 두 명 사이의 유대. 아이디를 정해진 순서로 이은 키 (15쌍)
 *   memoryFragments: { hayun: ["fragment_id", ...], ... }  찾은 기억 조각
 *   promises: [                        얻은 약속
 *     { id, type: "smile"|"trust"|"tomorrow", grade: "bronze"|"silver"|"gold",
 *       owner: "hayun", equippedBy: null | "hayun", obtainedAt }
 *   ]
 * }
 */
const Save = (() => {
  const KEY = 'shimpyobu.save.v1';
  const VERSION = 1;
  const FILE_TAG = 'shimpyobu-save';
  const IDS = Assets.CHARACTER_IDS;

  const PROMISE_TYPES = ['smile', 'trust', 'tomorrow'];
  const PROMISE_GRADES = ['bronze', 'silver', 'gold'];

  let current = null; // 메모리에 올라와 있는 저장 데이터

  // ===== 기본값 =====
  function bondKey(a, b) {
    return [a, b].sort((x, y) => IDS.indexOf(x) - IDS.indexOf(y)).join('+');
  }

  function allBondKeys() {
    const keys = [];
    for (let i = 0; i < IDS.length; i++) {
      for (let j = i + 1; j < IDS.length; j++) keys.push(bondKey(IDS[i], IDS[j]));
    }
    return keys;
  }

  function defaultCharacter() {
    return { level: 1, exp: 0, skillLevels: { skill: 1, heart: 1 }, dependency: 0 };
  }

  function createDefault() {
    const now = Date.now();
    const characters = {};
    const memoryFragments = {};
    for (const id of IDS) {
      characters[id] = defaultCharacter();
      memoryFragments[id] = [];
    }
    const bonds = {};
    for (const key of allBondKeys()) bonds[key] = 0;
    return {
      version: VERSION,
      createdAt: now,
      updatedAt: now,
      progress: { chapter: 0, stage: 1, cleared: {}, lastScreen: 'room' },
      characters,
      bonds,
      memoryFragments,
      promises: [],
    };
  }

  // ===== 검증: 빠지거나 잘못된 값은 기본값으로 채운다 =====
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const num = (v, fallback, min = -Infinity, max = Infinity) =>
    (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
  const int = (v, fallback, min, max) => Math.round(num(v, fallback, min, max));

  function normalize(raw) {
    if (!isObj(raw)) throw new Error('저장 데이터 형식이 아니에요.');
    if (typeof raw.version === 'number' && raw.version > VERSION) {
      throw new Error('더 새로운 버전의 게임에서 만든 저장 파일이에요.');
    }
    const d = createDefault();
    d.createdAt = num(raw.createdAt, d.createdAt);
    d.updatedAt = num(raw.updatedAt, d.updatedAt);

    const p = isObj(raw.progress) ? raw.progress : {};
    d.progress.chapter = int(p.chapter, 0, 0, 6);
    d.progress.stage = int(p.stage, 1, 1, d.progress.chapter === 0 ? 5 : 10);
    if (isObj(p.cleared)) {
      for (const [ch, list] of Object.entries(p.cleared)) {
        if (/^[0-6]$/.test(ch) && Array.isArray(list)) {
          d.progress.cleared[ch] = [...new Set(list.filter((n) => Number.isInteger(n) && n >= 1 && n <= 10))].sort((a, b) => a - b);
        }
      }
    }
    if (typeof p.lastScreen === 'string') d.progress.lastScreen = p.lastScreen;

    const chars = isObj(raw.characters) ? raw.characters : {};
    for (const id of IDS) {
      const c = isObj(chars[id]) ? chars[id] : {};
      const out = d.characters[id];
      out.level = int(c.level, 1, 1, 999);
      out.exp = int(c.exp, 0, 0);
      out.dependency = int(c.dependency, 0, 0);
      if (isObj(c.skillLevels)) {
        for (const [skill, lv] of Object.entries(c.skillLevels)) {
          out.skillLevels[skill] = int(lv, 1, 1, 99);
        }
      }
    }

    const bonds = isObj(raw.bonds) ? raw.bonds : {};
    for (const key of Object.keys(d.bonds)) d.bonds[key] = int(bonds[key], 0, 0);

    const frags = isObj(raw.memoryFragments) ? raw.memoryFragments : {};
    for (const id of IDS) {
      if (Array.isArray(frags[id])) {
        d.memoryFragments[id] = [...new Set(frags[id].filter((f) => typeof f === 'string'))];
      }
    }

    if (Array.isArray(raw.promises)) {
      d.promises = raw.promises
        .filter((pr) => isObj(pr) && PROMISE_TYPES.includes(pr.type) && PROMISE_GRADES.includes(pr.grade) && IDS.includes(pr.owner))
        .map((pr, i) => ({
          id: typeof pr.id === 'string' ? pr.id : `promise_${i + 1}`,
          type: pr.type,
          grade: pr.grade,
          owner: pr.owner,
          equippedBy: IDS.includes(pr.equippedBy) ? pr.equippedBy : null,
          obtainedAt: num(pr.obtainedAt, d.createdAt),
        }));
    }
    return d;
  }

  // ===== localStorage =====
  function write() {
    if (!current) return false;
    current.updatedAt = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify(current));
      return true;
    } catch (e) {
      console.warn('저장 실패', e);
      return false;
    }
  }

  function readStored() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? normalize(JSON.parse(raw)) : null;
    } catch (e) {
      console.warn('저장 데이터를 읽지 못함', e);
      return null;
    }
  }

  // 앱을 닫거나 다른 앱으로 넘어갈 때도 한 번 더 저장
  window.addEventListener('pagehide', write);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') write();
  });

  // ===== 내보내기 / 불러오기 =====
  function exportFile() {
    if (!current) throw new Error('내보낼 저장 데이터가 없어요.');
    write();
    const payload = { format: FILE_TAG, exportedAt: new Date().toISOString(), save: current };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const name = `shimpyobu-save-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return name;
  }

  /** 파일 내용을 검증만 하고 돌려준다. 적용은 apply()로. */
  function parseFile(text) {
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error('JSON 파일이 아니에요.');
    }
    if (isObj(json) && json.format === FILE_TAG) return normalize(json.save);
    if (isObj(json) && 'progress' in json && 'characters' in json) return normalize(json);
    throw new Error('쉼표부 저장 파일이 아니에요.');
  }

  return {
    VERSION, PROMISE_TYPES, PROMISE_GRADES,
    bondKey, createDefault, normalize,

    /** 저장된 데이터가 있는지 */
    exists: () => readStored() !== null,
    /** 저장된 데이터를 불러와 현재 데이터로 삼는다 */
    load() { current = readStored(); return current; },
    /** 새 게임 */
    startNew() { current = createDefault(); write(); return current; },
    /** 불러온 파일 데이터를 현재 데이터로 적용 */
    apply(data) { current = normalize(data); write(); return current; },
    /** 현재 데이터 (게임 중이 아니면 null) */
    get data() { return current; },
    /** 현재 데이터를 고치고 바로 저장. 예: Save.update(d => { d.progress.stage = 2; }) */
    update(fn) {
      if (!current) return null;
      fn(current);
      write();
      return current;
    },
    clear() {
      current = null;
      try { localStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
    },
    exportFile,
    parseFile,
  };
})();

const Settings = (() => {
  const KEY = 'shimpyobu.settings.v1';
  const DEFAULTS = {
    textSpeed: 3,   // 대사 속도 1(느림) ~ 5(빠름)
    bgmVolume: 70,  // 배경음 크기 0 ~ 100
    sfxVolume: 70,  // 효과음 크기 0 ~ 100
  };
  const RANGES = {
    textSpeed: [1, 5],
    bgmVolume: [0, 100],
    sfxVolume: [0, 100],
  };
  const TEXT_SPEED_LABELS = ['', '아주 느림', '느림', '보통', '빠름', '아주 빠름'];

  function clamp(key, v) {
    const [min, max] = RANGES[key];
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : DEFAULTS[key];
  }

  let values = { ...DEFAULTS };
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    for (const key of Object.keys(DEFAULTS)) {
      if (key in stored) values[key] = clamp(key, stored[key]);
    }
  } catch (e) { /* 기본값 사용 */ }

  const listeners = new Set();

  return {
    DEFAULTS, RANGES, TEXT_SPEED_LABELS,
    get(key) { return values[key]; },
    all() { return { ...values }; },
    set(key, v) {
      if (!(key in DEFAULTS)) return;
      values[key] = clamp(key, v);
      try { localStorage.setItem(KEY, JSON.stringify(values)); } catch (e) { /* 무시 */ }
      listeners.forEach((fn) => fn(key, values[key]));
    },
    /** 값이 바뀔 때 알림 받기 (배경음/효과음 재생기에서 사용) */
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
