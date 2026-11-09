/*
 * room.js — 부실 (허브) 화면
 *
 * - 부원 여섯 명이 부실 곳곳에 있다. 누르면 짧은 대화 (data/room_talk.json)
 * - 벽시계는 늘 7시 전 (6시 50분~59분 사이를 실제 분에 맞춰 돈다)
 * - 화이트보드에는 다음 악몽의 이름. 누르면 장 선택
 */

// 부원마다 부실 안의 자리 (1920×1080 기준, 발끝 위치)
const ROOM_SPOTS = {
  hayun:   { x: 150,  y: 880, where: '구석 의자' },
  yuna:    { x: 470,  y: 900, where: '소파' },
  dahyeon: { x: 700,  y: 900, where: '소파 끝' },
  seoyeon: { x: 1080, y: 900, where: '긴 책상' },
  jiyu:    { x: 1330, y: 900, where: '책상 끝' },
  eunchae: { x: 1700, y: 880, where: '창가 화분 옆' },
};

Game.registerScreen('room', {
  title: '부실',
  background: 'club_room',
  render(s, params) {
    const el = Game.el;
    s.root.classList.add('room');
    const save = Save.data;
    const progress = save ? save.progress : { chapter: 0, stage: 1 };

    // ----- 가구 (이미지가 없을 때를 위한 간단한 모양) -----
    const furniture = el('div', 'room-furniture');
    furniture.append(
      el('div', 'room-window'),
      el('div', 'room-sofa'),
      el('div', 'room-desk'),
      el('div', 'room-chair'),
      el('div', 'room-plant'),
    );
    s.root.appendChild(furniture);

    // ----- 벽시계 -----
    const clock = el('div', 'room-clock');
    clock.setAttribute('role', 'img');
    clock.innerHTML = `
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="46" class="face"/>
        ${Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          const x1 = 50 + Math.sin(a) * 38; const y1 = 50 - Math.cos(a) * 38;
          const x2 = 50 + Math.sin(a) * 43; const y2 = 50 - Math.cos(a) * 43;
          return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="tick"/>`;
        }).join('')}
        <line x1="50" y1="50" x2="50" y2="26" class="hand hour"/>
        <line x1="50" y1="50" x2="50" y2="14" class="hand minute"/>
        <line x1="50" y1="56" x2="50" y2="12" class="hand second"/>
        <circle cx="50" cy="50" r="3" class="pin"/>
      </svg>`;
    s.root.appendChild(clock);
    const hands = {
      hour: clock.querySelector('.hour'),
      minute: clock.querySelector('.minute'),
      second: clock.querySelector('.second'),
    };
    function tickClock() {
      const now = new Date();
      const minute = 50 + (now.getMinutes() % 10); // 6:50 ~ 6:59, 7시는 오지 않는다
      const sec = now.getSeconds();
      const set = (hand, deg) => hand.setAttribute('transform', `rotate(${deg} 50 50)`);
      set(hands.hour, (6 + minute / 60) * 30);
      set(hands.minute, (minute + sec / 60) * 6);
      set(hands.second, sec * 6);
      clock.setAttribute('aria-label', `벽시계 6시 ${minute}분`);
    }
    tickClock();
    const clockTimer = setInterval(tickClock, 1000);

    // ----- 화이트보드 -----
    const board = el('button', 'room-board');
    board.type = 'button';
    board.setAttribute('aria-label', '화이트보드 — 장 선택');
    const next = Game.protagonist(progress.chapter);
    board.appendChild(el('div', 'room-board-label', '다음 악몽'));
    board.appendChild(el('div', 'room-board-name',
      progress.chapter === 0 ? '프롤로그' : next ? next.name : '—'));
    board.appendChild(el('div', 'room-board-sub',
      progress.chapter === 0 ? `스테이지 ${progress.stage}` : `${progress.chapter}장 · 스테이지 ${progress.stage}`));
    board.addEventListener('click', () => Game.go('chapter'));
    s.root.appendChild(board);

    // ----- 부원 -----
    const lastTalk = {};
    const members = el('div', 'room-members');
    for (const c of Game.data.characters) {
      const spot = ROOM_SPOTS[c.id] || { x: 960, y: 900 };
      const m = el('button', 'room-member');
      m.type = 'button';
      m.dataset.id = c.id;
      m.style.left = `${spot.x}px`;
      m.style.top = `${spot.y}px`;
      m.setAttribute('aria-label', `${c.name} — ${spot.where}`);
      m.appendChild(Assets.standing(c, 'default', 'room-pic'));
      m.appendChild(el('span', 'room-member-name', c.name));
      m.addEventListener('click', (e) => {
        e.stopPropagation();
        talkTo(c, m);
      });
      members.appendChild(m);
    }
    s.root.appendChild(members);

    // ----- 짧은 대화 (말풍선) -----
    let bubble = null;
    let talk = null; // { lines, i, member, el }

    function pickTalk(id) {
      const list = Game.data.roomTalk[id] || [['…']];
      if (list.length === 1) return list[0];
      let i;
      do { i = Math.floor(Math.random() * list.length); } while (i === lastTalk[id]);
      lastTalk[id] = i;
      return list[i];
    }

    function showLine() {
      const line = talk.lines[talk.i];
      const isTeacher = typeof line === 'object' && line.speaker;
      const text = isTeacher ? line.text : line;
      bubble.replaceChildren();
      bubble.classList.toggle('teacher', Boolean(isTeacher));
      bubble.appendChild(el('div', 'room-bubble-name', isTeacher ? line.speaker : talk.member.name));
      const body = el('div', 'room-bubble-text');
      for (const seg of Story.parseInline(text)) body.appendChild(el(seg.em ? 'em' : 'span', null, seg.text));
      bubble.appendChild(body);
      bubble.appendChild(el('div', 'room-bubble-next', talk.i < talk.lines.length - 1 ? '▼' : '×'));
    }

    function closeTalk() {
      if (bubble) bubble.remove();
      if (talk) talk.el.classList.remove('talking');
      bubble = null;
      talk = null;
    }

    function talkTo(c, m) {
      if (talk && talk.member === c) return advanceTalk();
      closeTalk();
      talk = { lines: pickTalk(c.id), i: 0, member: c, el: m };
      m.classList.add('talking');
      bubble = el('div', 'room-bubble');
      const spot = ROOM_SPOTS[c.id] || { x: 960 };
      bubble.style.left = `${Math.min(1500, Math.max(60, spot.x - 210))}px`;
      bubble.addEventListener('click', (e) => { e.stopPropagation(); advanceTalk(); });
      s.root.appendChild(bubble);
      showLine();
    }

    function advanceTalk() {
      if (!talk) return;
      talk.i += 1;
      if (talk.i >= talk.lines.length) closeTalk();
      else showLine();
    }

    s.root.addEventListener('click', (e) => {
      if (talk && !e.target.closest('button, .room-bubble')) advanceTalk();
    });

    // ----- 메뉴 -----
    const settingsBtn = Game.button('설정', () => Game.go('settings', { from: 'room' }));
    settingsBtn.classList.add('corner-btn');
    s.root.appendChild(settingsBtn);

    s.addButton('타이틀로', () => Game.go('title'));
    s.addButton('출석부', () => Game.go('attendance'));
    s.addButton('방과후 상담', () => Game.go('counsel'));
    s.addButton('캐릭터', () => Game.go('character'));
    s.addButton('장 선택', () => Game.go('chapter'), { primary: true });

    // 새 장이 열렸을 때 한 번 보여주는 표시
    if (params && params.unlocked != null) {
      const ch = params.unlocked;
      const overlay = el('div', 'unlock-overlay');
      const box = el('div', 'unlock-box');
      box.appendChild(el('div', 'unlock-tag', '해금'));
      box.appendChild(el('h2', null, `${Game.chapterLabel(ch)} 해금`));
      const title = Game.chapterTitle(ch);
      if (title) box.appendChild(el('p', 'unlock-title', `「${title}」`));
      box.appendChild(el('p', 'unlock-hint', '화이트보드에서 새 악몽을 확인할 수 있어요.'));
      box.appendChild(Game.button('확인', () => overlay.remove(), { primary: true }));
      overlay.appendChild(box);
      s.root.appendChild(overlay);
    }

    return () => clearInterval(clockTimer);
  },
});
