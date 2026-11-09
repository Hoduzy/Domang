/*
 * 이미지 불러오기 + 대체 표시
 *
 * 파일 이름 규칙 (이 이름으로 파일을 넣으면 자동으로 이미지가 보임)
 *   스탠딩       assets/characters/{아이디}_{표정}.png
 *                표정: default, smile, sad, surprised, angry
 *   악몽 속 모습 assets/characters/{아이디}_nightmare.png
 *   배경         assets/backgrounds/{배경키}.png
 *   적           assets/enemies/{적키}.png
 *
 * 이미지가 없으면 색 네모 안에 이름을 글자로 보여준다.
 * 표정 이미지가 없고 default 이미지만 있으면 default를 대신 보여준다.
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
    hallway: '복도',
    classroom: '교실',
    classroom_night: '교실 — 저녁',
    schoolyard: '운동장',
    flowerbed: '학교 뒤 화단',
    library: '도서관',
    nightmare_hallway: '악몽 — 끝없는 복도',
  };

  const PATHS = {
    character: (id, expression = 'default') => `assets/characters/${id}_${expression}.png`,
    nightmare: (id) => `assets/characters/${id}_nightmare.png`,
    background: (key) => `assets/backgrounds/${key}.png`,
    enemy: (key) => `assets/enemies/${key}.png`,
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
    const candidates = [PATHS.character(character.id, expr)];
    if (expr !== 'default') candidates.push(PATHS.character(character.id, 'default'));
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
    picture, standing, nightmare, background, enemy,
  };
})();
