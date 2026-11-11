/*
 * character.js — 캐릭터 (성장과 의존도)
 *
 * 부원별로: 레벨과 경험치, 능력치, 스킬 레벨 강화(등불 조각 사용), 의존도 단계와 효과,
 * 다른 부원과의 유대를 보여준다.
 */
Game.registerScreen('character', {
  title: '캐릭터',
  render(s, params) {
    const el = Game.el;
    s.root.classList.add('character');
    if (!Save.data) {
      s.body.appendChild(el('p', 'cs-empty', '게임을 시작하면 부원들의 성장을 볼 수 있어요.'));
      s.addButton('돌아가기', () => Game.go('title'), { primary: true });
      return;
    }
    const growth = Game.data.growth;
    const skillMap = new Map(Game.data.skills.map((sk) => [sk.id, sk]));
    let selected = params.id && Game.character(params.id) ? params.id : Game.data.characters[0].id;

    const header = el('div', 'cs-material');
    s.root.appendChild(header);
    const tabs = el('div', 'cs-tabs');
    const detail = el('div', 'cs-detail');
    s.root.append(tabs, detail);

    function renderHeader() {
      header.replaceChildren(
        el('span', 'cs-mat-icon', '✦'),
        el('span', null, `${growth.material.name} ${Save.data.materials}`),
      );
      header.title = growth.material.desc;
    }

    function renderTabs() {
      tabs.replaceChildren();
      for (const c of Game.data.characters) {
        const rec = Save.data.characters[c.id];
        const t = Game.button('', () => { selected = c.id; renderTabs(); renderDetail(); });
        t.classList.add('cs-tab');
        if (c.id === selected) t.classList.add('selected');
        t.style.setProperty('--c', c.color);
        t.appendChild(el('span', 'cs-tab-name', c.name));
        t.appendChild(el('span', 'cs-tab-lv', `Lv ${rec.level}`));
        tabs.appendChild(t);
      }
    }

    function bar(value, max, cls = '') {
      // gauge_exp / gauge_dep / gauge_bond
      return Assets.gauge(cls, max ? value / max : 0, 'cs-bar');
    }

    function panel(title, extra) {
      const p = el('section', 'cs-panel');
      const h = el('h2', 'cs-panel-title', title);
      if (extra) h.appendChild(el('span', 'cs-panel-extra', extra));
      p.appendChild(h);
      return p;
    }

    function renderDetail() {
      const c = Game.character(selected);
      const rec = Save.data.characters[c.id];
      detail.replaceChildren();

      // ----- 그림 -----
      const portrait = el('div', 'cs-portrait');
      portrait.appendChild(Assets.standing(c, 'default', 'cs-pic'));
      portrait.appendChild(el('div', 'cs-name', c.name));
      portrait.appendChild(el('div', 'cs-role', `${c.role} · ${c.grade}학년`));
      portrait.appendChild(el('div', 'cs-weak', `약점: ${c.weakness}`));
      detail.appendChild(portrait);

      const grid = el('div', 'cs-grid');
      detail.appendChild(grid);

      // ----- 레벨 -----
      const lvMax = growth.levelMax;
      const need = Growth.expToNext(rec.level);
      const st = Growth.stats(c, rec.level);
      const lv = panel('레벨', `Lv ${rec.level}${rec.level >= lvMax ? ' (최대)' : ''}`);
      lv.appendChild(el('div', 'cs-sub', rec.level >= lvMax ? '최대 레벨' : `경험치 ${rec.exp} / ${need}`));
      lv.appendChild(bar(rec.exp, need, 'exp'));
      const stats = el('div', 'cs-stats');
      for (const [label, val] of [['체력', st.hp], ['공격력', st.atk], ['속도', st.spd]]) {
        const box = el('div', 'cs-stat');
        box.append(el('span', 'cs-stat-label', label), el('span', 'cs-stat-val', String(val)));
        stats.appendChild(box);
      }
      lv.appendChild(stats);
      lv.appendChild(el('p', 'cs-note', '전투에서 이기면 경험치를 얻어요. 레벨이 오르면 체력, 공격력, 속도가 올라요.'));
      grid.appendChild(lv);

      // ----- 의존도 -----
      const dep = Growth.dependencyStage(rec.dependency);
      const dp = panel('의존도', `${dep.stage}단계 · ${dep.name}`);
      const stages = el('div', 'cs-stages');
      for (const sg of growth.dependency.stages) {
        const pip = el('span', `cs-stage${sg.stage <= dep.stage ? ' on' : ''}`, String(sg.stage));
        pip.title = sg.name;
        stages.appendChild(pip);
      }
      dp.appendChild(stages);
      if (dep.next) {
        dp.appendChild(el('div', 'cs-sub', `${dep.points} / ${dep.next.min} — 다음 단계 「${dep.next.name}」까지 ${dep.next.min - dep.points}`));
        dp.appendChild(bar(dep.points - dep.min, dep.next.min - dep.min, 'dep'));
      } else {
        dp.appendChild(el('div', 'cs-sub', `${dep.points} — 최고 단계`));
        dp.appendChild(bar(1, 1, 'dep'));
      }
      const eff = el('ul', 'cs-effects');
      eff.appendChild(el('li', null, `흔들림 최대치 ${100 + dep.shakeMaxBonus} (+${dep.shakeMaxBonus})`));
      eff.appendChild(el('li', null, `곁에 있기로 줄어드는 흔들림 ${skillMap.get('stay').shakeDown + dep.stayBonus} (+${dep.stayBonus})`));
      dp.appendChild(eff);
      const say = el('div', 'cs-say');
      say.appendChild(el('span', 'cs-say-label', '흔들릴 때'));
      say.appendChild(el('span', 'cs-say-line', `"${Growth.shakeLine(c.id, dep.stage)}"`));
      dp.appendChild(say);
      grid.appendChild(dp);

      // ----- 스킬 -----
      const sp = panel('스킬', `${growth.material.name} ${Save.data.materials}`);
      const maxLv = growth.skillUpgrade.maxLevel;
      for (const slot of ['skill', 'heart']) {
        const sk = skillMap.get(c.skills[slot]);
        const sl = rec.skillLevels[slot] || 1;
        const row = el('div', 'cs-skill');
        row.appendChild(Assets.icon(`skill_${c.id}_${slot}`, 'cs-skill-icon'));
        const text = el('div', 'cs-skill-text');
        text.appendChild(el('div', 'cs-skill-name', `${slot === 'heart' ? '마음 스킬' : '스킬'} · ${sk.name}`));
        const pct = Math.round((Growth.skillMultiplier(sl) - 1) * 100);
        text.appendChild(el('div', 'cs-skill-lv', `Lv ${sl}/${maxLv}${pct ? ` · 효과 +${pct}%` : ''}`));
        text.appendChild(el('div', 'cs-skill-desc', sk.desc));
        row.appendChild(text);
        const cost = Growth.upgradeCost(sl);
        const maxed = sl >= maxLv;
        const btn = Game.button('', () => {
          if (Growth.upgradeSkill(c.id, slot)) {
            Game.toast(`${sk.name} Lv ${sl + 1}`);
            renderHeader();
            renderDetail();
          }
        }, { disabled: maxed || Save.data.materials < cost });
        btn.classList.add('cs-upgrade');
        btn.appendChild(el('span', null, maxed ? '최대' : '강화'));
        if (!maxed) btn.appendChild(el('span', 'cs-upgrade-cost', `✦ ${cost}`));
        row.appendChild(btn);
        sp.appendChild(row);
      }
      grid.appendChild(sp);

      // ----- 유대 -----
      const bp = panel('유대', `최대 ${growth.bond.max}`);
      for (const o of Game.data.characters) {
        if (o.id === c.id) continue;
        const lvB = Growth.bondLevel(c.id, o.id);
        const row = el('div', 'cs-bond');
        row.style.setProperty('--c', o.color);
        row.appendChild(el('span', 'cs-bond-name', o.name));
        row.appendChild(bar(lvB, growth.bond.max, 'bond'));
        row.appendChild(el('span', 'cs-bond-lv', String(lvB)));
        bp.appendChild(row);
      }
      bp.appendChild(el('p', 'cs-note', '같은 적을 이어서 공격하면(협공), 흔들리는 동료를 붙잡으면 유대가 올라요. 유대가 높을수록 협공과 붙잡기가 강해져요.'));
      grid.appendChild(bp);
    }

    renderHeader();
    renderTabs();
    renderDetail();
    s.addButton('부실로', () => Game.go('room'), { primary: true });
  },
});
