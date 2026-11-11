/*
 * extras.js — 출석부, 가챠 화면
 */

// ===== 출석부: 여섯 명의 페이지 (ui_attendance_book) =====
Game.registerScreen('attendance', {
  title: '출석부',
  render(s, params) {
    const el = Game.el;
    s.root.classList.add('attendance');
    let selected = params.id && Game.character(params.id) ? params.id : Game.data.characters[0].id;

    const tabs = el('div', 'at-tabs');
    const book = el('div', 'at-book');
    s.root.append(tabs, book);

    function render() {
      tabs.replaceChildren();
      for (const c of Game.data.characters) {
        const t = el('button', `at-tab${c.id === selected ? ' selected' : ''}`);
        t.type = 'button';
        t.style.setProperty('--c', c.color);
        t.appendChild(Assets.face(c, 'at-tab-face'));
        t.appendChild(el('span', null, c.name));
        t.addEventListener('click', () => { selected = c.id; render(); });
        tabs.appendChild(t);
      }

      const c = Game.character(selected);
      const save = Save.data;
      const frags = save ? save.memoryFragments[c.id] || [] : [];
      const dep = save ? Growth.dependencyStage(save.characters[c.id].dependency) : null;
      book.replaceChildren();

      // 왼쪽 페이지: 사진 칸 + 기본 정보
      const photo = el('div', 'at-photo');
      photo.appendChild(Assets.face(c, 'at-photo-face'));
      book.appendChild(photo);
      const left = el('div', 'at-page left');
      left.appendChild(el('div', 'at-name', c.name));
      left.appendChild(el('div', 'at-line', `${c.grade}학년 · ${c.role}`));
      left.appendChild(el('div', 'at-line', `${c.chapter}장 「${Game.chapterTitle(c.chapter)}」`));
      if (dep) left.appendChild(el('div', 'at-line', `의존도 ${dep.stage}단계 · ${dep.name}`));
      left.appendChild(el('div', 'at-line dim', `극복 스킬: ${save && save.progress.chapter > c.chapter ? '얻음' : '아직 없음'}`));
      book.appendChild(left);

      // 오른쪽 페이지: 모은 기억 조각
      const right = el('div', 'at-page right');
      right.appendChild(el('div', 'at-heading', `기억 조각 ${frags.length}`));
      if (!frags.length) right.appendChild(el('div', 'at-line dim', '아직 찾은 기억 조각이 없어요. 그 아이의 악몽 곳곳에 숨겨져 있어요.'));
      frags.forEach((f, i) => right.appendChild(el('div', 'at-line', `${i + 1}. ${f}`)));
      book.appendChild(right);
    }

    render();
    s.addButton('부실로', () => Game.go('room'), { primary: true });
  },
});

// ===== 가챠: 기본 부원(SR)과 이격·삼격(SSR) =====
Game.registerScreen('gacha', {
  title: '가챠',
  background: 'bg_gacha',
  render(s) {
    const el = Game.el;
    s.root.classList.add('gacha');

    const wrap = el('div', 'gc-wrap');
    const srRow = el('div', 'gc-row');
    srRow.appendChild(el('div', 'gc-label', 'SR · 기본 부원 — 스토리로 함께해요'));
    const cards = el('div', 'gc-cards');
    for (const c of Game.data.characters) {
      const card = el('div', 'gc-card sr');
      card.appendChild(Assets.standing(c, 'smile', 'gc-art'));
      card.appendChild(el('div', 'gc-name', c.name));
      cards.appendChild(card);
    }
    srRow.appendChild(cards);

    const ssrRow = el('div', 'gc-row ssr-row');
    ssrRow.appendChild(el('div', 'gc-label', 'SSR · 이격과 삼격 — 같은 아이의 다른 계절, 다른 가능성'));
    const ssr = el('div', 'gc-card ssr unknown');
    ssr.appendChild(el('div', 'gc-q', '?'));
    ssr.appendChild(el('div', 'gc-name', '준비 중'));
    const side = el('div', 'gc-side');
    side.append(ssr, el('p', 'gc-note', '뽑기 확률과 이격 캐릭터는 아직 정해지지 않았어요.'));
    ssrRow.appendChild(side);

    wrap.append(srRow, ssrRow);
    s.root.appendChild(wrap);
    s.addButton('부실로', () => Game.go('room'));
    s.addButton('뽑기', () => {}, { disabled: true });
  },
});
