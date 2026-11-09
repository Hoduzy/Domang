/*
 * growth.js — 성장 계산 (레벨, 스킬 레벨, 의존도, 유대)
 *
 * 수치는 data/growth.json 에 있다. 저장 데이터를 바꾸는 함수는 모두 Save.update 를 거친다.
 */
const Growth = (() => {
  const cfg = () => Game.data.growth;

  // ===== 레벨 =====
  function expToNext(level) {
    const e = cfg().exp;
    return e.base + e.perLevel * (level - 1);
  }

  /** 레벨에 맞춘 능력치 */
  function stats(character, level) {
    const g = cfg().statGrowth;
    const n = level - 1;
    return {
      hp: Math.round(character.stats.hp * (1 + g.hp * n)),
      atk: Math.round(character.stats.atk * (1 + g.atk * n)),
      spd: Math.round(character.stats.spd + g.spd * n),
    };
  }

  /** 경험치를 더하고 레벨업. 기록 객체(rec)를 직접 바꾼다 */
  function addExpTo(rec, amount) {
    const max = cfg().levelMax;
    const from = rec.level;
    rec.exp += amount;
    while (rec.level < max && rec.exp >= expToNext(rec.level)) {
      rec.exp -= expToNext(rec.level);
      rec.level += 1;
    }
    if (rec.level >= max) rec.exp = 0;
    return { from, to: rec.level };
  }

  // ===== 스킬 레벨 =====
  function skillMultiplier(level) {
    return 1 + cfg().skillUpgrade.effectPerLevel * ((level || 1) - 1);
  }

  function upgradeCost(level) {
    return level * cfg().skillUpgrade.costPerLevel;
  }

  /** 스킬 강화. slot = 'skill' | 'heart'. 성공하면 true */
  function upgradeSkill(id, slot) {
    const d = Save.data;
    if (!d) return false;
    const lv = d.characters[id].skillLevels[slot] || 1;
    if (lv >= cfg().skillUpgrade.maxLevel) return false;
    const cost = upgradeCost(lv);
    if (d.materials < cost) return false;
    Save.update((x) => {
      x.materials -= cost;
      x.characters[id].skillLevels[slot] = lv + 1;
    });
    return true;
  }

  // ===== 의존도 =====
  function dependencyStage(points) {
    const stages = cfg().dependency.stages;
    let cur = stages[0];
    for (const st of stages) if (points >= st.min) cur = st;
    const next = stages.find((st) => st.min > points) || null;
    return { ...cur, next, points };
  }

  function shakeLine(id, stage) {
    const lines = cfg().shakeLines;
    const own = lines.byCharacter[id] || {};
    return own[String(stage)] || lines.default[String(stage)] || lines.default['1'];
  }

  // ===== 유대 =====
  function bondLevel(a, b) {
    const d = Save.data;
    if (!d) return 0;
    return Math.min(cfg().bond.max, d.bonds[Save.bondKey(a, b)] || 0);
  }

  // ===== 전투 보상 =====
  /**
   * 전투에서 이겼을 때 보상을 저장 데이터에 반영하고, 결과 화면용 보고서를 돌려준다.
   * summary = {
   *   fielded: [아이디],            전장에 한 번이라도 나선 부원
   *   reserves: [아이디],           한 번도 나서지 않은 대기 부원
   *   enemies: [enemies.json 항목],
   *   stays: { 아이디: 받은 곁에 있기 횟수 },
   *   comboPairs: ['a+b', ...], grabPairs: ['a+b', ...],
   * }
   */
  function applyBattleRewards(summary) {
    const c = cfg();
    const expTotal = summary.enemies.reduce((n, e) => n + (e.exp || 0), 0);
    const material = summary.enemies.reduce((n, e) => n + (e.material || 0), 0);
    const report = { exp: [], dependency: [], bonds: [], material, expTotal };

    Save.update((d) => {
      d.materials += material;

      const members = [
        ...summary.fielded.map((id) => ({ id, rate: 1 })),
        ...summary.reserves.map((id) => ({ id, rate: c.reserveExpRate })),
      ];
      for (const { id, rate } of members) {
        const rec = d.characters[id];
        const gained = Math.round(expTotal * rate);
        const before = { level: rec.level, exp: rec.exp };
        const lv = addExpTo(rec, gained);
        report.exp.push({ id, gained, before, after: { level: rec.level, exp: rec.exp }, levelUp: lv.to - lv.from, reserve: rate < 1 });
      }

      for (const id of summary.fielded) {
        const rec = d.characters[id];
        const stays = summary.stays[id] || 0;
        const gained = c.dependency.perBattle + stays * c.dependency.perStay;
        const fromStage = dependencyStage(rec.dependency).stage;
        rec.dependency += gained;
        const toStage = dependencyStage(rec.dependency).stage;
        report.dependency.push({ id, gained, stays, points: rec.dependency, fromStage, toStage });
      }

      const bondGain = {};
      for (const key of summary.comboPairs) bondGain[key] = (bondGain[key] || 0) + c.bond.perCombo;
      for (const key of summary.grabPairs) bondGain[key] = (bondGain[key] || 0) + c.bond.perGrab;
      for (const [key, gained] of Object.entries(bondGain)) {
        const from = d.bonds[key] || 0;
        const to = Math.min(c.bond.max, from + gained);
        d.bonds[key] = to;
        report.bonds.push({ key, ids: key.split('+'), from, to, combo: summary.comboPairs.includes(key), grab: summary.grabPairs.includes(key) });
      }
    });
    return report;
  }

  return {
    expToNext, stats, addExpTo, skillMultiplier, upgradeCost, upgradeSkill,
    dependencyStage, shakeLine, bondLevel, applyBattleRewards,
  };
})();
