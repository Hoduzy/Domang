/*
 * preload.js — 화면마다 미리 불러올 이미지 목록
 *
 * Game.go 가 화면을 바꾸기 전에 그 화면의 preload(params) 목록을 불러온다.
 * 목록의 각 항목은 url 하나 또는 후보 url 목록(앞에서부터 처음 있는 파일을 쓴다).
 */
const Preload = (() => {
  const U = Assets.URLS;
  const ids = () => Game.data.characters.map((c) => c.id);
  const ui = (...keys) => keys.map((k) => U.ui(k));

  // ----- 대화: 지금 줄부터 앞으로 보여줄 몇 줄에서 쓰는 그림 -----
  function dialogueItems(script, start, count = 10) {
    const items = [];
    const lines = script.lines;
    const seen = new Set();
    let i = start;
    let shown = 0;
    while (i < lines.length && shown < count && !seen.has(i)) {
      seen.add(i);
      const line = lines[i];
      if (line.bg) items.push(U.background(line.bg));
      if (line.cg) items.push(U.cg(line.cg));
      if (Array.isArray(line.show)) {
        for (const e of line.show) {
          const id = typeof e === 'string' ? e : e.id;
          items.push(U.standing(id, (typeof e === 'object' && e.face) || 'default'));
        }
      }
      if (line.speaker || line.who) {
        const m = line.who ? Game.cast(line.who) : Game.castByName(line.speaker);
        if (m) items.push(U.standing(m.id, line.face || 'default'));
      }
      if (line.choice) {
        // 선택지는 갈래마다 첫 몇 줄을 함께
        for (const opt of line.choice) {
          if (opt.goto != null && script.labels[opt.goto] != null) items.push(...dialogueItems(script, script.labels[opt.goto], 3));
        }
      }
      if (line.text != null || line.narration != null || line.title != null) shown += 1;
      if (line.battle) break; // 전투 그림은 전투 화면이 불러온다
      const target = line.goto != null ? script.labels[line.goto] : null;
      if (target != null && line.if != null) {
        // 조건이 붙은 이동: 두 길 다 본다
        items.push(...dialogueItems(script, target, 3));
        i += 1;
      } else {
        i = target != null ? target : i + 1;
      }
    }
    return items;
  }

  // ----- 전투 -----
  function battleItems(params) {
    const party = [...(params.party || []), ...(params.reserve || [])];
    const items = [U.background(params.battleBg || 'battle_hallway')];
    for (const id of party) {
      items.push(U.sd(id), U.nightmare(id), U.face(id),
        U.sheet(id, 'attack'), U.sheet(id, 'skill'), U.sheet(id, 'heart'),
        U.ui(`skill_${id}_basic`), U.ui(`skill_${id}_skill`), U.ui(`skill_${id}_heart`));
    }
    for (const eid of params.enemies || []) {
      const e = Game.data.enemies.find((x) => x.id === eid);
      const imgs = e && e.images && e.images.length ? e.images : [eid];
      imgs.forEach((k) => items.push(U.enemy(k)));
    }
    items.push(...ui('cmd_hold', 'cmd_stay', 'ui_portrait_frame', 'ui_turn_order', 'ui_skill_card',
      'ui_heart_card', 'ui_command_button', 'gauge_hp_frame', 'gauge_hp_fill', 'gauge_shake_frame',
      'gauge_shake_fill', 'gauge_heart_frame', 'gauge_heart_fill', 'gauge_weak_frame', 'gauge_weak_fill',
      'ui_cutin_band', ...TAGS, ...DIGITS));
    return items;
  }

  const TAGS = ['tag_frozen', 'tag_hidden', 'tag_weakbreak', 'tag_buff', 'tag_debuff', 'tag_heal'];
  const DIGITS = Array.from({ length: 10 }, (_, i) => `digit_${i}`);
  const BADGES = ['badge_bronze', 'badge_silver', 'badge_gold'];
  const gauges = (...kinds) => kinds.flatMap((k) => [`gauge_${k}_frame`, `gauge_${k}_fill`]);

  const promiseIcons = () => ['smile', 'trust', 'tomorrow'].flatMap((t) => ['bronze', 'silver', 'gold'].map((g) => U.ui(`promise_${t}_${g}`)));

  function setup() {
    const P = (id, fn) => Game.setPreload(id, fn);

    P('notice', () => [U.background('bg_notice')]);
    P('title', () => [U.ui('logo')]);
    P('room', () => [U.background('club_room'), ...ids().map((id) => U.standing(id, 'default')),
      ...ui('ui_wall_clock', 'ui_board_card', 'ui_speech_bubble')]);

    P('dialogue', async (params) => {
      const script = await Story.load(params.file || 'prologue_01');
      const r = params.resume;
      const items = dialogueItems(script, r ? r.index : 0, 10);
      if (r && r.bgKey) items.push(r.bgKey.startsWith('cg:') ? U.cg(r.bgKey.slice(3)) : U.background(r.bgKey));
      if (r) r.cast.forEach((c) => items.push(U.standing(c.id, c.face)));
      items.push(...ui('ui_title_band', 'ui_tutorial_tag'));
      return items;
    });

    P('battle', (params) => battleItems(params));

    P('counsel', () => {
      const C = Game.data.counsel;
      const run = Save.data && Save.data.counsel.run;
      const chars = run ? [run.id] : ids();
      return [
        U.background('classroom'),
        ...chars.flatMap((id) => [U.standing(id, 'default'), ...(run ? [U.standing(id, 'sad'), U.standing(id, 'smile'), U.standing(id, 'surprised')] : [])]),
        ...C.activities.filter((a) => a.icon).map((a) => U.ui(a.icon)),
        ...C.stats.map((s) => U.ui(`stat_${s.id}`)), U.ui('stat_stamina'),
        ...ui('ui_timetable', 'ui_tile', 'ui_day_counter', ...BADGES, ...gauges('hp', 'bond', 'heart', 'stamina')),
        ...promiseIcons(),
      ];
    });

    // 그 밖의 화면
    P('chapter', () => [U.background('bg_chapter_select'), ...ui('node_locked', 'node_current', 'node_cleared', 'node_boss', 'ui_path_dot')]);
    P('formation', () => [...ids().map((id) => U.nightmare(id)), ...ids().map((id) => U.standing(id, 'sad')), U.ui('ui_slot_frame'), ...promiseIcons()]);
    P('character', (params) => {
      const id = params.id || ids()[0];
      return [U.standing(id, 'default'), U.ui(`skill_${id}_skill`), U.ui(`skill_${id}_heart`), ...ui(...gauges('exp', 'dep', 'bond'))];
    });
    P('result', () => ui(...gauges('exp')));
    P('settings', () => ui('slider_track', 'slider_knob'));
    P('attendance', () => [U.ui('ui_attendance_book'), ...ids().map((id) => U.face(id))]);
    P('gacha', () => [U.background('bg_gacha'), ...ui('card_sr', 'card_ssr'), ...ids().map((id) => U.standing(id, 'smile'))]);
  }

  return { setup, dialogueItems, battleItems };
})();

Preload.setup();
