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

  function probe(url) {
    if (!probeCache.has(url)) {
      probeCache.set(url, new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      }));
    }
    return probeCache.get(url);
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

    (async () => {
      for (const url of candidates) {
        if (await probe(url)) {
          const img = document.createElement('img');
          img.src = url;
          img.alt = name;
          img.draggable = false;
          el.appendChild(img);
          el.classList.add('loaded');
          return;
        }
      }
    })();

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
    el.play = () => probe(url).then((ok) => new Promise((resolve) => {
      if (!ok) return resolve(false);
      let i = 0;
      const step = () => {
        el.style.backgroundPosition = `${(i / (meta.frames - 1)) * 100}% 0`;
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
    probe(PATHS.ui(key)).then((ok) => {
      if (!ok) return;
      const img = document.createElement('img');
      img.src = PATHS.ui(key);
      img.alt = '';
      img.draggable = false;
      el.appendChild(img);
      el.classList.add('loaded');
    });
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

  return {
    CHARACTER_IDS, EXPRESSIONS, BACKGROUNDS, PATHS,
    picture, standing, nightmare, face, sd, sprite, background, enemy, cg, icon,
  };
})();
