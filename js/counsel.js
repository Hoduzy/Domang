/*
 * counsel.js — 서브 게임: 방과후 상담
 *
 * 부실에서 부원 한 명을 고르면 30일짜리 회차가 시작된다.
 * 하루 = 4시~9시, 20분 단위 15칸. 칸마다 활동 7개 중 하나. 9시~10시는 고정 하교 장면.
 * 30일이 끝나면 가장 높은 스탯(동점이면 플레이어가 고름)으로 약속 종류를, 그 수치로 등급을 정한다.
 * 수치와 대사는 data/counsel.json.
 */

// ===== 규칙 (화면과 분리) =====
const Counsel = (() => {
  const cfg = () => Game.data.counsel;
  const STAT_IDS = ['mood', 'trust', 'confidence'];
  const GRADE_ORDER = ['bronze', 'silver', 'gold'];

  const activity = (id) => cfg().activities.find((a) => a.id === id);
  const statName = (id) => cfg().stats.find((s) => s.id === id).name;
  const promiseTypeOf = (statId) => cfg().stats.find((s) => s.id === statId).promise;

  /** 캐릭터 레벨 구간 → 활동 한 칸 체력 소모 */
  function band(level) {
    let cur = cfg().stamina.bands[0];
    for (const b of cfg().stamina.bands) if (level >= b.minLevel) cur = b;
    return cur;
  }

  /** 그 아이의 장을 클리어했는지, 의존도가 높은지에 따른 성장률과 등급 상한 */
  function growthFor(id) {
    const c = Game.character(id);
    const d = Save.data;
    const g = cfg().growth;
    const cleared = d.progress.chapter > c.chapter || (d.progress.cleared[String(c.chapter)] || []).includes(10);
    const depStage = Growth.dependencyStage(d.characters[id].dependency).stage;
    if (cleared && depStage >= g.trusted.dependencyStage) return { key: 'trusted', ...g.trusted, depStage };
    if (cleared) return { key: 'cleared', ...g.cleared, depStage };
    return { key: 'locked', ...g.locked, depStage };
  }

  const slowed = (run) => run.lowDays >= cfg().penalty.slowDays;

  /** 하루 시간표를 미리 계산: 칸마다 실제로 하게 될 활동과 남는 체력 */
  function preview(plan, level) {
    const cost = band(level).cost;
    const st = cfg().stamina;
    let stamina = st.max;
    let exhausted = false;
    const out = [];
    for (let i = 0; i < cfg().slots; i++) {
      const planned = plan[i] || 'rest';
      let act = activity(planned);
      let forced = false;
      if (exhausted && !act.rest) { act = activity('rest'); forced = true; }
      if (act.rest) {
        stamina = Math.min(st.max, stamina + st.rest);
      } else {
        stamina = Math.max(0, stamina - cost * (act.costRate || 1));
        if (stamina === 0) exhausted = true;
      }
      out.push({ act, forced, empty: !plan[i], stamina });
    }
    return out;
  }

  /** 활동 한 칸의 스탯 변화 */
  function slotDelta(run, act) {
    const c = cfg();
    const pref = c.preferences[run.id] || {};
    const depStage = Growth.dependencyStage(Save.data.characters[run.id].dependency).stage;
    const mult = run.rate * (slowed(run) ? c.penalty.slowRate : 1);
    const delta = { mood: 0, trust: 0, confidence: 0 };
    for (const s of STAT_IDS) {
      const n = act[s] || 0;
      if (!n) continue;
      const fav = pref.favorite === act.id && n > 0 ? c.favoriteMult : 1;
      delta[s] += n * c.unit * mult * fav;
    }
    // 힘들어하는 활동: 기분이 오르는 대신 내려간다 (의존도가 높아지면 괜찮아짐)
    if (pref.hard === act.id && depStage < c.hardOkDependencyStage) {
      delta.mood = (Math.min(act.mood || 0, 0) + c.hardMood) * c.unit * mult;
    }
    return delta;
  }

  /** 이벤트 선택지의 스탯 변화 */
  function choiceDelta(run, choice) {
    const c = cfg();
    const mult = run.rate * (slowed(run) ? c.penalty.slowRate : 1);
    const delta = { mood: 0, trust: 0, confidence: 0 };
    for (const s of STAT_IDS) delta[s] = (choice[s] || 0) * c.unit * mult;
    return delta;
  }

  function apply(stats, delta) {
    for (const s of STAT_IDS) stats[s] = Math.min(100, Math.max(0, stats[s] + delta[s]));
  }

  /** 방치된 스탯: 가장 낮은 스탯이 가장 높은 스탯보다 많이 뒤처졌을 때 */
  function neglected(stats, day) {
    const p = cfg().penalty;
    if (day < p.startDay) return null;
    const sorted = STAT_IDS.slice().sort((a, b) => stats[a] - stats[b]);
    const lo = sorted[0];
    const hi = sorted[2];
    if (stats[hi] - stats[lo] >= p.gap && stats[lo] < stats[hi] * p.ratio) return lo;
    return null;
  }

  function gradeFor(value, cap) {
    let grade = 'bronze';
    for (const g of cfg().grades) if (value >= g.min) grade = g.grade;
    return GRADE_ORDER.indexOf(grade) > GRADE_ORDER.indexOf(cap) ? cap : grade;
  }

  /** 가장 높은 스탯 (동점이면 여러 개) */
  function topStats(stats) {
    const max = Math.max(...STAT_IDS.map((s) => stats[s]));
    return STAT_IDS.filter((s) => Math.abs(stats[s] - max) < 1e-9);
  }

  function makePromise(id, statId, value, cap) {
    const type = promiseTypeOf(statId);
    const lines = cfg().lines[id] || {};
    return {
      id: `promise_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      grade: gradeFor(value, cap),
      owner: id,
      equippedBy: null,
      obtainedAt: Date.now(),
      line: (lines.promise || {})[type] || '',
    };
  }

  function timeLabel(slot) {
    const total = cfg().startHour * 60 + slot * cfg().slotMinutes;
    const h = Math.floor(total / 60) - 12;
    const m = total % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
  }

  return {
    STAT_IDS, activity, statName, promiseTypeOf, band, growthFor, slowed, preview, slotDelta,
    choiceDelta, apply, neglected, gradeFor, topStats, makePromise, timeLabel,
  };
})();

// ===== 화면 =====
Game.registerScreen('counsel', {
  title: '방과후 상담',
  background: 'classroom',
  render(s) {
    const el = Game.el;
    const C = Game.data.counsel;
    const GRADE_LABEL = Game.data.promises.grades;
    const STAT_GAUGE = { mood: 'hp', trust: 'bond', confidence: 'heart' };
    let alive = true;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (window.CounselTiming || 1)));
    s.root.classList.add('counsel');

    if (!Save.data) {
      s.body.appendChild(el('p', 'cn-empty', '게임을 시작하면 방과후 상담을 할 수 있어요.'));
      s.addButton('돌아가기', () => Game.go('title'), { primary: true });
      return undefined;
    }

    const area = el('div', 'cn-area');
    s.root.appendChild(area);
    const backBtn = s.addButton('부실로', () => Game.go('room'));
    const fmt = (v) => (Math.round(v * 10) / 10).toFixed(1);
    const signed = (v) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`;

    // ---------- 부원 고르기 ----------
    function renderSelect() {
      area.replaceChildren();
      area.className = 'cn-area select';
      area.appendChild(el('h2', 'cn-heading', '누구와 방과후를 보낼까요?'));
      area.appendChild(el('p', 'cn-sub', `30일 동안 매일 4시부터 9시까지, 20분 단위로 함께 할 일을 정해요. 30일이 끝나면 가장 높은 스탯에 따라 약속을 받아요.`));
      const row = el('div', 'cn-pick-row');
      for (const c of Game.data.characters) {
        const rec = Save.data.characters[c.id];
        const g = Counsel.growthFor(c.id);
        const pref = C.preferences[c.id];
        const card = Game.button('', () => startRun(c.id));
        card.classList.add('cn-pick');
        card.appendChild(Assets.standing(c, 'default', 'cn-pick-pic'));
        card.appendChild(el('div', 'cn-pick-name', c.name));
        card.appendChild(el('div', 'cn-pick-meta', `Lv ${rec.level} · 체력 소모 ${Counsel.band(rec.level).cost}%`));
        const capRow = el('div', 'cn-cap-row');
        capRow.append(Assets.labeled(`badge_${g.cap}`, GRADE_LABEL[g.cap], `cn-badge ${g.cap}`), el('span', 'cn-cap-text', `최대 · ${g.label}`));
        card.appendChild(capRow);
        card.appendChild(el('div', 'cn-pref', `좋아함 · ${Counsel.activity(pref.favorite).name}`));
        card.appendChild(el('div', 'cn-pref hard', `힘들어함 · ${Counsel.activity(pref.hard).name}`));
        if (Save.data.counsel.sorry[c.id]) card.appendChild(el('div', 'cn-sorry-tag', '지난 회차 중단'));
        row.appendChild(card);
      }
      area.appendChild(row);
    }

    function startRun(id) {
      const g = Counsel.growthFor(id);
      Save.update((d) => {
        d.counsel.run = { id, day: 1, stats: { mood: 0, trust: 0, confidence: 0 }, lowDays: 0, rate: g.rate, cap: g.cap, plan: [] };
      });
      const lines = [];
      if (Save.data.counsel.sorry[id]) {
        lines.push({ who: id, text: C.sorryLine }, { who: 'teacher', text: C.sorryTeacher });
        Save.update((d) => { delete d.counsel.sorry[id]; });
      }
      lines.push({ who: id, text: (C.lines[id] || {}).start || '…네.' });
      scene(lines, () => renderPlan(), { id });
    }

    // ---------- 짧은 장면 (대사 몇 줄) ----------
    function scene(lines, done, { id, face = 'default', title } = {}) {
      const overlay = el('div', 'cn-scene');
      const box = el('div', 'cn-scene-box');
      const c = Game.character(id);
      overlay.appendChild(Assets.standing(c, face, 'cn-scene-pic'));
      if (title) box.appendChild(el('div', 'cn-scene-title', title));
      const name = el('div', 'cn-scene-name');
      const text = el('div', 'cn-scene-text');
      box.append(name, text);
      overlay.appendChild(box);
      s.root.appendChild(overlay);
      let i = 0;
      const show = () => {
        const l = lines[i];
        name.textContent = l.who === 'teacher' ? '선생님' : l.who === 'narration' ? '' : Game.character(l.who).name;
        name.classList.toggle('empty', l.who === 'narration');
        text.classList.toggle('narration', l.who === 'narration');
        text.textContent = l.text;
      };
      show();
      overlay.addEventListener('click', () => {
        i += 1;
        if (i < lines.length) show();
        else { overlay.remove(); done(); }
      });
    }

    // ---------- 하루 계획 ----------
    let plan = [];
    let selected = 0;
    let running = false;

    function renderPlan() {
      const run = Save.data.counsel.run;
      if (!run) return renderSelect();
      const c = Game.character(run.id);
      const rec = Save.data.characters[run.id];
      const g = Counsel.growthFor(run.id);
      const pref = C.preferences[run.id];
      if (!plan.length) plan = run.plan.length ? run.plan.slice() : Array(C.slots).fill(null);
      area.replaceChildren();
      area.className = 'cn-area plan';

      // 머리말
      const head = el('div', 'cn-head');
      // 날짜: ui_day_counter (탁상 달력) 위에 숫자
      const cal = el('div', 'cn-calendar');
      cal.append(el('span', 'cn-cal-day', String(run.day)), el('span', 'cn-cal-total', `/ ${C.days}일`));
      area.appendChild(cal);
      head.appendChild(el('div', 'cn-day', `${josa(c.name, '과', '와')}의 방과후`));
      const info = el('div', 'cn-info');
      const capInfo = el('span', 'cn-cap-row');
      capInfo.append(el('span', 'cn-cap-text', '최대'), Assets.labeled(`badge_${run.cap}`, GRADE_LABEL[run.cap], `cn-badge small ${run.cap}`));
      info.appendChild(capInfo);
      info.appendChild(el('span', 'cn-rate', `성장률 ×${run.rate}${Counsel.slowed(run) ? ` → ×${run.rate * C.penalty.slowRate} (성장 둔화)` : ''}`));
      if (run.lowDays >= C.penalty.warnDays) info.appendChild(el('span', 'cn-warn', `경고 ${run.lowDays}일째`));
      head.appendChild(info);
      area.appendChild(head);

      // 왼쪽: 아이와 스탯
      const left = el('div', 'cn-left');
      const face = run.lowDays >= C.penalty.warnDays ? 'sad' : 'default';
      left.appendChild(Assets.standing(c, face, 'cn-pic'));
      const prefs = el('div', 'cn-prefs');
      prefs.appendChild(el('span', 'cn-pref', `좋아함 · ${Counsel.activity(pref.favorite).name} ×2`));
      const hardOk = g.depStage >= C.hardOkDependencyStage;
      prefs.appendChild(el('span', `cn-pref hard${hardOk ? ' ok' : ''}`, `힘들어함 · ${Counsel.activity(pref.hard).name}${hardOk ? ' (이제 괜찮음)' : ''}`));
      left.appendChild(prefs);
      const stats = el('div', 'cn-stats');
      for (const st of C.stats) {
        const v = run.stats[st.id];
        const row = el('div', `cn-stat ${st.id}`);
        const nm = el('span', 'cn-stat-name');
        nm.append(Assets.icon(`stat_${st.id}`, 'cn-stat-icon'), el('span', null, st.name));
        row.appendChild(nm);
        // 기분 gauge_hp, 신뢰 gauge_bond, 자신감 gauge_heart
        const track = Assets.gauge(STAT_GAUGE[st.id] || 'hp', v / 100, 'cn-track');
        for (const gr of C.grades.slice(1)) {
          const mark = el('b', 'cn-mark');
          mark.style.left = `${gr.min}%`;
          track.appendChild(mark);
        }
        row.appendChild(track);
        row.appendChild(el('span', 'cn-stat-val', fmt(v)));
        const gr = Counsel.gradeFor(v, run.cap);
        row.appendChild(Assets.labeled(`badge_${gr}`, GRADE_LABEL[gr], `cn-badge cn-grade ${gr}`));
        stats.appendChild(row);
      }
      left.appendChild(stats);
      area.appendChild(left);

      // 오른쪽: 시간표와 활동
      const right = el('div', 'cn-right');
      const pv = Counsel.preview(plan, rec.level);
      const staminaRow = el('div', 'cn-stamina');
      staminaRow.appendChild(Assets.icon('stat_stamina', 'cn-stat-icon'));
      staminaRow.appendChild(el('span', 'cn-stamina-label', `체력 (레벨 구간 ${Counsel.band(rec.level).name} · 한 칸 ${Counsel.band(rec.level).cost}%)`));
      // gauge_stamina: 오늘 시간표를 다 보낸 뒤 남는 체력
      const endStamina = pv.length ? pv[pv.length - 1].stamina : C.stamina.max;
      staminaRow.appendChild(Assets.gauge('stamina', endStamina / C.stamina.max, 'cn-stamina-gauge'));
      staminaRow.appendChild(el('span', 'cn-stamina-val', `${Math.round(endStamina)}%`));
      right.appendChild(staminaRow);

      // 시간표: ui_timetable 코르크판의 5×3 칸에 포스트잇(ui_tile)을 붙인다
      const board = el('div', 'cn-timetable');
      board.appendChild(el('div', 'cn-tt-title', '오늘의 시간표'));
      const COLS = [12.5, 27.5, 42.5, 57.5, 72.6, 87.5];
      const ROWS = [26.9, 45.1, 63.4, 81.8];
      const grid = el('div', 'cn-grid');
      pv.forEach((p, i) => {
        const slot = Game.button('', () => {
          if (running) return;
          if (selected === i && plan[i]) plan[i] = null;
          selected = i;
          renderPlan();
        });
        slot.classList.add('cn-slot');
        if (i === selected && !running) slot.classList.add('selected');
        if (p.forced) slot.classList.add('forced');
        if (p.empty) slot.classList.add('empty');
        if (p.act.id === pref.favorite) slot.classList.add('fav');
        slot.dataset.slot = String(i);
        const cc = i % 5;
        const rr = Math.floor(i / 5);
        slot.style.left = `${COLS[cc]}%`;
        slot.style.top = `${ROWS[rr]}%`;
        slot.style.width = `${COLS[cc + 1] - COLS[cc]}%`;
        slot.style.height = `${ROWS[rr + 1] - ROWS[rr]}%`;
        slot.appendChild(el('span', 'cn-slot-time', Counsel.timeLabel(i)));
        slot.appendChild(el('span', 'cn-slot-act', p.forced ? '쉬기 (지쳐서)' : p.empty ? '— (쉬기)' : p.act.name));
        slot.appendChild(el('span', 'cn-slot-stamina', `체력 ${Math.round(p.stamina)}%`));
        grid.appendChild(slot);
      });
      board.appendChild(grid);
      right.appendChild(board);

      const palette = el('div', 'cn-palette');
      for (const a of C.activities) {
        const b = Game.button('', () => {
          if (running) return;
          plan[selected] = a.id;
          selected = Math.min(C.slots - 1, selected + 1);
          renderPlan();
        });
        b.classList.add('cn-act');
        if (a.id === pref.favorite) b.classList.add('fav');
        if (a.id === pref.hard && !hardOk) b.classList.add('hard');
        b.dataset.act = a.id;
        if (a.icon) b.appendChild(Assets.icon(a.icon, 'cn-act-icon'));
        b.appendChild(el('span', 'cn-act-name', a.name));
        const eff = C.stats.map((st) => {
          const n = a[st.id];
          return n ? `${st.name}${n > 0 ? '+'.repeat(n) : '−'.repeat(-n)}` : '';
        }).filter(Boolean).join(' ');
        const cost = a.rest ? `체력 +${C.stamina.rest}%` : a.costRate ? '체력 절반' : '';
        b.appendChild(el('span', 'cn-act-eff', [eff, cost].filter(Boolean).join(' · ') || '변화 없음'));
        palette.appendChild(b);
      }
      right.appendChild(palette);

      const ctrl = el('div', 'cn-ctrl');
      ctrl.appendChild(Game.button('지우기', () => { plan = Array(C.slots).fill(null); selected = 0; renderPlan(); }));
      ctrl.appendChild(Game.button('어제와 같이', () => { plan = run.plan.length ? run.plan.slice() : plan; renderPlan(); }, { disabled: !run.plan.length }));
      ctrl.appendChild(Game.button('그만두기', async () => {
        if (await Game.confirm('이번 회차를 그만둘까요? 약속은 받지 못하지만, 그동안 오른 의존도는 남아요.', { ok: '그만두기' })) {
          Save.update((d) => { d.counsel.run = null; });
          plan = [];
          renderSelect();
        }
      }));
      const goBtn = Game.button('하루 보내기', () => runDay(), { primary: true });
      goBtn.classList.add('cn-go');
      ctrl.appendChild(goBtn);
      right.appendChild(ctrl);
      area.appendChild(right);
    }

    // ---------- 하루 진행 ----------
    function pop(target, text, cls) {
      const p = el('div', `cn-pop ${cls || ''}`, text);
      target.appendChild(p);
      setTimeout(() => p.remove(), 900);
    }

    async function runDay() {
      if (running) return;
      running = true;
      backBtn.disabled = true;
      const run = Save.data.counsel.run;
      const rec = Save.data.characters[run.id];
      const pv = Counsel.preview(plan, rec.level);
      const stats = { ...run.stats };
      const today = { mood: 0, trust: 0, confidence: 0 };
      let activities = 0;
      const exhausted = pv.some((p) => p.forced);
      const eventSlot = Math.random() < C.eventChance ? 3 + Math.floor(Math.random() * 9) : -1;
      renderPlan();
      area.querySelectorAll('.cn-slot').forEach((x) => x.classList.remove('selected'));

      for (let i = 0; i < pv.length; i++) {
        if (!alive) return;
        const slotEl = area.querySelector(`.cn-slot[data-slot="${i}"]`);
        slotEl.classList.add('now');
        const d = Counsel.slotDelta(run, pv[i].act);
        Counsel.apply(stats, d);
        for (const k of Counsel.STAT_IDS) today[k] += d[k];
        if (!pv[i].act.rest) activities += 1;
        const parts = Counsel.STAT_IDS.filter((k) => Math.abs(d[k]) > 1e-9).map((k) => `${Counsel.statName(k)} ${signed(d[k])}`);
        if (parts.length) pop(slotEl, parts.join(' '), d.mood < 0 ? 'down' : '');
        await sleep(170);
        slotEl.classList.remove('now');
        slotEl.classList.add('done');

        if (i === eventSlot) {
          const ev = C.events[Math.floor(Math.random() * C.events.length)];
          const choice = await showEvent(ev, run);
          if (!alive) return;
          const ed = Counsel.choiceDelta(run, choice);
          Counsel.apply(stats, ed);
          for (const k of Counsel.STAT_IDS) today[k] += ed[k];
        }
      }
      await sleep(250);
      endDay(run, stats, today, activities, exhausted);
    }

    function showEvent(ev, run) {
      return new Promise((resolve) => {
        const c = Game.character(run.id);
        const overlay = el('div', 'cn-scene');
        overlay.appendChild(Assets.standing(c, 'surprised', 'cn-scene-pic'));
        const box = el('div', 'cn-scene-box');
        box.appendChild(el('div', 'cn-scene-title', '그날 있었던 일'));
        box.appendChild(el('div', 'cn-scene-text narration', ev.narration));
        box.appendChild(el('div', 'cn-scene-name', c.name));
        box.appendChild(el('div', 'cn-scene-text', ev.line));
        const choices = el('div', 'cn-choices');
        for (const ch of ev.choices) {
          const eff = Counsel.STAT_IDS.filter((k) => ch[k]).map((k) => `${Counsel.statName(k)}${ch[k] > 0 ? '+' : '−'}`).join(' ');
          const b = Game.button(ch.text, () => { overlay.remove(); resolve(ch); });
          b.classList.add('cn-choice');
          b.appendChild(el('span', 'cn-choice-eff', eff));
          choices.appendChild(b);
        }
        box.appendChild(choices);
        overlay.appendChild(box);
        s.root.appendChild(overlay);
      });
    }

    // ---------- 하교 (9시~10시) ----------
    function endDay(run, stats, today, activities, exhausted) {
      const P = C.penalty;
      const day = run.day; // 아래에서 저장하면 run.day 가 다음 날로 바뀐다
      const low = Counsel.neglected(stats, day);
      const lowDays = low ? run.lowDays + 1 : 0;
      const lines = C.lines[run.id] || {};
      const stop = lowDays >= P.stopDays;
      const finalDay = day >= C.days && !stop;

      Save.update((d) => {
        const r = d.counsel.run;
        r.stats = stats;
        r.lowDays = lowDays;
        r.plan = plan.slice();
        if (activities > 0) d.characters[r.id].dependency += C.dependencyPerDay;
        if (!stop && !finalDay) r.day += 1;
      });

      const c = Game.character(run.id);
      const overlay = el('div', 'cn-home');
      const face = stop || lowDays >= P.warnDays ? 'sad' : exhausted ? 'default' : 'smile';
      overlay.appendChild(Assets.standing(c, face, 'cn-scene-pic'));
      const box = el('div', 'cn-home-box');
      box.appendChild(el('div', 'cn-home-time', `9:00 하교 · ${day}일째`));
      const list = el('div', 'cn-home-stats');
      for (const st of C.stats) {
        const row = el('div', 'cn-home-stat');
        row.appendChild(Assets.icon(`stat_${st.id}`, 'cn-stat-icon'));
        row.appendChild(el('span', null, st.name));
        row.appendChild(el('span', today[st.id] < 0 ? 'down' : 'up', signed(today[st.id])));
        row.appendChild(el('span', 'cn-home-total', fmt(stats[st.id])));
        list.appendChild(row);
      }
      box.appendChild(list);
      if (activities > 0) box.appendChild(el('div', 'cn-home-dep', `의존도 +${C.dependencyPerDay}`));

      let line;
      if (stop) line = C.stopLine;
      else if (lowDays >= P.warnDays) line = lines.warn;
      else if (exhausted) line = lines.tired;
      else line = (lines.home || ['…'])[Math.floor(Math.random() * (lines.home || ['…']).length)];
      box.appendChild(el('div', 'cn-home-name', c.name));
      box.appendChild(el('div', 'cn-home-line', line));

      if (!stop && low) {
        const notes = [`${josa(Counsel.statName(low), '이', '가')} 너무 낮아요. 아이가 지쳐 보여요.`];
        if (lowDays >= P.slowDays) notes.push('이 상태가 이어져서 모든 스탯의 성장이 절반으로 줄었어요.');
        if (lowDays >= P.stopDays - 2) notes.push('이대로면 아이가 상담을 그만두고 싶어할 수도 있어요.');
        box.appendChild(el('div', 'cn-home-warn', notes.join(' ')));
      }
      const btn = Game.button(stop ? '계속' : finalDay ? '30일 결과 보기' : '다음 날', () => {
        overlay.remove();
        running = false;
        backBtn.disabled = false;
        if (stop) return stopRun({ id: run.id, day });
        if (finalDay) return finishRun();
        selected = 0;
        renderPlan();
      }, { primary: true });
      box.appendChild(btn);
      overlay.appendChild(box);
      s.root.appendChild(overlay);
    }

    // ---------- 상담 중단 ----------
    function stopRun(run) {
      Save.update((d) => {
        d.counsel.run = null;
        d.counsel.sorry[run.id] = true;
      });
      plan = [];
      scene([
        { who: 'narration', text: C.stopNarration },
        { who: 'teacher', text: C.stopTeacher },
        { who: 'narration', text: '상담이 끝났어요. 약속은 받지 못했지만, 그동안 쌓인 마음은 남아 있어요.' },
      ], () => renderSelect(), { id: run.id, face: 'sad', title: `${run.day}일째 · 상담 중단` });
    }

    // ---------- 30일 결과 ----------
    function finishRun() {
      const run = Save.data.counsel.run;
      const c = Game.character(run.id);
      const tops = Counsel.topStats(run.stats);
      area.replaceChildren();
      area.className = 'cn-area final';
      area.appendChild(el('h2', 'cn-heading', `${josa(c.name, '과', '와')} 보낸 30일`));
      const sum = el('div', 'cn-final-stats');
      for (const st of C.stats) {
        const box = el('div', `cn-final-stat${tops.includes(st.id) ? ' top' : ''}`);
        box.appendChild(el('span', 'cn-final-name', st.name));
        box.appendChild(el('span', 'cn-final-val', fmt(run.stats[st.id])));
        box.appendChild(el('span', 'cn-final-type', Game.data.promises.types[st.promise].name));
        sum.appendChild(box);
      }
      area.appendChild(sum);
      if (tops.length > 1) {
        area.appendChild(el('p', 'cn-sub', '가장 높은 스탯이 같아요. 어떤 약속을 받을지 골라 주세요.'));
        const row = el('div', 'cn-tie');
        for (const t of tops) {
          const st = C.stats.find((x) => x.id === t);
          const b = Game.button(Game.data.promises.types[st.promise].name, () => givePromise(run, t), { primary: true });
          row.appendChild(b);
        }
        area.appendChild(row);
      } else {
        givePromise(run, tops[0]);
      }
    }

    function givePromise(run, statId) {
      const c = Game.character(run.id);
      const pr = Counsel.makePromise(run.id, statId, run.stats[statId], run.cap);
      Save.update((d) => {
        d.promises.push(pr);
        d.counsel.run = null;
        d.counsel.finished += 1;
      });
      plan = [];
      area.querySelectorAll('.cn-tie, .cn-sub').forEach((n) => n.remove());
      const card = el('div', `cn-promise ${pr.grade}`);
      card.appendChild(el('div', 'cn-promise-tag', '약속을 받았어요'));
      card.appendChild(Assets.icon(`promise_${pr.type}_${pr.grade}`, 'cn-promise-icon'));
      card.appendChild(el('div', 'cn-promise-name', `${Game.data.promises.types[pr.type].name} · ${GRADE_LABEL[pr.grade]}`));
      card.appendChild(el('div', 'cn-promise-eff', Game.data.promises.effects[pr.type][pr.grade]));
      if (pr.line) card.appendChild(el('div', 'cn-promise-line', `${c.name}: "${pr.line}"`));
      const capNote = Counsel.gradeFor(run.stats[statId], 'gold') !== pr.grade
        ? `수치로는 ${GRADE_LABEL[Counsel.gradeFor(run.stats[statId], 'gold')]}이지만, 지금 관계로는 ${GRADE_LABEL[run.cap]}까지예요.` : '';
      if (capNote) card.appendChild(el('div', 'cn-promise-cap', capNote));
      card.appendChild(el('div', 'cn-promise-hint', '편성 화면에서 이 아이에게 끼울 수 있어요.'));
      area.appendChild(card);
    }

    // ---------- 시작 ----------
    if (Save.data.counsel.run) renderPlan();
    else renderSelect();

    return () => { alive = false; };
  },
});
