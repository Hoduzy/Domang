/*
 * room.js — 부실 (허브) 화면
 * 지금은 부원 여섯 명의 스탠딩 자리와 다른 화면으로 가는 버튼만 있다.
 */
Game.registerScreen('room', {
  title: '부실',
  background: 'club_room',
  render(s) {
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
  },
});
