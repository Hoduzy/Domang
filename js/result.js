/*
 * result.js — 전투 결과
 *
 * Game.go('result', { report, onNext }) — report 는 Growth.applyBattleRewards 의 결과.
 * 경험치(레벨업), 의존도(단계 변화), 유대, 얻은 등불 조각을 보여준다.
 */
Game.registerScreen('result', {
  title: '결과',
  render(s, params) {
    const el = Game.el;
    const report = params.report;
    s.root.classList.add('result');
    const next = params.onNext || (() => Game.go('room'));
    s.addButton('계속', () => next(), { primary: true });
    if (!report) return;

    const wrap = el('div', 'rs-wrap');
    s.root.appendChild(wrap);

    // ----- 경험치 -----
    const expPanel = el('div', 'rs-panel rs-exp');
    expPanel.appendChild(el('h2', 'rs-title', `경험치 +${report.expTotal}`));
    for (const r of report.exp) {
      const c = Game.character(r.id);
      const row = el('div', 'rs-row');
      row.style.setProperty('--c', c.color);
      row.appendChild(el('span', 'rs-name', c.name));
      row.appendChild(el('span', 'rs-lv', `Lv ${r.after.level}`));
      const track = el('div', 'rs-track');
      const fill = el('i');
      const need = Growth.expToNext(r.after.level);
      // 레벨업했으면 0에서, 아니면 이전 위치에서 채워진다
      const startPct = r.levelUp ? 0 : Math.min(100, (r.before.exp / Growth.expToNext(r.before.level)) * 100);
      fill.style.width = `${startPct}%`;
      track.appendChild(fill);
      row.appendChild(track);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        fill.style.width = `${Math.min(100, (r.after.exp / need) * 100)}%`;
      }));
      const gain = el('span', 'rs-gain', `+${r.gained}${r.reserve ? ' (대기)' : ''}`);
      row.appendChild(gain);
      if (r.levelUp) row.appendChild(el('span', 'rs-badge up', `레벨 업! ${r.before.level} → ${r.after.level}`));
      expPanel.appendChild(row);
    }
    wrap.appendChild(expPanel);

    const side = el('div', 'rs-side');
    wrap.appendChild(side);

    // ----- 의존도 -----
    const depPanel = el('div', 'rs-panel');
    depPanel.appendChild(el('h2', 'rs-title', '의존도'));
    for (const r of report.dependency) {
      const c = Game.character(r.id);
      const stage = Growth.dependencyStage(r.points);
      const row = el('div', 'rs-row compact');
      row.style.setProperty('--c', c.color);
      row.appendChild(el('span', 'rs-name', c.name));
      row.appendChild(el('span', 'rs-dep', `${stage.stage}단계 ${stage.name}`));
      row.appendChild(el('span', 'rs-gain', `+${r.gained}${r.stays ? ` (곁에 있기 ${r.stays}번)` : ''}`));
      if (r.toStage > r.fromStage) row.appendChild(el('span', 'rs-badge dep', '단계 상승!'));
      depPanel.appendChild(row);
    }
    side.appendChild(depPanel);

    // ----- 유대 -----
    const bondPanel = el('div', 'rs-panel');
    bondPanel.appendChild(el('h2', 'rs-title', '유대'));
    if (!report.bonds.length) {
      bondPanel.appendChild(el('p', 'rs-empty', '이번 전투에서는 오른 유대가 없어요. 같은 적을 이어서 공격하거나(협공) 흔들리는 동료를 붙잡으면 유대가 올라요.'));
    }
    for (const b of report.bonds) {
      const [a, z] = b.ids.map((id) => Game.character(id));
      const row = el('div', 'rs-row compact');
      row.appendChild(el('span', 'rs-pair', `${a.name} · ${z.name}`));
      const why = [b.combo && '협공', b.grab && '붙잡기'].filter(Boolean).join(', ');
      row.appendChild(el('span', 'rs-dep', `${b.from} → ${b.to}`));
      row.appendChild(el('span', 'rs-gain', why));
      bondPanel.appendChild(row);
    }
    side.appendChild(bondPanel);

    // ----- 재료 -----
    const mat = Game.data.growth.material;
    const matPanel = el('div', 'rs-panel rs-material');
    matPanel.appendChild(el('span', 'rs-mat-icon', '✦'));
    matPanel.appendChild(el('span', 'rs-mat-text', `${mat.name} +${report.material}`));
    matPanel.appendChild(el('span', 'rs-mat-total', `보유 ${Save.data ? Save.data.materials : 0}`));
    side.appendChild(matPanel);
  },
});
