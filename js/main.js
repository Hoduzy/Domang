/*
 * main.js — 화면 비율 맞추기, 화면 전환, 저장
 *
 * 화면은 Game.registerScreen(id, { title, render }) 로 등록한다.
 * render(screen, params) 는 Game.buildScreen()으로 만든 틀에 내용을 채운다.
 * 다른 화면으로 갈 때는 Game.go(id, params).
 */
const Game = (() => {
  const STAGE_W = 1920;
  const STAGE_H = 1080;

  const screens = {};
  const data = { characters: [] };
  let stageEl = null;
  let currentId = null;

  // ===== 화면 크기에 맞춰 16:9 무대 확대/축소 =====
  function fitStage() {
    const vv = window.visualViewport;
    const w = vv ? vv.width : window.innerWidth;
    const h = vv ? vv.height : window.innerHeight;
    const scale = Math.min(w / STAGE_W, h / STAGE_H);
    stageEl.style.setProperty('--scale', scale);
  }

  // ===== 터치/마우스 공통 처리 =====
  function setupInput() {
    // iOS 사파리의 두 손가락 확대, 화면 끌림, 길게 눌러 메뉴 막기
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => {
      if (e.touches.length > 1 || !e.target.closest('.scrollable')) e.preventDefault();
    }, { passive: false });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
  }

  // ===== 저장 (브라우저 저장소) =====
  const Save = {
    KEY: 'shimpyobu.save.v1',
    load() {
      try {
        const raw = localStorage.getItem(this.KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },
    save(patch) {
      const next = { version: 1, ...(this.load() || {}), ...patch, updatedAt: Date.now() };
      try {
        localStorage.setItem(this.KEY, JSON.stringify(next));
      } catch (e) { /* 개인정보 보호 모드 등에서는 저장 생략 */ }
      return next;
    },
    clear() {
      try { localStorage.removeItem(this.KEY); } catch (e) { /* 무시 */ }
    },
    exists() { return this.load() !== null; },
  };

  // ===== DOM 도우미 =====
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function button(label, onClick, { primary = false, disabled = false } = {}) {
    const b = el('button', primary ? 'btn primary' : 'btn', label);
    b.type = 'button';
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  }

  /** 모든 화면의 공통 틀: 배경, 화면 이름, 본문, 아래쪽 버튼 줄 */
  function buildScreen(id, { background } = {}) {
    const def = screens[id];
    const root = el('section', `screen screen--${id}`);
    root.dataset.screen = id;

    const bg = el('div', 'screen-bg');
    if (background) bg.appendChild(Assets.background(background));
    root.appendChild(bg);

    root.appendChild(el('h1', 'screen-title', def.title));
    const body = el('div', 'screen-body');
    const nav = el('div', 'screen-nav');
    root.appendChild(body);
    root.appendChild(nav);

    return {
      root, bg, body, nav,
      addButton(label, onClick, opts) {
        const b = button(label, onClick, opts);
        nav.appendChild(b);
        return b;
      },
    };
  }

  // ===== 화면 전환 =====
  function registerScreen(id, def) {
    screens[id] = def;
  }

  function go(id, params = {}) {
    const def = screens[id];
    if (!def) {
      console.error(`등록되지 않은 화면: ${id}`);
      return;
    }
    const screen = buildScreen(id, { background: def.background });
    def.render(screen, params);
    stageEl.replaceChildren(screen.root);
    currentId = id;
    if (id !== 'title') Save.save({ lastScreen: id });
  }

  function character(id) {
    return data.characters.find((c) => c.id === id);
  }

  // ===== 시작 =====
  async function loadData() {
    const res = await fetch('data/characters.json');
    if (!res.ok) throw new Error(`data/characters.json (${res.status})`);
    data.characters = await res.json();
  }

  function showBootError(err) {
    const box = el('div', 'boot-error');
    box.appendChild(el('p', null, '게임 데이터를 불러오지 못했어요.'));
    box.appendChild(el('p', null, '파일을 더블클릭해서 열면 브라우저가 데이터 파일을 막아요. 로컬 서버나 GitHub Pages로 열어주세요.'));
    box.appendChild(el('code', null, 'python3 -m http.server 8000  →  http://localhost:8000'));
    box.appendChild(el('code', null, String(err && err.message || err)));
    stageEl.replaceChildren(box);
  }

  async function boot() {
    stageEl = document.getElementById('stage');
    fitStage();
    window.addEventListener('resize', fitStage);
    window.addEventListener('orientationchange', fitStage);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', fitStage);
    setupInput();

    try {
      await loadData();
    } catch (err) {
      console.error(err);
      showBootError(err);
      return;
    }
    go('title');
  }

  return {
    STAGE_W, STAGE_H, data, Save,
    boot, go, registerScreen, buildScreen, character, el, button,
    get currentScreen() { return currentId; },
  };
})();

/* ===== 간단한 화면들 (본격적으로 만들 때 각자 파일로 분리) ===== */

Game.registerScreen('title', {
  title: '타이틀',
  render(s) {
    s.addButton('새로 하기', () => { Game.Save.clear(); Game.go('room'); }, { primary: true });
    s.addButton('이어하기', () => Game.go('room'), { disabled: !Game.Save.exists() });
  },
});

Game.registerScreen('chapter', {
  title: '장 선택',
  render(s) {
    s.addButton('부실로', () => Game.go('room'));
    s.addButton('편성', () => Game.go('formation'), { primary: true });
  },
});

Game.registerScreen('formation', {
  title: '편성',
  render(s) {
    for (const c of Game.data.characters) s.body.appendChild(Assets.standing(c, 'default', 'card'));
    s.addButton('장 선택으로', () => Game.go('chapter'));
    s.addButton('출발', () => Game.go('dialogue'), { primary: true });
  },
});

Game.registerScreen('result', {
  title: '결과',
  render(s) {
    s.addButton('부실로', () => Game.go('room'), { primary: true });
  },
});

Game.registerScreen('character', {
  title: '캐릭터',
  render(s) {
    for (const c of Game.data.characters) s.body.appendChild(Assets.standing(c, 'smile', 'card'));
    s.addButton('부실로', () => Game.go('room'), { primary: true });
  },
});

Game.registerScreen('counsel', {
  title: '방과후 상담',
  background: 'classroom',
  render(s) {
    s.addButton('부실로', () => Game.go('room'), { primary: true });
  },
});

Game.registerScreen('attendance', {
  title: '출석부',
  render(s) {
    for (const c of Game.data.characters) s.body.appendChild(Assets.nightmare(c, 'card'));
    s.addButton('부실로', () => Game.go('room'), { primary: true });
  },
});
