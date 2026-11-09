/*
 * battle.js — 전투 화면
 * 지금은 왼쪽에 부원 3명(악몽 속 모습), 오른쪽에 적 자리만 보여준다.
 */
Game.registerScreen('battle', {
  title: '전투',
  background: 'nightmare_hallway',
  render(s) {
    const field = Game.el('div', 'battle-field');
    const party = Game.el('div', 'battle-party');
    for (const id of ['seojin', 'dohyeon', 'yuna']) {
      party.appendChild(Assets.nightmare(Game.character(id)));
    }
    field.appendChild(party);
    field.appendChild(Assets.enemy('shade', '그늘'));
    s.root.appendChild(field);

    s.addButton('후퇴 (부실로)', () => Game.go('room'));
    s.addButton('승리 (결과로)', () => Game.go('result'), { primary: true });
  },
});
