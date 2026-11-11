/*
 * 이미지 불러오기 + 대체 표시
 *
 * 파일 이름 규칙 (이 이름으로 파일을 넣으면 자동으로 이미지가 보임)
 *   스탠딩       assets/characters/{아이디}_{표정}.png
 *                표정: default, smile, sad, surprised, angry
 *   악몽 속 모습 assets/characters/{아이디}_nightmare.png
 *   배경         assets/backgrounds/{배경키}.png
 *   적           assets/enemies/{이미지 키}.png  (enemies.json 의 images)
 *   CG           assets/cg/{키}.png
 *   아이콘       assets/ui/{키}.png  (skill_아이디_basic, promise_smile_gold, cmd_stay, act_study …)
 *
 * 이미지가 없으면 색 네모 안에 이름을 글자로 보여준다.
 * 그 표정 이미지가 없으면 default, 그다음 다른 표정 중 있는 것을 대신 보여준다.
 */
const Assets = (() => {
  const CHARACTER_IDS = ['hayun', 'seoyeon', 'dahyeon', 'yuna', 'jiyu', 'eunchae'];
  const EXPRESSIONS = ['default', 'smile', 'sad', 'surprised', 'angry'];
  const EXPRESSION_LABELS = {
    default: '기본', smile: '웃음', sad: '슬픔', surprised: '놀람', angry: '화남',
  };

  // 배경키 → 대체 표시에 쓸 한글 이름. 목록에 없는 키도 그대로 쓸 수 있다.
  const BACKGROUNDS = {
    staff_room: '교무실',
    club_room: '부실',
    club_room_rain: '부실 — 비 오는 저녁',
    club_room_dark: '부실 — 정전',
    hallway: '복도',
    classroom: '교실',
    classroom_night: '교실 — 저녁',
    field: '운동장',
    garden: '학교 뒤 화단',
    ch1_classroom: '악몽 — 끝없는 교실',
    ch1_erased: '악몽 — 지워지는 교실',
    library: '도서관',
    nightmare_hallway: '악몽 — 끝없는 복도',
  };

  const PATHS = {
    character: (id, expression = 'default') => `assets/characters/${id}_${expression}.png`,
    nightmare: (id) => `assets/characters/${id}_nightmare.png`,
    background: (key) => `assets/backgrounds/${key}.png`,
    enemy: (key) => `assets/enemies/${key}.png`,
    cg: (key) => `assets/cg/${key}.png`,
    ui: (key) => `assets/ui/${key}.png`,
  };

  // 같은 파일을 여러 번 확인하지 않도록 결과를 기억해 둔다. url → Promise<boolean>
  const probeCache = new Map();
  const known = new Map();   // url → true(불러옴) / false(없음)
  const keep = new Map();    // 불러온 이미지를 메모리에 붙잡아 둔다 (다시 그릴 때 바로 나오게)

  function probe(url) {
    if (!probeCache.has(url)) {
      probeCache.set(url, new Promise((resolve) => {
        const img = new Image();
        const done = (ok) => { known.set(url, ok); if (ok) keep.set(url, img); resolve(ok); };
        img.onload = () => {
          // 디코딩까지 끝낸 뒤에 '불러옴'으로 친다 (나타날 때 끊기지 않게)
          if (img.decode) img.decode().then(() => done(true), () => done(true));
          else done(true);
        };
        img.onerror = () => done(false);
        img.src = url;
      }));
    }
    return probeCache.get(url);
  }

  /** 후보 목록 중 지금 바로 알 수 있는 결과: 'ok' + url / 'fail' / null(아직 모름) */
  function settled(candidates) {
    for (const url of candidates) {
      const k = known.get(url);
      if (k === true) return { ok: true, url };
      if (k === undefined) return null;
    }
    return { ok: false };
  }

  /** 후보를 순서대로 확인해 처음 있는 파일 url (없으면 null) */
  async function firstOf(candidates) {
    for (const url of candidates) if (await probe(url)) return url;
    return null;
  }

  const asList = (x) => (Array.isArray(x) ? x : [x]);

  /**
   * 미리 불러오기. items 는 url 또는 후보 url 목록들의 배열.
   * 아직 모르는 것만 불러오고, 진행 상황을 onProgress(done, total) 로 알려준다.
   * 너무 오래 걸리면 timeout 뒤에 그냥 넘어간다.
   */
  function preload(items, { onProgress, timeout = 10000 } = {}) {
    const lists = items.filter(Boolean).map(asList).filter((c) => c.length && !settled(c));
    if (!lists.length) return Promise.resolve();
    let n = 0;
    const all = Promise.all(lists.map((c) => firstOf(c).then(() => { n += 1; if (onProgress) onProgress(n, lists.length); })));
    return Promise.race([all, new Promise((r) => setTimeout(r, timeout))]);
  }

  /**
   * 그림 아래쪽 빈 여백과 발 위치를 잰다 (불러온 그림의 알파값으로).
   * { w, h, footPad: 아래 여백 / 높이, footX: 발 가운데 / 너비 }
   */
  const measureCache = new Map();
  const alphaMaps = new Map();
  /** 그림 안의 비율 좌표(0~1)가 보이는 픽셀인지. 모르면 true */
  function opaqueAt(url, fx, fy) {
    measure(url);
    const m = alphaMaps.get(url);
    if (!m) return true;
    if (fx < 0 || fy < 0 || fx >= 1 || fy >= 1) return false;
    const x0 = Math.floor(fx * m.cw);
    const y0 = Math.floor(fy * m.ch);
    // 손가락 크기만큼 주변 몇 칸도 본다
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (x >= 0 && y >= 0 && x < m.cw && y < m.ch && m.alpha[y * m.cw + x] > 40) return true;
      }
    }
    return false;
  }

  function measure(url) {
    if (measureCache.has(url)) return measureCache.get(url);
    const img = keep.get(url);
    if (!img) return null;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    let res = { w, h, footPad: 0, headPad: 0, footX: 0.5 };
    try {
      // 계산은 줄인 크기로 (빠르게)
      const k = Math.min(1, 600 / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * k));
      const ch = Math.max(1, Math.round(h * k));
      const cv = document.createElement('canvas');
      cv.width = cw;
      cv.height = ch;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, cw, ch);
      const a = g.getImageData(0, 0, cw, ch).data;
      // 투명하지 않은 픽셀 (가장자리의 아주 옅은 잔티는 뺀다)
      const solid = (x, y) => a[(y * cw + x) * 4 + 3] > 24;
      // 가장 아래 줄 = 발끝, 가장 위 줄 = 머리 끝
      let bottom = ch - 1;
      outer: for (; bottom >= 0; bottom--) for (let x = 0; x < cw; x++) if (solid(x, bottom)) break outer;
      let top = 0;
      outerTop: for (; top < ch; top++) for (let x = 0; x < cw; x++) if (solid(x, top)) break outerTop;
      // 발 = 맨 아래에서 높이의 5% 띠 안의 불투명한 부분 가운데
      const band = Math.max(1, Math.round(ch * 0.05));
      let sum = 0;
      let n = 0;
      for (let y = Math.max(0, bottom - band); y <= bottom; y++) for (let x = 0; x < cw; x++) if (solid(x, y)) { sum += x; n += 1; }
      res = { w, h, footPad: (ch - 1 - bottom) / ch, headPad: Math.min(top, bottom) / ch, footX: n ? sum / n / cw : 0.5 };
      // 누른 곳이 그림의 보이는 부분인지 알아보기 위한 작은 알파 지도
      const alpha = new Uint8Array(cw * ch);
      for (let i = 0; i < cw * ch; i++) alpha[i] = a[i * 4 + 3];
      alphaMaps.set(url, { cw, ch, alpha });
    } catch (e) { /* 캔버스를 못 쓰면 여백 0으로 */ }
    measureCache.set(url, res);
    return res;
  }

  /** 아직 불러오지 않은 것이 있는지 */
  function needsLoading(items) {
    return items.filter(Boolean).map(asList).some((c) => c.length && !settled(c));
  }

  // 배경색 밝기에 맞춰 글자색을 고른다.
  function textColorFor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#fff';
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#1b1b1f' : '#ffffff';
  }

  // 키 문자열로 차분한 색을 하나 만든다 (배경·적 대체 표시용).
  function colorFromKey(key) {
    let h = 0;
    for (const ch of String(key)) h = (h * 31 + ch.codePointAt(0)) % 360;
    return `hsl(${h}, 22%, 28%)`;
  }

  /**
   * 이미지 요소를 만든다. 대체 표시를 먼저 보여주고,
   * candidates 중 처음으로 존재하는 파일을 찾으면 이미지로 바꾼다.
   */
  function picture({ candidates, name, sub = '', color, className = '' }) {
    const el = document.createElement('div');
    el.className = `pic ${className}`.trim();

    const ph = document.createElement('div');
    ph.className = 'pic-placeholder';
    const bg = color || colorFromKey(name);
    ph.style.setProperty('--ph-color', bg);
    ph.style.setProperty('--ph-text', bg.startsWith('#') ? textColorFor(bg) : '#fff');

    const nameEl = document.createElement('div');
    nameEl.className = 'ph-name';
    nameEl.textContent = name;
    ph.appendChild(nameEl);
    if (sub) {
      const subEl = document.createElement('div');
      subEl.className = 'ph-sub';
      subEl.textContent = sub;
      ph.appendChild(subEl);
    }
    const fileEl = document.createElement('div');
    fileEl.className = 'ph-file';
    fileEl.textContent = candidates[0].split('/').pop();
    ph.appendChild(fileEl);
    el.appendChild(ph);

    // 대체 표시는 모든 후보를 불러오지 못했을 때만(.failed). 불러오는 중에는 비워 둔다
    const show = (url, fade) => {
      const img = document.createElement('img');
      img.src = url;
      img.alt = name;
      img.draggable = false;
      if (fade) img.className = 'fade-in';
      el.appendChild(img);
      el.classList.add('loaded');
    };
    const now = settled(candidates);
    if (now && now.ok) show(now.url, false);
    else if (now) el.classList.add('failed');
    else {
      el.classList.add('pending');
      firstOf(candidates).then((url) => {
        el.classList.remove('pending');
        if (url) show(url, true);
        else el.classList.add('failed');
      });
    }

    return el;
  }

  // ===== 자주 쓰는 모양 =====
  // character: characters.json의 항목 ({ id, name, color })

  function standing(character, expression = 'default', className = 'standing') {
    const expr = EXPRESSIONS.includes(expression) ? expression : 'default';
    // 그 표정이 없으면 기본 → 나머지 표정 순서로 있는 그림을 쓴다
    const order = [expr, 'default', ...EXPRESSIONS.filter((e) => e !== expr && e !== 'default')];
    const candidates = order.map((e) => PATHS.character(character.id, e));
    return picture({
      candidates,
      name: character.name,
      sub: EXPRESSION_LABELS[expr],
      color: character.color,
      className,
    });
  }

  function nightmare(character, className = 'nightmare') {
    return picture({
      candidates: [PATHS.nightmare(character.id)],
      name: character.name,
      sub: '악몽 속 모습',
      color: character.color,
      className,
    });
  }

  function background(key) {
    return picture({
      candidates: [PATHS.background(key)],
      name: BACKGROUNDS[key] || key,
      sub: '배경',
      className: 'fit-cover',
    });
  }

  // ===== 프리로드용 후보 목록 (화면 요소와 같은 순서) =====
  const EXPR_ORDER = (expr) => {
    const e = EXPRESSIONS.includes(expr) ? expr : 'default';
    return [e, 'default', ...EXPRESSIONS.filter((x) => x !== e && x !== 'default')];
  };
  const URLS = {
    standing: (id, expr = 'default') => EXPR_ORDER(expr).map((e) => PATHS.character(id, e)),
    face: (id) => ['default', 'smile', ...EXPRESSIONS.filter((e) => e !== 'default' && e !== 'smile')].map((e) => PATHS.character(id, e)),
    nightmare: (id) => [PATHS.nightmare(id)],
    sd: (id) => [`assets/characters/${id}_sd.png`, PATHS.nightmare(id)],
    sheet: (id, kind) => [`assets/characters/${id}_${kind}.png`],
    background: (key) => [PATHS.background(key)],
    cg: (key) => [PATHS.cg(key)],
    enemy: (key) => [PATHS.enemy(key)],
    ui: (key) => [PATHS.ui(key)],
  };

  /** 얼굴 아이콘: 기본 스탠딩의 머리 부분을 확대해 보여준다 */
  function face(character, className = 'face') {
    const order = ['default', 'smile', ...EXPRESSIONS.filter((e) => e !== 'default' && e !== 'smile')];
    return picture({
      candidates: order.map((e) => PATHS.character(character.id, e)),
      name: character.name.slice(0, 1),
      color: character.color,
      className: `face ${className}`,
    });
  }

  /** 전투용 뒷모습 SD. 없으면 악몽 속 모습 → 대체 표시 */
  function sd(character, className = 'sd') {
    return picture({
      candidates: [`assets/characters/${character.id}_sd.png`, PATHS.nightmare(character.id)],
      name: character.name,
      sub: 'SD',
      color: character.color,
      className,
    });
  }

  /**
   * 동작 시트 애니메이션 (아이디_attack / _skill / _heart).
   * data/sprites.json 의 frames, frameWidth, frameHeight 를 쓴다. 시트가 없으면 null.
   * 돌려준 요소의 play() 는 한 번 재생이 끝나면 resolve 된다.
   */
  function sprite(id, kind, frameMs = 90) {
    const key = `${id}_${kind}`;
    const meta = (Game.data.sprites || {})[key];
    if (!meta) return null;
    const url = `assets/characters/${key}.png`;
    const el = document.createElement('div');
    el.className = 'sprite';
    el.meta = meta;
    el.style.backgroundImage = `url("${url}")`;
    el.style.backgroundSize = `${meta.frames * 100}% 100%`;
    el.url = url;
    el.play = (onFrame) => probe(url).then((ok) => new Promise((resolve) => {
      if (!ok) return resolve(false);
      let i = 0;
      const step = () => {
        el.style.backgroundPosition = `${(i / (meta.frames - 1)) * 100}% 0`;
        if (onFrame) onFrame(i);
        i += 1;
        if (i < meta.frames) setTimeout(step, frameMs * (typeof BattleTiming !== 'undefined' ? BattleTiming.scale : 1));
        else setTimeout(() => resolve(true), frameMs);
      };
      step();
    }));
    return el;
  }

  /** CG (여러 명이 나오는 장면 그림). 배경처럼 화면을 채운다 */
  function cg(key) {
    return picture({
      candidates: [PATHS.cg(key)],
      name: key,
      sub: 'CG',
      className: 'fit-cover',
    });
  }

  /** 아이콘 하나 (assets/ui). 없으면 아무것도 보이지 않는 빈 칸 */
  function icon(key, className = 'icon') {
    const el = document.createElement('span');
    el.className = `ui-icon ${className}`.trim();
    const url = PATHS.ui(key);
    const show = (fade) => {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.draggable = false;
      if (fade) img.className = 'fade-in';
      el.appendChild(img);
      el.classList.add('loaded');
    };
    const k = known.get(url);
    if (k === true) show(false);
    else if (k === false) el.classList.add('failed');
    else probe(url).then((ok) => { if (ok) show(true); else el.classList.add('failed'); });
    return el;
  }

  /** key 는 이미지 키 또는 이미지 키 목록 (목록이면 index 번째) */
  function enemy(key, name, className = 'enemy') {
    return picture({
      candidates: [PATHS.enemy(key)],
      name: name || key,
      sub: '적',
      className,
    });
  }

  // ----- 게이지: 틀(가로 3분할로 늘어남) + 수치만큼 잘린 막대 -----
  // kind: hp, heart, exp, dep, bond, stamina. set(0~1) 로 바꾼다.
  function gauge(kind, frac = 0, className = '') {
    const box = document.createElement('div');
    box.className = `gauge g-${kind} ${className}`.trim();
    box.appendChild(document.createElement('i'));
    box.set = (f) => { box.style.setProperty('--f', String(Math.max(0, Math.min(1, Number(f) || 0)))); };
    box.set(frac);
    return box;
  }

  // ----- 숫자 그림: digit_0 ~ digit_9 를 이어 붙인다 -----
  function digits(text, className = '') {
    const box = document.createElement('span');
    box.className = `digits ${className}`.trim();
    box.setAttribute('aria-label', String(text));
    for (const ch of String(text)) {
      if (/\d/.test(ch)) {
        const img = document.createElement('img');
        img.src = PATHS.ui(`digit_${ch}`);
        img.alt = '';
        img.draggable = false;
        box.appendChild(img);
      } else {
        box.appendChild(Object.assign(document.createElement('span'), { className: 'digits-sign', textContent: ch }));
      }
    }
    return box;
  }

  // ----- 그림 위에 글자: 상태 꼬리표, 등급 배지 -----
  function labeled(key, text, className = '') {
    const box = document.createElement('span');
    box.className = `img-label ${className}`.trim();
    // 사용자 속성 속 url() 은 css 파일 기준으로 풀리므로 절대 주소로 넣는다
    box.style.setProperty('--img', `url("${new URL(PATHS.ui(key), document.baseURI).href}")`);
    box.appendChild(Object.assign(document.createElement('span'), { className: 'img-label-text', textContent: text }));
    return box;
  }

  return {
    CHARACTER_IDS, EXPRESSIONS, BACKGROUNDS, PATHS,
    URLS, preload, needsLoading, probe, firstOf, measure, opaqueAt,
    picture, standing, nightmare, face, sd, sprite, background, enemy, cg, icon,
    gauge, digits, labeled,
  };
})();
