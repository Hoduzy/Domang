/*
 * chapter.js — 장 선택 (화이트보드)
 *
 * 왼쪽: 프롤로그와 1~6장. 진행 중인 장까지 열린다. 아직 안 열린 장은 '?'.
 * 오른쪽: 고른 장의 스테이지가 길처럼 이어진다 (프롤로그 5개, 각 장 10개).
 *         클리어한 스테이지와 지금 스테이지까지만 누를 수 있다.
 */

const STAGE_TYPE_LABEL = { story: '대화', battle: '전투', explore: '탐색', boss: '보스' };

Game.registerScreen('chapter', {
  title: '장 선택',
  hideTitle: true,
  render(s, params) {
    const el = Game.el;
    if (!Save.data) return;
    const { progress } = Save.data;
    s.root.classList.add('chapter');
    s.bg.replaceChildren(Assets.background('bg_chapter_select'));

    const isChapterOpen = (c) => c <= progress.chapter;
    const clearedIn = (c) => new Set(progress.cleared[String(c)] || []);
    const stageState = (c, n) => {
      if (clearedIn(c).has(n)) return 'cleared';
      if (c < progress.chapter) return 'cleared'; // 지난 장은 모두 클리어한 것으로 본다
      if (c === progress.chapter && n === progress.stage) return 'current';
      if (c === progress.chapter && n < progress.stage) return 'cleared';
      return 'locked';
    };

    let selectedChapter = params.chapter != null && isChapterOpen(params.chapter) ? params.chapter : progress.chapter;
    let selectedStage = null;

    // ----- 화이트보드 틀 -----
    const board = el('div', 'wb');
    const tray = el('div', 'wb-tray'); // 아래쪽 마커 받침
    tray.append(el('i', 'marker red'), el('i', 'marker blue'), el('i', 'marker black'), el('i', 'eraser'));
    const tabs = el('div', 'wb-tabs');
    const main = el('div', 'wb-main');
    board.append(tabs, main, tray);
    s.root.appendChild(board);

    // ----- 장 목록 -----
    function renderTabs() {
      tabs.replaceChildren(el('div', 'wb-tabs-title', '악몽 목록'));
      for (let c = 0; c <= 6; c++) {
        const open = isChapterOpen(c);
        const p = Game.protagonist(c);
        const done = c < progress.chapter;
        const tab = Game.button('', () => {
          selectedChapter = c;
          selectedStage = null;
          renderTabs();
          renderMain();
        }, { disabled: !open });
        tab.classList.add('wb-tab');
        if (c === selectedChapter) tab.classList.add('selected');
        if (done) tab.classList.add('done');
        tab.appendChild(el('span', 'wb-tab-label', Game.chapterLabel(c)));
        tab.appendChild(el('span', 'wb-tab-sub', !open ? '?' : c === 0 ? '쉼표부' : p ? p.name : ''));
        if (!open) tab.appendChild(el('span', 'wb-tab-lock', '🔒'));
        else if (done) tab.appendChild(el('span', 'wb-tab-check', '✓'));
        if (p && open) tab.style.setProperty('--magnet', p.color);
        tabs.appendChild(tab);
      }
    }

    // ----- 스테이지 길 -----
    const PATH_W = 1000;
    const PATH_H = 440;

    function nodePositions(count) {
      if (count <= 5) {
        const gap = PATH_W / (count + 1);
        return Array.from({ length: count }, (_, i) => ({ x: gap * (i + 1), y: PATH_H / 2 }));
      }
      // 뱀 모양: 윗줄 왼→오, 아랫줄 오→왼
      const perRow = Math.ceil(count / 2);
      const gap = (PATH_W - 220) / (perRow - 1);
      return Array.from({ length: count }, (_, i) => {
        const row = i < perRow ? 0 : 1;
        const col = row === 0 ? i : perRow - 1 - (i - perRow);
        return { x: 110 + col * gap, y: row === 0 ? 110 : PATH_H - 110 };
      });
    }

    // 길(직선과 굽은 곡선)을 잘게 나눠 따라가며 spacing 마다 점 자리를 뽑는다
    function dotsAlong(points, spacing) {
      const samples = [];
      const nodeAt = [0];
      let total = 0;
      let prev = points[0];
      const push = (q) => {
        total += Math.hypot(q.x - prev.x, q.y - prev.y);
        samples.push({ x: q.x, y: q.y, at: total, angle: Math.atan2(q.y - prev.y, q.x - prev.x) * 180 / Math.PI });
        prev = q;
      };
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const steps = 120;
        for (let k = 1; k <= steps; k++) {
          const t = k / steps;
          if (a.y !== b.y) {
            const bend = 170;
            const p1 = { x: a.x + bend, y: a.y };
            const p2 = { x: b.x + bend, y: b.y };
            const u = 1 - t;
            push({
              x: u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x,
              y: u * u * u * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * b.y,
            });
          } else {
            push({ x: a.x + (b.x - a.x) * t, y: a.y });
          }
        }
        nodeAt.push(total);
      }
      const list = [];
      let next = spacing / 2;
      for (const sm of samples) {
        if (sm.at >= next) { list.push(sm); next += spacing; }
      }
      return { list, nodeAt };
    }

    function renderMain() {
      main.replaceChildren();
      const c = selectedChapter;
      const stages = Game.data.stages[String(c)] || [];
      const p = Game.protagonist(c);

      const head = el('div', 'wb-head');
      head.appendChild(el('h2', 'wb-title', c === 0 ? '프롤로그' : `${c}장 「${Game.chapterTitle(c)}」`));
      if (p) head.appendChild(el('span', 'wb-owner', `악몽의 주인공 · ${p.name}`));
      main.appendChild(head);

      const path = el('div', 'wb-path');
      path.style.width = `${PATH_W}px`;
      path.style.height = `${PATH_H}px`;
      const pts = nodePositions(stages.length);
      const states = stages.map((st) => stageState(c, st.stage));
      const reached = states.reduce((n, st, i) => (st !== 'locked' ? i : n), -1);

      // 점선 길: ui_path_dot 을 길을 따라 일정한 간격으로 놓고 길 방향으로 돌린다
      const dots = el('div', 'wb-dots');
      const { list, nodeAt } = dotsAlong(pts, 30);
      const doneLen = reached > 0 ? nodeAt[reached] : -1;
      for (const d of list) {
        const dot = el('img', `wb-dot ${d.at <= doneLen ? 'done' : 'locked'}`);
        dot.src = Assets.URLS.ui('ui_path_dot')[0];
        dot.alt = '';
        dot.draggable = false;
        dot.style.left = `${d.x}px`;
        dot.style.top = `${d.y}px`;
        dot.style.transform = `translate(-50%, -50%) rotate(${d.angle}deg)`;
        dots.appendChild(dot);
      }
      path.appendChild(dots);

      if (selectedStage == null || !stages.find((st) => st.stage === selectedStage)) {
        const cur = stages.find((st, i) => states[i] === 'current');
        selectedStage = cur ? cur.stage : (stages[reached] || stages[0] || {}).stage;
      }

      stages.forEach((st, i) => {
        const state = states[i];
        const node = Game.button('', () => {
          selectedStage = st.stage;
          renderMain();
        }, { disabled: state === 'locked' });
        node.classList.add('wb-node', state, st.type);
        if (st.stage === selectedStage) node.classList.add('selected');
        node.style.left = `${pts[i].x}px`;
        node.style.top = `${pts[i].y}px`;
        node.setAttribute('aria-label', `스테이지 ${st.stage} ${st.title} — ${state === 'cleared' ? '클리어' : state === 'current' ? '진행 중' : '잠김'}`);
        // 노드 그림: node_locked / node_current / node_cleared / node_boss (글자는 위에 올린다)
        const img = state === 'locked' ? 'node_locked' : state === 'cleared' ? 'node_cleared' : st.type === 'boss' ? 'node_boss' : 'node_current';
        node.appendChild(Assets.icon(img, 'wb-node-img'));
        node.appendChild(el('span', 'wb-node-num', state === 'current' && st.type !== 'boss' ? String(st.stage) : ''));
        const label = el('span', 'wb-node-label', state === 'locked' && c > 0 ? `${st.stage}` : `${st.stage}. ${st.title}`);
        node.appendChild(label);
        path.appendChild(node);
      });
      main.appendChild(path);

      // ----- 고른 스테이지 -----
      const info = stages.find((st) => st.stage === selectedStage);
      const detail = el('div', 'wb-detail');
      if (info) {
        const state = stageState(c, info.stage);
        const text = el('div', 'wb-detail-text');
        text.appendChild(el('div', 'wb-detail-title', `스테이지 ${info.stage}. ${info.title}`));
        const kind = STAGE_TYPE_LABEL[info.type] + (info.battle ? ' · 전투' : '');
        text.appendChild(el('div', 'wb-detail-meta', `${kind} · ${state === 'cleared' ? '클리어' : state === 'current' ? '진행 중' : '잠김'}`));
        if (info.desc) text.appendChild(el('div', 'wb-detail-desc', info.desc));
        detail.appendChild(text);
        const ready = info.file || info.type === 'battle' || info.type === 'boss';
        const label = state === 'cleared' ? '다시 보기' : (info.type === 'battle' || info.type === 'boss') ? '편성하기' : '시작';
        const go = Game.button(ready ? label : '준비 중', () => Game.playStage(c, info.stage, { replay: state === 'cleared' }),
          { primary: state === 'current', disabled: state === 'locked' || !ready });
        go.classList.add('wb-go');
        detail.appendChild(go);
      }
      main.appendChild(detail);
    }

    renderTabs();
    renderMain();
    s.addButton('부실로', () => Game.go('room'));
  },
});
