/*
 * formation.js — 편성
 *
 * 그 장 악몽의 주인공을 뺀 다섯 명 중 3명을 고른다. 누른 순서가 전장의 자리 순서.
 * 부원마다 약속 슬롯 1개. 약속은 그 약속을 준 부원(owner)만 낄 수 있다 (전용).
 * 고른 편성은 장마다 저장된다 (save.formation).
 */

function promiseLabel(pr) {
  const info = Game.data.promises;
  return `${info.types[pr.type].name} · ${info.grades[pr.grade]}`;
}

function promiseEffect(pr) {
  return Game.data.promises.effects[pr.type][pr.grade];
}

Game.registerScreen('formation', {
  title: '편성',
  render(s, params) {
    const el = Game.el;
    if (!Save.data) return;
    const chapter = params.chapter != null ? params.chapter : Save.data.progress.chapter;
    const stage = params.stage != null ? params.stage : Save.data.progress.stage;
    const info = Game.stageInfo(chapter, stage);
    const owner = Game.protagonist(chapter);
    const candidates = Game.data.characters.filter((c) => !owner || c.id !== owner.id);
    s.root.classList.add('formation');

    const saved = (Save.data.formation[String(chapter)] || []).filter((id) => candidates.some((c) => c.id === id));
    const picked = saved.slice(0, 3);

    // ----- 머리말 -----
    const head = el('div', 'fm-head');
    head.appendChild(el('div', 'fm-stage', `${Game.chapterLabel(chapter)} · 스테이지 ${stage}${info ? ` ${info.title}` : ''}`));
    const hint = el('div', 'fm-hint');
    head.appendChild(hint);
    s.root.appendChild(head);

    // ----- 카드 -----
    const row = el('div', 'fm-row');
    s.root.appendChild(row);

    if (owner) {
      const card = el('div', 'fm-card owner');
      card.appendChild(Assets.standing(owner, 'sad', 'fm-pic'));
      card.appendChild(el('div', 'fm-name', owner.name));
      card.appendChild(el('div', 'fm-owner-note', '악몽 속에 갇혀 있어요'));
      row.appendChild(card);
      row.appendChild(el('div', 'fm-divider'));
    }

    const cards = new Map();
    for (const c of candidates) {
      const rec = Save.data.characters[c.id];
      const card = el('button', 'fm-card');
      card.type = 'button';
      card.dataset.id = c.id;
      card.appendChild(el('span', 'fm-order'));
      card.appendChild(Assets.nightmare(c, 'fm-pic'));
      card.appendChild(el('div', 'fm-name', c.name));
      card.appendChild(el('div', 'fm-meta', `${c.role} · Lv ${rec.level}`));
      const slot = el('div', 'fm-slot');
      slot.setAttribute('role', 'button');
      slot.tabIndex = 0;
      slot.addEventListener('click', (e) => { e.stopPropagation(); openPromisePicker(c); });
      slot.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openPromisePicker(c); }
      });
      card.appendChild(slot);
      card.addEventListener('click', () => toggle(c.id));
      cards.set(c.id, { card, slot });
      row.appendChild(card);
    }

    function equippedOf(id) {
      return Save.data.promises.find((pr) => pr.equippedBy === id) || null;
    }

    function renderSlot(c) {
      const { slot } = cards.get(c.id);
      const pr = equippedOf(c.id);
      slot.replaceChildren(el('span', 'fm-slot-label', '약속'));
      slot.classList.toggle('empty', !pr);
      if (pr) {
        slot.classList.remove('gold', 'silver', 'bronze');
        slot.classList.add(pr.grade);
        slot.appendChild(el('span', 'fm-slot-name', promiseLabel(pr)));
      } else {
        slot.appendChild(el('span', 'fm-slot-name', '비어 있음'));
      }
    }

    function render() {
      for (const [id, { card }] of cards) {
        const i = picked.indexOf(id);
        card.classList.toggle('picked', i >= 0);
        card.querySelector('.fm-order').textContent = i >= 0 ? String(i + 1) : '';
      }
      candidates.forEach(renderSlot);
      hint.textContent = picked.length < 3
        ? `함께 들어갈 부원 ${3 - picked.length}명을 더 고르세요. (${picked.length}/3)`
        : '편성 완료. 누른 순서대로 전장에 나섭니다.';
      startBtn.disabled = picked.length !== 3;
    }

    function toggle(id) {
      const i = picked.indexOf(id);
      if (i >= 0) picked.splice(i, 1);
      else if (picked.length < 3) picked.push(id);
      else Game.toast('3명까지 고를 수 있어요. 먼저 한 명을 빼 주세요.');
      render();
    }

    // ----- 약속 고르기 -----
    function openPromisePicker(c) {
      const mine = Save.data.promises.filter((pr) => pr.owner === c.id);
      const overlay = el('div', 'modal-overlay');
      const box = el('div', 'modal fm-picker');
      box.appendChild(el('h2', 'fm-picker-title', `${c.name}의 약속`));
      const list = el('div', 'fm-picker-list scrollable');
      const close = () => overlay.remove();
      if (!mine.length) {
        list.appendChild(el('p', 'fm-picker-empty', `아직 ${c.name}에게 받은 약속이 없어요. 방과후 상담에서 30일을 함께 보내면 얻을 수 있어요.`));
      }
      for (const pr of mine) {
        const on = pr.equippedBy === c.id;
        const item = Game.button('', () => {
          Save.update((d) => {
            const target = d.promises.find((x) => x.id === pr.id);
            d.promises.forEach((x) => { if (x.equippedBy === c.id) x.equippedBy = null; });
            target.equippedBy = on ? null : c.id;
          });
          close();
          render();
        }, { primary: on });
        item.classList.add('fm-picker-item', pr.grade);
        item.appendChild(el('span', 'fm-picker-name', promiseLabel(pr) + (on ? ' (착용 중)' : '')));
        item.appendChild(el('span', 'fm-picker-effect', promiseEffect(pr)));
        list.appendChild(item);
      }
      box.appendChild(list);
      const buttons = el('div', 'modal-buttons');
      buttons.appendChild(Game.button('닫기', close, { primary: true }));
      box.appendChild(buttons);
      overlay.appendChild(box);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
      s.root.appendChild(overlay);
    }

    // ----- 버튼 -----
    s.addButton('장 선택으로', () => Game.go('chapter', { chapter }));
    const startBtn = s.addButton('출발', () => {
      if (picked.length !== 3) return;
      Save.update((d) => { d.formation[String(chapter)] = picked.slice(); });
      const battleParams = {
        party: picked.slice(),
        enemies: (info && info.enemies) || (info && info.type === 'boss' ? ['shade', 'shade', 'shade'] : ['shade', 'shade']),
        onWin: () => (params.replay ? Game.go('chapter', { chapter }) : Game.completeStage(chapter, stage)),
      };
      Game.go('battle', battleParams);
    }, { primary: true });

    render();
  },
});
