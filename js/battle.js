/*
 * battle.js — 턴제 전투
 *
 * 사용: Game.go('battle', {
 *   party: ['hayun', 'seoyeon', 'jiyu'],   전장에 나서는 부원 (최대 3명)
 *   reserve: ['yuna', 'eunchae'],          (선택) 대기 부원. '교대'로 전장의 부원과 바꾼다
 *   enemies: ['shade', 'shade', 'shade'],  data/enemies.json 아이디
 *   tutorial: 'prologue_3',                (선택) data/tutorials.json 의 튜토리얼 묶음
 *   test: true,                            결과 창에 '다시 하기 / 타이틀로'
 *   onWin(), onLose()                      (선택) 끝났을 때. 있으면 결과 창에 '계속' 버튼
 * })
 *
 * 수치는 data/characters.json(능력치), data/skills.json(스킬), data/enemies.json(적)에 있다.
 *
 * ===== 규칙 요약 =====
 * 턴 순서   행동값(AV) = 10000 / 속도. 가장 작은 유닛이 행동하고, 행동하면 다시 10000 / 속도로 돌아간다.
 * 마음 게이지  기본 공격·스킬로 조금, 약점을 터뜨리면 크게, 피해를 받으면 조금 찬다. 100이면 마음 스킬.
 * 약점      적마다 약점 게이지. 0이 되면 약점 터짐: 다음 차례 1번을 쉬고, 그동안 받는 피해 1.5배.
 * 협공      아군이 바로 앞 아군과 같은 적을 이어서 때리면 발동. 피해·약점 피해 ×(1.25 + 유대×0.05).
 * 흔들림    적의 속삭임, 동료가 쓰러지는 것으로 찬다. 가득 차면 1~2턴 얼어붙음(행동 불가, 받는 피해 1.3배).
 * 붙잡기    다른 부원이 차례를 써서 얼어붙음을 풀고 흔들림을 줄인다. 유대가 높을수록 많이.
 * 곁에 있기  선생님 명령. 차례를 쓰지 않고 전투당 3번. 의존도 단계가 높을수록 많이.
 * 의존도    단계가 높을수록 흔들림 최대치가 늘고, 흔들릴 때 나오는 대사가 바뀐다 (data/growth.json).
 * 성장      레벨·스킬 레벨이 능력치와 스킬 효과에 반영된다. 이기면 결과 화면에서 경험치·의존도·유대가 오른다.
 * 교대      대기 부원이 있을 때만. 차례를 써서 전장의 부원 하나(쓰러진 부원 포함)를 대기 부원과 바꾼다.
 * 약속      상담한 그 아이만 끼는 전용 장비 (data/promises.json 의 stats).
 *           웃음: 공격력 +% (금: 약점을 터뜨리면 마음 게이지 추가) / 믿음: 흔들림 −% (금: 얼어붙기 직전 한 번 버팀)
 *           내일: 속도 + (금: 전투 시작 시 마음 게이지 30%)
 * 쓰러짐    체력 0이면 의식을 잃는다. 다른 부원의 흔들림이 오른다. 전장의 부원이 모두 쓰러지면 패배.
 */

const BattleTiming = { scale: 1 }; // 테스트에서 연출 속도를 줄일 때 사용

/** 받침에 맞춰 조사를 붙인다. josa('하윤', '이', '가') → '하윤이' */
function josa(word, withBatchim, withoutBatchim) {
  const code = word.charCodeAt(word.length - 1);
  const hasBatchim = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return word + (hasBatchim ? withBatchim : withoutBatchim);
}

const BATTLE_RULES = {
  AV_BASE: 10000,
  HEART_MAX: 100,
  HEART_ON_BREAK: 40,
  HEART_ON_HIT_TAKEN: 5,
  BROKEN_DAMAGE_MULT: 1.5,
  FROZEN_DAMAGE_MULT: 1.3,
  COMBO_BASE: 1.25,
  COMBO_PER_BOND: 0.05,
  BOND_LEVEL_MAX: 10,
  SHAKE_MAX: 100,
  SHAKE_ON_ALLY_DOWN: 20,
  SHAKE_AFTER_THAW: 0.5,
};

const Battle = { current: null };

