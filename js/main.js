/*
 * main.js — 화면 비율 맞추기, 화면 전환 (저장은 save.js)
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
      if (e.touches.length > 1 || !e.target.closest('.scrollable, input[type=range]')) e.preventDefault();
    }, { passive: false });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
  }

  // 주제 안내 문구 — 안내 화면과 설정 화면에 똑같이 쓴다
  const SUPPORT_MESSAGE = '이 게임은 자살과 우울을 다룹니다. 힘들 때는 혼자 견디지 말고 자살예방상담전화 109로 연락하세요.';

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

    const heading = el('h1', 'screen-title', def.title);
    if (def.hideTitle) heading.classList.add('visually-hidden');
    root.appendChild(heading);
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

  // ===== 확인 창 =====
  /** 무대 안에 뜨는 확인 창. 확인을 누르면 true */
  function confirmDialog(message, { ok = '확인', cancel = '취소' } = {}) {
    return new Promise((resolve) => {
      const overlay = el('div', 'modal-overlay');
      const box = el('div', 'modal');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.appendChild(el('p', 'modal-message', message));
      const row = el('div', 'modal-buttons');
      const close = (result) => { overlay.remove(); resolve(result); };
      if (cancel) row.appendChild(button(cancel, () => close(false)));
      row.appendChild(button(ok, () => close(true), { primary: true }));
      box.appendChild(row);
      overlay.appendChild(box);
      stageEl.appendChild(overlay);
      row.lastChild.focus();
    });
  }

  /** 잠깐 떴다 사라지는 알림 */
  function toast(message) {
    const t = el('div', 'toast', message);
    stageEl.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  // ===== 화면 전환 =====
  // 이어하기로 돌아올 화면으로 기록하지 않는 화면
  const NO_RESUME_SCREENS = new Set(['notice', 'title', 'settings']);

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
    if (Save.data && !NO_RESUME_SCREENS.has(id)) Save.update((d) => { d.progress.lastScreen = id; });
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
    go('notice');
  }

  return {
    STAGE_W, STAGE_H, SUPPORT_MESSAGE, data,
    boot, go, registerScreen, buildScreen, character, el, button, confirm: confirmDialog, toast,
    get currentScreen() { return currentId; },
  };
})();

/* ===== 간단한 화면들 (본격적으로 만들 때 각자 파일로 분리) ===== */

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
