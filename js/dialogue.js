/*
 * dialogue.js — 대화 화면
 * 지금은 배경 + 스탠딩 + 대사창 자리만 보여준다.
 * 대사창을 누르면 표정이 바뀌어서 표정 이미지 규칙을 확인할 수 있다.
 */
Game.registerScreen('dialogue', {
  title: '대화',
  background: 'staff_room',
  render(s) {
    const chars = Game.el('div', 'dialogue-chars');
    s.root.appendChild(chars);

    const speaker = Game.character('hayun');
    let exprIndex = 0;
    const showStanding = () => {
      chars.replaceChildren(Assets.standing(speaker, Assets.EXPRESSIONS[exprIndex]));
    };
    showStanding();

    const box = Game.el('div', 'dialogue-box');
    box.appendChild(Game.el('div', 'dialogue-speaker', speaker.name));
    box.appendChild(Game.el('div', 'dialogue-text', '대화 화면이에요. 대사창을 누르면 표정이 바뀌어요.'));
    box.addEventListener('click', () => {
      exprIndex = (exprIndex + 1) % Assets.EXPRESSIONS.length;
      showStanding();
    });
    s.root.appendChild(box);

    s.addButton('부실로', () => Game.go('room'));
    s.addButton('전투로', () => Game.go('battle'), { primary: true });
  },
});