Game.registerScreen('battle', {
  title: '전투',
  hideTitle: true,
  background: 'nightmare_hallway',
  render(s, params) {
    const el = Game.el;
    const R = BATTLE_RULES;
    const skillMap = new Map(Game.data.skills.map((sk) => [sk.id, sk]));
    const skill = (id) => skillMap.get(id);
    let alive = true;

    // ===== 유닛 만들기 =====
    const save = Save.data;
    const bondLevel = (a, b) => {
      const v = save ? save.bonds[Save.bondKey(a, b)] || 0 : 0;
      return Math.min(R.BOND_LEVEL_MAX, Math.max(0, v));
    };

    function makeAlly(id, index) {
      const c = Game.character(id);
      if (!c) throw new Error(`data/characters.json 에 "${id}" 부원이 없어요.`);
      const rec = save && save.characters[id];
      const level = rec ? rec.level : 1;
      const dep = Growth.dependencyStage(rec ? rec.dependency : 0);
      const st = Growth.stats(c, level);
      // 착용한 약속 (그 아이 전용)
      const promise = save ? save.promises.find((pr) => pr.equippedBy === id && pr.owner === id) || null : null;
      const pfx = promise ? (Game.data.promises.stats[promise.type] || {})[promise.grade] || {} : {};
      return {
        side: 'ally', uid: id, id, index, name: c.name, color: c.color, data: c, level,
        maxHp: st.hp, hp: st.hp,
        atk: Math.round(st.atk * (1 + (pfx.atkPct || 0) / 100)),
        spd: st.spd + (pfx.spd || 0),
        promise, pfx, endureLeft: pfx.endure || 0,
        shake: 0, shakeMax: R.SHAKE_MAX + dep.shakeMaxBonus, dep, saidShakeLine: false,
        skillLevels: rec ? { ...rec.skillLevels } : { skill: 1, heart: 1 },
        heart: Math.min(R.HEART_MAX, pfx.startHeart || 0), cooldowns: {}, frozen: 0, down: false,
        stealth: Boolean(c.traits && c.traits.stealthStart), charging: null,
        cover: false, coverReduce: 0, traits: c.traits || {},
        skillIds: { basic: 'basic_attack', skill: c.skills.skill, heart: c.skills.heart },
      };
    }

    function makeEnemy(id, index, count) {
      const e = Game.data.enemies.find((x) => x.id === id);
      if (!e) throw new Error(`data/enemies.json 에 "${id}" 적이 없어요.`);
      const suffix = count > 1 ? ' ' + 'ABCDEFG'[index] : '';
      return {
        side: 'enemy', uid: `${id}_${index}`, id, index, name: e.name + suffix, data: e,
        maxHp: e.hp, hp: e.hp, atk: e.atk, spd: e.spd,
        weakMax: e.weak, weak: e.weak, broken: false, mark: 0, down: false,
      };
    }

    const partyIds = (params.party || ['hayun', 'seoyeon', 'jiyu']).slice(0, 3);
    const reserveIds = (params.reserve || []).filter((id) => !partyIds.includes(id));
    const enemyIds = params.enemies || ['shade', 'shade', 'shade'];
    let allies;   // 전장의 부원 (자리 순서)
    let bench;    // 대기 부원
    let enemies;
    try {
      allies = partyIds.map(makeAlly);
      bench = reserveIds.map((id, i) => makeAlly(id, partyIds.length + i));
      enemies = enemyIds.map((id, i) => makeEnemy(id, i, enemyIds.length));
    } catch (err) {
      s.body.appendChild(el('p', 'bt-error', err.message));
      s.addButton('돌아가기', () => Game.go('title'));
      return undefined;
    }
    const hasBench = bench.length > 0;
    if (hasBench) s.root.classList.add('has-bench');
    [...allies, ...bench, ...enemies].forEach((u) => { u.av = R.AV_BASE / u.spd; });

    const fieldUnits = () => [...allies, ...enemies];
    const everyUnit = () => [...allies, ...bench, ...enemies];

    const state = {
      get allies() { return allies; },
      get bench() { return bench; },
      enemies,
      turn: 0,
      enemyTurns: 0,
      actor: null,
      stayUses: skill('stay').uses,
      lastAllyAttack: null, // { attacker, target } 협공 판정용
      fielded: new Set(allies.map((a) => a.id)), // 전장에 한 번이라도 나선 부원
      stays: {},            // 곁에 있기를 받은 횟수
      comboPairs: new Set(),
      grabPairs: new Set(),
      phase: 'start',       // start | command | target | busy | tutorial | ended
      result: null,
    };
    Battle.current = state; // 디버그·테스트용

    const livingAllies = () => allies.filter((u) => !u.down);
    const livingEnemies = () => enemies.filter((u) => !u.down);
    const livingBench = () => bench.filter((u) => !u.down);
    const rand = (a, b) => a + Math.random() * (b - a);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms * BattleTiming.scale));

    // ===== 화면 =====
    s.root.classList.add('battle');
    const timeline = el('div', 'bt-timeline');
    const field = el('div', 'bt-field');
    const partySide = el('div', 'bt-party-side');
    const benchEl = el('div', 'bt-bench');
    const partyEl = el('div', 'bt-party');
    partySide.append(benchEl, partyEl);
    const enemyEl = el('div', 'bt-enemies');
    field.append(partySide, enemyEl);
    const panel = el('div', 'bt-panel');
    const actorEl = el('div', 'bt-actor');
    const descEl = el('div', 'bt-desc');
    const actionsEl = el('div', 'bt-actions');
    const logEl = el('div', 'bt-log');
    const left = el('div', 'bt-panel-left');
    left.append(actorEl, descEl);
    const right = el('div', 'bt-panel-right');
    right.append(actionsEl, logEl);
    panel.append(left, right);
    s.root.append(timeline, field, panel);

    const retreatBtn = Game.button('후퇴', async () => {
      if (state.phase === 'ended') return;
      if (await Game.confirm('전투를 그만두고 나갈까요?', { ok: '후퇴' })) exit();
    });
    retreatBtn.classList.add('bt-retreat');
    s.root.appendChild(retreatBtn);

    function bar(cls, label) {
      const wrap = el('div', `bt-bar ${cls}`);
      const track = el('div', 'bt-bar-track');
      const fill = el('i');
      track.append(fill, el('span', 'bt-bar-label', label));
      wrap.appendChild(track);
      const value = el('span', 'bt-bar-value');
      wrap.appendChild(value);
      return { wrap, fill, value };
    }

    for (const u of [...allies, ...bench]) {
      const card = el('div', 'bt-unit ally');
      card.dataset.uid = u.uid;
      card.appendChild(Assets.nightmare(u.data, 'bt-pic'));
      const info = el('div', 'bt-info');
      info.appendChild(el('div', 'bt-name', u.name));
      u.ui = { card, hp: bar('hp', '체력'), shake: bar('shake', '흔들림'), heart: bar('heart', '마음'), tags: el('div', 'bt-tags') };
      info.append(u.ui.hp.wrap, u.ui.shake.wrap, u.ui.heart.wrap, u.ui.tags);
      card.appendChild(info);
      card.addEventListener('click', () => onUnitTap(u));

      // 대기석용 작은 카드
      const mini = el('div', 'bt-bench-card');
      mini.dataset.uid = u.uid;
      mini.style.setProperty('--chip', u.color);
      mini.appendChild(el('span', 'bt-bench-name', u.name));
      u.ui.miniHp = bar('hp', '체력');
      mini.appendChild(u.ui.miniHp.wrap);
      mini.addEventListener('click', () => onUnitTap(u));
      u.ui.mini = mini;
    }
    for (const u of enemies) {
      const card = el('div', `bt-unit enemy${u.data.boss ? ' boss' : ''}`);
      card.dataset.uid = u.uid;
      const info = el('div', 'bt-info');
      info.appendChild(el('div', 'bt-name', u.name));
      u.ui = { card, hp: bar('hp', '체력'), weak: bar('weak', '약점'), tags: el('div', 'bt-tags') };
      info.append(u.ui.hp.wrap, u.ui.weak.wrap, u.ui.tags);
      card.appendChild(info);
      card.appendChild(Assets.enemy(u.id, u.name, 'bt-pic'));
      card.addEventListener('click', () => onUnitTap(u));
      enemyEl.appendChild(card);
    }

    function layoutParty() {
      partyEl.replaceChildren(...allies.map((u) => u.ui.card));
      benchEl.replaceChildren();
      if (hasBench) {
        benchEl.appendChild(el('span', 'bt-bench-label', '대기'));
        bench.forEach((u) => benchEl.appendChild(u.ui.mini));
      }
    }
    layoutParty();

    /** 대상 고르기 표시를 붙일 요소 (대기 부원은 작은 카드) */
    const cardOf = (u) => (bench.includes(u) ? u.ui.mini : u.ui.card);

    function setBar(b, value, max, text) {
      b.fill.style.width = `${Math.max(0, Math.min(1, value / max)) * 100}%`;
      b.value.textContent = text != null ? text : `${Math.max(0, Math.round(value))}`;
    }

    function tags(u) {
      const t = [];
      if (u.down) t.push(['의식을 잃음', 'down']);
      if (u.side === 'ally') {
        if (u.frozen) t.push([`얼어붙음 ${u.frozen}`, 'frozen']);
        if (u.stealth) t.push(['숨음', 'stealth']);
        if (u.charging) t.push(['준비 중', 'charge']);
        if (u.cover) t.push(['우산', 'cover']);
        if (u.promise) t.push([`${Game.data.promises.types[u.promise.type].name.replace('의 약속', '')}·${Game.data.promises.grades[u.promise.grade]}${u.endureLeft ? ' ✦' : ''}`, `promise ${u.promise.grade}`]);
        const cd = u.cooldowns[u.skillIds.skill];
        if (cd) t.push([`스킬 ${cd}턴`, 'cd']);
      } else {
        if (u.broken) t.push(['약점 터짐', 'broken']);
        if (u.mark) t.push([`표시 ${u.mark}`, 'mark']);
      }
      return t;
    }

    function updateUI() {
      for (const u of everyUnit()) {
        setBar(u.ui.hp, u.hp, u.maxHp);
        if (u.side === 'ally') {
          setBar(u.ui.shake, u.shake, u.shakeMax);
          setBar(u.ui.heart, u.heart, R.HEART_MAX, u.heart >= R.HEART_MAX ? 'MAX' : `${u.heart}`);
          setBar(u.ui.miniHp, u.hp, u.maxHp);
          u.ui.mini.classList.toggle('down', u.down);
        } else {
          setBar(u.ui.weak, u.weak, u.weakMax);
        }
        u.ui.tags.replaceChildren(...tags(u).map(([text, cls]) => el('span', `bt-tag ${cls}`, text)));
        u.ui.card.classList.toggle('down', u.down);
        u.ui.card.classList.toggle('frozen', Boolean(u.frozen));
        u.ui.card.classList.toggle('broken', Boolean(u.broken));
        u.ui.card.classList.toggle('active', state.actor === u);
      }
      renderTimeline();
    }

    // ===== 턴 순서 =====
    const order = (u) => (u.side === 'ally' ? allies.indexOf(u) : 10 + u.index);

    function upcoming(count) {
      const sim = fieldUnits().filter((u) => !u.down).map((u) => ({ u, av: u.av }));
      const out = [];
      if (!sim.length) return out;
      for (let i = 0; i < count; i++) {
        sim.sort((a, b) => a.av - b.av || order(a.u) - order(b.u));
        const next = sim[0];
        out.push(next.u);
        const dt = next.av;
        sim.forEach((x) => { x.av -= dt; });
        next.av = R.AV_BASE / next.u.spd;
      }
      return out;
    }

    function renderTimeline() {
      const list = [];
      if (state.actor && !state.actor.down && fieldUnits().includes(state.actor)) list.push(state.actor);
      list.push(...upcoming(8 - list.length));
      timeline.replaceChildren(el('span', 'bt-timeline-label', '행동 순서'));
      list.forEach((u, i) => {
        const chip = el('div', `bt-chip ${u.side}${i === 0 && state.actor === u ? ' now' : ''}`);
        if (u.side === 'ally') chip.style.setProperty('--chip', u.color);
        chip.appendChild(el('span', null, u.name));
        timeline.appendChild(chip);
      });
    }

    function nextActor() {
      const living = fieldUnits().filter((u) => !u.down);
      living.sort((a, b) => a.av - b.av || order(a) - order(b));
      const actor = living[0];
      const dt = actor.av;
      living.forEach((u) => { u.av -= dt; });
      actor.av = R.AV_BASE / actor.spd;
      return actor;
    }

    // ===== 연출 =====
    function log(text, cls = '') {
      const line = el('div', `bt-log-line ${cls}`, text);
      logEl.appendChild(line);
      while (logEl.children.length > 3) logEl.firstChild.remove();
    }

    function pop(u, text, cls = '') {
      const p = el('div', `bt-pop ${cls}`, text);
      const stack = u.ui.card.querySelectorAll('.bt-pop').length;
      p.style.setProperty('--pop-offset', `${stack * 48}px`);
      u.ui.card.appendChild(p);
      setTimeout(() => p.remove(), 1100);
    }

    // ===== 튜토리얼 =====
    const tutorials = (params.tutorial && (Game.data.tutorials || {})[params.tutorial]) || [];
    const shownTutorials = new Set();
    const queuedTriggers = new Set();
    let closeTutorial = null;

    function showTutorialBox(t) {
      return new Promise((resolve) => {
        const overlay = el('div', 'bt-tutorial');
        const box = el('div', 'bt-tutorial-box');
        box.appendChild(el('div', 'bt-tutorial-tag', '튜토리얼'));
        if (t.title) box.appendChild(el('h2', null, t.title));
        box.appendChild(el('p', null, t.text));
        const done = () => { overlay.remove(); closeTutorial = null; resolve(); };
        closeTutorial = done;
        box.appendChild(Game.button('확인', done, { primary: true }));
        overlay.appendChild(box);
        s.root.appendChild(overlay);
      });
    }

    function eventPossible(ev) {
      if (!ev) return true;
      if (ev.type === 'freeze') {
        const u = allies.find((a) => a.id === ev.target);
        return Boolean(u && !u.down && !u.frozen);
      }
      return true;
    }

    function applyEvent(ev) {
      if (!ev) return;
      if (ev.type === 'freeze') {
        const u = allies.find((a) => a.id === ev.target);
        u.shake = u.shakeMax;
        u.frozen = ev.turns || 2;
        u.charging = null;
        if (ev.log) log(ev.log, 'frozen');
        log(`${josa(u.name, '이', '가')} 얼어붙었다. (${u.frozen}턴)`, 'frozen');
        pop(u, '얼어붙음', 'shake');
        sayShakeLine(u);
      }
    }

    function triggerMatches(when, trigger) {
      if (when === trigger) return true;
      // enemyTurn:N 은 N번째 적 차례부터 조건이 맞는 첫 차례에
      const m = /^enemyTurn:(\d+)$/.exec(when);
      return Boolean(m && trigger === 'enemyTurn' && state.enemyTurns >= Number(m[1]));
    }

    async function runTutorials(trigger) {
      for (let i = 0; i < tutorials.length; i++) {
        const t = tutorials[i];
        if (shownTutorials.has(i) || !triggerMatches(t.when, trigger) || !eventPossible(t.event)) continue;
        shownTutorials.add(i);
        applyEvent(t.event);
        updateUI();
        const prev = state.phase;
        state.phase = 'tutorial';
        await showTutorialBox(t);
        if (!alive) return;
        state.phase = prev;
      }
    }

    const queueTrigger = (name) => { if (tutorials.length) queuedTriggers.add(name); };
    async function flushTriggers() {
      for (const name of [...queuedTriggers]) {
        queuedTriggers.delete(name);
        await runTutorials(name);
      }
    }

    // ===== 피해와 상태 =====
    function hitEnemy(actor, target, sk, { combo = 1, breakMult = 1 } = {}) {
      if (target.down) return;
      const dmgMult = (target.broken ? R.BROKEN_DAMAGE_MULT : 1) * combo;
      const dmg = Math.max(1, Math.round(actor.atk * (sk.power || 0) * dmgMult * rand(0.95, 1.05)));
      target.hp -= dmg;
      pop(target, `${dmg}`, combo > 1 ? 'combo' : '');

      if (!target.broken && sk.break) {
        const br = sk.break * breakMult * (target.mark ? 2 : 1) * combo;
        target.weak = Math.max(0, target.weak - Math.round(br));
        if (target.weak === 0) {
          target.broken = true;
          addHeart(actor, R.HEART_ON_BREAK);
          if (actor.pfx && actor.pfx.breakHeart) {
            addHeart(actor, actor.pfx.breakHeart);
            log(`웃음의 약속 — ${actor.name}의 마음 게이지가 +${actor.pfx.breakHeart} 더 찼다.`, 'break');
          }
          pop(target, '약점 터짐!', 'break');
          log(`${target.name}의 약점이 터졌다! ${actor.name}의 마음 게이지가 크게 찼다.`, 'break');
          queueTrigger('break');
        }
      }
      if (target.hp <= 0) {
        target.hp = 0;
        target.down = true;
        target.broken = false;
        target.mark = 0;
        log(`${josa(target.name, '이', '가')} 흩어졌다.`);
        if (state.lastAllyAttack && state.lastAllyAttack.target === target) state.lastAllyAttack = null;
      }
    }

    function hitAlly(enemy, target, action, { aoe = false } = {}) {
      let t = target;
      const coverer = allies.find((a) => a.cover && !a.down);
      if (!aoe && !action.shake && coverer && coverer !== t) {
        t = coverer;
        log(`${josa(coverer.name, '이', '가')} 우산으로 ${josa(target.name, '을', '를')} 감쌌다.`);
      }
      let mult = t.frozen ? R.FROZEN_DAMAGE_MULT : 1;
      if (t.cover) mult *= 1 - t.coverReduce;
      const dmg = Math.max(1, Math.round(enemy.atk * action.power * mult * rand(0.9, 1.1)));
      t.hp -= dmg;
      pop(t, `${dmg}`, 'hurt');
      addHeart(t, R.HEART_ON_HIT_TAKEN);
      if (action.shake) addShake(t, action.shake);
      if (t.hp <= 0) knockOut(t);
    }

    function addHeart(u, amount) {
      if (u.down) return;
      u.heart = Math.min(R.HEART_MAX, u.heart + amount);
    }

    function addShake(u, amount) {
      if (u.down || u.frozen) return;
      let mult = (u.traits.shakeMult || 1) * (1 - (u.pfx && u.pfx.shakeReducePct || 0) / 100);
      if (u.traits.lonelyShakeMult && livingAllies().length === 1) mult *= u.traits.lonelyShakeMult;
      const gain = Math.round(amount * mult);
      u.shake = Math.min(u.shakeMax, u.shake + gain);
      pop(u, `흔들림 +${gain}`, 'shake');
      // 믿음의 약속 (금): 얼어붙기 직전 한 번 스스로 버틴다
      if (u.shake >= u.shakeMax && u.endureLeft > 0) {
        u.endureLeft -= 1;
        u.shake = u.shakeMax - 1;
        pop(u, '버팀!', 'calm');
        log(`믿음의 약속 — ${josa(u.name, '이', '가')} 스스로 버텼다. "${u.promise.line || '…아직 괜찮아.'}"`, 'calm');
      }
      if (u.shake >= u.shakeMax) {
        u.frozen = Math.random() < 0.5 ? 1 : 2;
        u.charging = null;
        log(`${josa(u.name, '이', '가')} 얼어붙었다. (${u.frozen}턴)`, 'frozen');
      }
      if (u.shake >= u.shakeMax * Game.data.growth.shakeLines.threshold) sayShakeLine(u);
    }

    /** 흔들림이 높을 때 한 번 하는 말. 의존도 단계에 따라 바뀐다. 흔들림이 절반 아래로 내려가면 다시 말할 수 있다 */
    function sayShakeLine(u) {
      if (u.saidShakeLine || u.down) return;
      u.saidShakeLine = true;
      const line = Growth.shakeLine(u.id, u.dep.stage);
      log(`${u.name}: "${line}"`, u.dep.stage >= 4 ? 'calm' : 'frozen');
      const bubble = el('div', `bt-say stage${u.dep.stage}`, line);
      u.ui.card.appendChild(bubble);
      setTimeout(() => bubble.remove(), 2600);
    }

    function reduceShake(u, amount, label) {
      if (u.down) return;
      const wasFrozen = Boolean(u.frozen);
      u.frozen = 0;
      u.shake = Math.max(0, u.shake - amount);
      if (u.shake < u.shakeMax * 0.5) u.saidShakeLine = false;
      pop(u, `흔들림 −${amount}`, 'calm');
      if (wasFrozen && label) log(label);
    }

    function knockOut(u) {
      u.hp = 0;
      u.down = true;
      u.frozen = 0;
      u.stealth = false;
      u.cover = false;
      u.charging = null;
      log(`${josa(u.name, '이', '가')} 의식을 잃었다.`, 'down');
      for (const other of livingAllies()) addShake(other, R.SHAKE_ON_ALLY_DOWN);
    }

    // ===== 스킬 =====
    function comboFor(actor, target) {
      const last = state.lastAllyAttack;
      if (last && last.target === target && last.attacker !== actor && !last.attacker.down && allies.includes(last.attacker)) {
        const bond = bondLevel(actor.id, last.attacker.id);
        return { mult: R.COMBO_BASE + bond * R.COMBO_PER_BOND, partner: last.attacker, bond };
      }
      return null;
    }

    /** 스킬 대상을 고를 수 있는 유닛들 */
    function targetsFor(actor, sk) {
      switch (sk.target) {
        case 'enemy': return livingEnemies();
        case 'all_enemies': return livingEnemies();
        case 'others': return livingAllies().filter((a) => a !== actor);
        case 'self': return [actor];
        case 'ready_ally': return livingAllies().filter((a) => a !== actor && !a.frozen);
        case 'shaken_ally': return livingAllies().filter((a) => a !== actor && (a.frozen || a.shake > 0));
        case 'shaken_ally_any': return livingAllies().filter((a) => a.frozen || a.shake > 0);
        case 'swap_out': return livingBench().length ? [...allies] : [];
        default: return [];
      }
    }
    const pickOne = (sk) => ['enemy', 'ready_ally', 'shaken_ally', 'shaken_ally_any', 'swap_out'].includes(sk.target);

    /** 스킬 레벨을 반영한 스킬 (피해·약점 피해·회복·흔들림 감소) */
    function scaled(actor, base) {
      if (base.slot !== 'skill' && base.slot !== 'heart') return base;
      const m = Growth.skillMultiplier(actor.skillLevels[base.slot]);
      if (m === 1) return base;
      return {
        ...base,
        power: base.power != null ? base.power * m : base.power,
        break: base.break != null ? base.break * m : base.break,
        effects: (base.effects || []).map((fx) => ({
          ...fx,
          ...(fx.ratio != null ? { ratio: fx.ratio * m } : {}),
          ...(fx.type === 'shake_down' ? { amount: Math.round(fx.amount * m) } : {}),
        })),
      };
    }

    async function useSkill(actor, baseSkill, target, { releasing = false } = {}) {
      const sk = scaled(actor, baseSkill);
      const effects = sk.effects || [];
      const has = (type) => effects.find((e) => e.type === type);

      if (sk.slot === 'heart') actor.heart = 0;

      // 준비가 필요한 스킬: 이번 차례는 준비만
      if (has('charge') && !releasing) {
        actor.charging = sk.id;
        log(`${josa(actor.name, '이', '가')} ${josa(sk.name, '을', '를')} 준비한다…`);
        addHeart(actor, sk.heart || 0);
        return;
      }
      if (sk.slot === 'skill' && sk.cooldown) actor.cooldowns[sk.id] = sk.cooldown;

      log(`${actor.name} — ${sk.name}`, 'skill');

      // 피해
      if (sk.target === 'enemy') {
        const combo = comboFor(actor, target);
        let breakMult = 1;
        const strike = has('stealth_strike');
        if (strike && actor.stealth) {
          breakMult = strike.breakMult;
          actor.stealth = false;
          log(`${josa(actor.name, '이', '가')} 그림자에서 나타났다. 약점 피해 ${strike.breakMult}배!`);
        }
        if (combo) {
          log(`협공! ${josa(combo.partner.name, '과', '와')} ${actor.name} (유대 ${combo.bond}) — ×${combo.mult.toFixed(2)}`, 'combo');
          pop(target, '협공!', 'combo');
          state.comboPairs.add(Save.bondKey(actor.id, combo.partner.id));
          queueTrigger('combo');
        }
        hitEnemy(actor, target, sk, { combo: combo ? combo.mult : 1, breakMult });
        state.lastAllyAttack = { attacker: actor, target };
      } else if (sk.target === 'all_enemies') {
        for (const e of livingEnemies()) hitEnemy(actor, e, sk);
        state.lastAllyAttack = null;
      } else {
        state.lastAllyAttack = null;
      }

      // 효과
      for (const fx of effects) {
        switch (fx.type) {
          case 'stealth':
            actor.stealth = true;
            log(`${josa(actor.name, '이', '가')} 다시 모습을 감췄다.`);
            break;
          case 'mark': {
            const list = sk.target === 'all_enemies' ? livingEnemies() : [target].filter((t) => !t.down);
            list.forEach((e) => { e.mark = fx.turns; pop(e, '표시', 'mark'); });
            break;
          }
          case 'baton':
            target.av = -1;
            addHeart(target, fx.heartGift || 0);
            log(`${josa(actor.name, '이', '가')} ${target.name}에게 차례를 넘겼다.`);
            break;
          case 'baton_all':
            livingAllies().filter((a) => a !== actor).forEach((a, i) => { a.av = -3 + i; });
            break;
          case 'heal':
            for (const a of livingAllies().filter((x) => x !== actor)) {
              const amount = Math.round(a.maxHp * fx.ratio);
              a.hp = Math.min(a.maxHp, a.hp + amount);
              pop(a, `+${amount}`, 'heal');
            }
            break;
          case 'shake_down':
            for (const a of livingAllies().filter((x) => fx.includeSelf || x !== actor)) {
              if (a.shake > 0 || a.frozen) reduceShake(a, fx.amount, `${a.name}의 얼어붙음이 풀렸다.`);
            }
            break;
          case 'cover':
            actor.cover = true;
            actor.coverReduce = fx.reduce;
            break;
          default:
            break;
        }
      }
      addHeart(actor, sk.heart || 0);
    }

    async function grab(actor, target) {
      const g = skill('grab');
      const bond = bondLevel(actor.id, target.id);
      const amount = g.shakeDown + bond * g.bondBonus;
      log(`${josa(actor.name, '이', '가')} ${target.name}의 손을 잡았다. (유대 ${bond})`, 'calm');
      reduceShake(target, amount, `${target.name}의 얼어붙음이 풀렸다.`);
      addHeart(actor, g.heart || 0);
      state.lastAllyAttack = null;
      state.grabPairs.add(Save.bondKey(actor.id, target.id));
      queueTrigger('grab');
    }

    function stay(target) {
      const st = skill('stay');
      state.stayUses -= 1;
      const amount = st.shakeDown + target.dep.stayBonus;
      state.stays[target.id] = (state.stays[target.id] || 0) + 1;
      log(`선생님 — 곁에 있기. "${target.name}, 여기 있어." (의존도 ${target.dep.name} · 남은 횟수 ${state.stayUses})`, 'calm');
      reduceShake(target, amount, `${target.name}의 얼어붙음이 풀렸다.`);
    }

    function swap(out, incoming) {
      const i = allies.indexOf(out);
      const j = bench.indexOf(incoming);
      allies[i] = incoming;
      bench[j] = out;
      out.cover = false;
      out.coverReduce = 0;
      out.charging = null;
      incoming.av = R.AV_BASE / incoming.spd;
      state.fielded.add(incoming.id);
      if (state.lastAllyAttack && state.lastAllyAttack.attacker === out) state.lastAllyAttack = null;
      log(`교대 — ${josa(out.name, '이', '가')} 물러나고 ${josa(incoming.name, '이', '가')} 나선다.`);
      layoutParty();
    }

    // ===== 명령 입력 =====
    let pending = null; // { action, skill, targets, step } 대상 고르는 중
    let resolveCommand = null;

    function showDesc(sk, extra = '') {
      descEl.replaceChildren();
      if (!sk) return;
      descEl.appendChild(el('div', 'bt-desc-name', sk.name));
      descEl.appendChild(el('div', 'bt-desc-text', sk.desc + (extra ? ` ${extra}` : '')));
    }

    function actionButton(label, sub, onClick, { disabled = false, cls = '' } = {}) {
      const b = Game.button('', onClick, { disabled });
      b.classList.add('bt-action');
      if (cls) b.classList.add(cls);
      b.appendChild(el('span', 'bt-action-name', label));
      if (sub) b.appendChild(el('span', 'bt-action-sub', sub));
      return b;
    }

    function renderCommands() {
      const a = state.actor;
      actionsEl.replaceChildren();
      actorEl.replaceChildren(el('span', 'bt-actor-name', a.name), el('span', 'bt-actor-sub', `${a.data.role} · 차례`));
      descEl.replaceChildren(el('div', 'bt-desc-text dim', '행동을 고르세요.'));

      const basic = skill(a.skillIds.basic);
      const sk = skill(a.skillIds.skill);
      const heart = skill(a.skillIds.heart);
      const cd = a.cooldowns[sk.id] || 0;
      const grabSk = skill('grab');
      const staySk = skill('stay');
      const swapSk = skill('swap');

      const add = (b, s2) => {
        if (s2) {
          b.addEventListener('pointerenter', () => { if (state.phase === 'command') showDesc(s2); });
          b.addEventListener('focus', () => { if (state.phase === 'command') showDesc(s2); });
        }
        actionsEl.appendChild(b);
      };
      add(actionButton(basic.name, '', () => choose('skill', basic)), basic);
      add(actionButton(sk.name, cd ? `${cd}턴 남음` : '스킬', () => choose('skill', sk),
        { disabled: cd > 0 || !targetsFor(a, sk).length }), sk);
      add(actionButton(heart.name, a.heart >= R.HEART_MAX ? '마음 스킬' : `마음 ${a.heart}/100`, () => choose('skill', heart),
        { disabled: a.heart < R.HEART_MAX || !targetsFor(a, heart).length, cls: a.heart >= R.HEART_MAX ? 'ready' : '' }), heart);
      add(actionButton(grabSk.name, '차례 사용', () => choose('grab', grabSk),
        { disabled: !targetsFor(a, grabSk).length }), grabSk);
      if (hasBench) {
        add(actionButton(swapSk.name, `대기 ${livingBench().length}명`, () => choose('swap', swapSk),
          { disabled: !targetsFor(a, swapSk).length }), swapSk);
      }
      add(actionButton(staySk.name, `선생님 ${state.stayUses}/${staySk.uses}`, () => choose('stay', staySk),
        { disabled: state.stayUses <= 0 || !targetsFor(a, staySk).length, cls: 'teacher' }), staySk);
    }

    function markTargets(list) {
      everyUnit().forEach((u) => {
        u.ui.card.classList.remove('targetable');
        if (u.ui.mini) u.ui.mini.classList.remove('targetable');
      });
      list.forEach((u) => cardOf(u).classList.add('targetable'));
    }

    function choose(action, sk) {
      if (state.phase !== 'command') return;
      const list = targetsFor(state.actor, sk);
      if (!list.length) return;
      pending = { action, skill: sk, targets: list, step: 1 };
      state.phase = 'target';
      markTargets(list);
      const hint = action === 'swap' ? '물러날 부원을 누르세요.' : pickOne(sk) ? '대상을 누르세요.' : '표시된 대상에게 사용돼요.';
      showDesc(sk, hint);
      actionsEl.replaceChildren();
      if (!pickOne(sk)) actionsEl.appendChild(actionButton('사용', '', () => confirmTarget(list[0])));
      actionsEl.appendChild(actionButton('취소', '', cancelTarget, { cls: 'cancel' }));
    }

    function cancelTarget() {
      if (state.phase !== 'target') return;
      pending = null;
      state.phase = 'command';
      markTargets([]);
      renderCommands();
    }

    function onUnitTap(u) {
      if (state.phase !== 'target' || !pending || !pending.targets.includes(u)) return;
      confirmTarget(u);
    }

    async function confirmTarget(target) {
      if (state.phase !== 'target' || !pending) return;
      const { action, skill: sk } = pending;

      // 교대는 두 단계: 물러날 부원 → 나설 대기 부원
      if (action === 'swap' && pending.step === 1) {
        pending = { action, skill: sk, out: target, targets: livingBench(), step: 2 };
        markTargets(pending.targets);
        showDesc(sk, `${josa(target.name, '과', '와')} 바꿀 대기 부원을 누르세요.`);
        return;
      }

      const out = pending.out;
      pending = null;
      markTargets([]);
      if (action === 'stay') {
        // 선생님 명령은 차례를 쓰지 않는다
        stay(target);
        updateUI();
        state.phase = 'command';
        renderCommands();
        return;
      }
      state.phase = 'busy';
      actionsEl.replaceChildren();
      resolveCommand({ action, skill: sk, target, out });
    }

    function waitForCommand() {
      return new Promise((resolve) => {
        resolveCommand = resolve;
        state.phase = 'command';
        renderCommands();
      });
    }

    // ===== 차례 진행 =====
    async function allyTurn(a) {
      for (const id of Object.keys(a.cooldowns)) if (a.cooldowns[id] > 0) a.cooldowns[id] -= 1;
      if (a.cover) { a.cover = false; a.coverReduce = 0; }
      const strike = skill(a.skillIds.skill);
      if (a.traits.stealthStart && !a.stealth && !a.cooldowns[strike.id]) {
        a.stealth = true;
        log(`${josa(a.name, '이', '가')} 다시 그림자 속으로 숨었다.`);
      }
      updateUI();

      if (a.frozen) {
        a.frozen -= 1;
        log(`${josa(a.name, '은', '는')} 얼어붙어 움직이지 못한다.`, 'frozen');
        if (!a.frozen) {
          a.shake = Math.round(a.shakeMax * R.SHAKE_AFTER_THAW);
          log(`${josa(a.name, '이', '가')} 가까스로 정신을 차렸다.`);
        }
        await sleep(700);
        return;
      }

      if (a.charging) {
        const sk = skill(a.charging);
        a.charging = null;
        await useSkill(a, sk, null, { releasing: true });
        updateUI();
        await flushTriggers();
        await sleep(700);
        return;
      }

      await runTutorials(`allyTurn:${a.id}`);
      if (!alive) return;
      const cmd = await waitForCommand();
      if (!alive) return;
      if (cmd.action === 'grab') await grab(a, cmd.target);
      else if (cmd.action === 'swap') swap(cmd.out, cmd.target);
      else await useSkill(a, cmd.skill, cmd.target);
      updateUI();
      await flushTriggers();
      await sleep(600);
    }

    function pickWeighted(list) {
      const total = list.reduce((n, x) => n + (x.weight || 1), 0);
      let r = Math.random() * total;
      for (const x of list) {
        r -= x.weight || 1;
        if (r <= 0) return x;
      }
      return list[list.length - 1];
    }

    async function enemyTurn(e) {
      state.enemyTurns += 1;
      actorEl.replaceChildren(el('span', 'bt-actor-name enemy', e.name), el('span', 'bt-actor-sub', '적의 차례'));
      descEl.replaceChildren();
      actionsEl.replaceChildren();
      await runTutorials('enemyTurn');
      if (!alive || !livingAllies().length) return;
      if (e.broken) {
        e.broken = false;
        e.weak = e.weakMax;
        log(`${josa(e.name, '은', '는')} 약점이 터져 움직이지 못했다. 약점 게이지가 회복됐다.`);
      } else {
        const action = pickWeighted(e.data.actions);
        log(`${e.name} — ${action.name}${action.line ? ` "${action.line}"` : ''}`, 'enemy');
        if (action.target === 'all') {
          for (const a of livingAllies()) hitAlly(e, a, action, { aoe: true });
        } else {
          const visible = livingAllies().filter((a) => !a.stealth);
          const pool = visible.length ? visible : livingAllies();
          const target = pool[Math.floor(Math.random() * pool.length)];
          hitAlly(e, target, action);
        }
      }
      if (e.mark) e.mark -= 1;
      updateUI();
      await sleep(800);
    }

    function checkEnd() {
      if (!livingEnemies().length) return 'win';
      if (!livingAllies().length) return 'lose';
      return null;
    }

    async function loop() {
      log(enemies.some((e) => e.data.boss) ? `${josa(enemies.find((e) => e.data.boss).name, '이', '가')} 길을 막아선다.` : '악몽 속 그늘이 모여든다.');
      updateUI();
      await sleep(400);
      for (const a of allies) {
        if (a.pfx && a.pfx.startHeart) log(`내일의 약속 — ${a.name}의 마음 게이지가 ${a.pfx.startHeart}%에서 시작한다.`, 'calm');
      }
      await runTutorials('start');
      while (alive) {
        const result = checkEnd();
        if (result) return finish(result);
        const actor = nextActor();
        state.actor = actor;
        state.turn += 1;
        updateUI();
        if (actor.side === 'ally') await allyTurn(actor);
        else await enemyTurn(actor);
      }
      return undefined;
    }

    // ===== 끝 =====
    function finish(result) {
      state.phase = 'ended';
      state.result = result;
      state.actor = null;
      updateUI();
      actionsEl.replaceChildren();
      actorEl.replaceChildren(el('span', 'bt-actor-name', result === 'win' ? '승리' : '패배'));
      descEl.replaceChildren();
      const overlay = el('div', `bt-result ${result}`);
      const box = el('div', 'bt-result-box');
      box.appendChild(el('h2', null, result === 'win' ? '승리' : '패배'));
      box.appendChild(el('p', null, result === 'win'
        ? '그림자가 흩어지고, 복도가 조금 밝아졌다.'
        : '모두 쓰러졌다. 악몽에서 튕겨 나왔다.'));
      const row = el('div', 'bt-result-buttons');
      if (params.test) {
        row.appendChild(Game.button('타이틀로', () => Game.go('title')));
        row.appendChild(Game.button('다시 하기', () => Game.go('battle', params), { primary: true }));
      } else if (result === 'win') {
        const next = params.onWin || (() => Game.go('room'));
        row.appendChild(Game.button('계속', () => {
          if (!Save.data) return next();
          const report = Growth.applyBattleRewards({
            fielded: [...state.fielded],
            reserves: [...allies, ...bench].map((a) => a.id).filter((id) => !state.fielded.has(id)),
            enemies: enemies.map((e) => e.data),
            stays: state.stays,
            comboPairs: [...state.comboPairs],
            grabPairs: [...state.grabPairs],
          });
          Game.go('result', { report, onNext: next });
        }, { primary: true }));
      } else if (params.onLose) {
        row.appendChild(Game.button('계속', () => params.onLose(), { primary: true }));
      } else {
        row.appendChild(Game.button('부실로', () => Game.go('room')));
        row.appendChild(Game.button('다시 도전', () => Game.go('battle', params), { primary: true }));
      }
      box.appendChild(row);
      overlay.appendChild(box);
      s.root.appendChild(overlay);
    }

    function exit() {
      if (params.test) Game.go('title');
      else Game.go('room');
    }

    loop().catch((err) => {
      console.error(err);
      log(`오류: ${err.message}`);
    });

    return () => {
      alive = false;
      if (closeTutorial) closeTutorial();
      if (Battle.current === state) Battle.current = null;
    };
  },
});
