/*
 * room.js — 부실 (허브) 화면
 * 지금은 부원 여섯 명의 스탠딩 자리와 다른 화면으로 가는 버튼만 있다.
 */
Game.registerScreen('room', {
  title: '부실',
  background: 'club_room',
  render(s, params) {
    const members = Game.el('div', 'room-members');
    for (const c of Game.data.characters) members.appendChild(Assets.standing(c, 'default', 'card'));
    s.root.appendChild(members);

    const settingsBtn = Game.button('설정', () => Game.go('settings', { from: 'room' }));
    settingsBtn.classList.add('corner-btn');
    s.root.appendChild(settingsBtn);

    s.addButton('타이틀로', () => Game.go('title'));
    s.addButton('출석부', () => Game.go('attendance'));
    s.addButton('방과후 상담', () => Game.go('counsel'));
    s.addButton('캐릭터', () => Game.go('character'));
    s.addButton('화이트보드 (장 선택)', () => Game.go('chapter'), { primary: true });

    // 새 장이 열렸을 때 한 번 보여주는 표시
    if (params && params.unlocked != null) {
      const ch = params.unlocked;
      const overlay = Game.el('div', 'unlock-overlay');
      const box = Game.el('div', 'unlock-box');
      box.appendChild(Game.el('div', 'unlock-tag', '해금'));
      box.appendChild(Game.el('h2', null, `${Game.chapterLabel(ch)} 해금`));
      const title = Game.chapterTitle(ch);
      if (title) box.appendChild(Game.el('p', 'unlock-title', `「${title}」`));
      box.appendChild(Game.el('p', 'unlock-hint', '화이트보드에서 새 악몽을 확인할 수 있어요.'));
      box.appendChild(Game.button('확인', () => overlay.remove(), { primary: true }));
      overlay.appendChild(box);
      s.root.appendChild(overlay);
    }
  },
});
