/*
 * dialogue.js — 대화 화면
 *
 * 대사 파일: data/story/{파일}.json (형식은 data/story/README.md)
 * 사용: Game.go('dialogue', { file: 'prologue_01', heading: '프롤로그 1. 부임', onEnd() { ... } })
 */

// ===== 대사 파일 읽기 + 검사 =====
const Story = (() => {
  const cache = new Map();

  function compile(file, lines) {
    const where = (i) => `data/story/${file}.json ${i + 1}번째 줄`;
    if (!Array.isArray(lines)) throw new Error(`data/story/${file}.json 은 [ ] 배열이어야 해요.`);

    const labels = {};
    lines.forEach((line, i) => {
      if (line === null || typeof line !== 'object' || Array.isArray(line)) {
        throw new Error(`${where(i)}: { } 형식이 아니에요.`);
      }
      if (line.label != null) {
        if (line.label in labels) throw new Error(`${where(i)}: 라벨 "${line.label}"이 두 번 나와요.`);
        labels[line.label] = i;
      }
    });

    const checkGoto = (target, i) => {
      if (!(target in labels)) throw new Error(`${where(i)}: goto "${target}" 라벨이 없어요.`);
    };
    lines.forEach((line, i) => {
      if (line.goto != null) checkGoto(line.goto, i);
      if (line.choice != null) {
        if (!Array.isArray(line.choice) || line.choice.length === 0) {
          throw new Error(`${where(i)}: choice는 선택지 배열이어야 해요.`);
        }
        line.choice.forEach((opt) => {
          if (typeof opt.text !== 'string') throw new Error(`${where(i)}: 선택지에 text가 없어요.`);
          if (opt.goto != null) checkGoto(opt.goto, i);
        });
      }
      if (line.battle != null && (!Array.isArray(line.battle.enemies) || !line.battle.enemies.length)) {
        throw new Error(`${where(i)}: battle에는 enemies 배열이 필요해요.`);
      }
      if (line.show != null && (!Array.isArray(line.show) || line.show.length > 3)) {
        throw new Error(`${where(i)}: show는 최대 3명까지의 배열이어야 해요.`);
      }
    });
    return { file, lines, labels };
  }

  async function load(file) {
    if (!/^[a-z0-9_]+$/i.test(file || '')) throw new Error(`잘못된 대사 파일 이름: ${file}`);
    if (cache.has(file)) return cache.get(file);
    const res = await fetch(`data/story/${file}.json`);
    if (!res.ok) throw new Error(`data/story/${file}.json 을 찾지 못했어요 (${res.status}).`);
    let lines;
    try {
      lines = await res.json();
    } catch (e) {
      throw new Error(`data/story/${file}.json JSON 형식 오류: ${e.message}`);
    }
    const script = compile(file, lines);
    cache.set(file, script);
    return script;
  }

  /** "안녕. *(웃는다)* 잘 가." → [{text, em:false}, {text:'(웃는다)', em:true}, ...] */
  function parseInline(str) {
    const out = [];
    const re = /\*([^*]+)\*/g;
    let last = 0;
    let m;
    while ((m = re.exec(str))) {
      if (m.index > last) out.push({ text: str.slice(last, m.index), em: false });
      out.push({ text: m[1], em: true });
      last = re.lastIndex;
    }
    if (last < str.length) out.push({ text: str.slice(last), em: false });
    return out;
  }

  return { load, compile, parseInline };
})();

// ===== 한 글자씩 보여주기 =====
class Typer {
  constructor(container, segments) {
    this.parts = segments.map((seg) => {
      const span = document.createElement(seg.em ? 'em' : 'span');
      container.appendChild(span);
      return { span, chars: Array.from(seg.text) };
    });
    this.total = this.parts.reduce((n, p) => n + p.chars.length, 0);
    this.shown = -1;
    this.reveal(0);
  }

  reveal(n) {
    n = Math.min(n, this.total);
    if (n === this.shown) return;
    this.shown = n;
    let left = n;
    for (const p of this.parts) {
      const take = Math.max(0, Math.min(p.chars.length, left));
      p.span.textContent = p.chars.slice(0, take).join('');
      left -= take;
    }
  }

  get done() { return this.shown >= this.total; }
}

// 대사 속도 설정(1~5) → 초당 글자 수
const TEXT_SPEED_CPS = [0, 14, 24, 38, 60, 110];

Game.registerScreen('dialogue', {
  title: '대화',
  hideTitle: true,
  render(s, params) {
    const el = Game.el;

    // ----- 화면 요소 -----
    s.root.classList.add('dialogue');
    const charsLayer = el('div', 'dlg-chars');
    const titleCard = el('div', 'dlg-titlecard');
    const box = el('div', 'dlg-box');
    const nameTag = el('div', 'dlg-name');
    const textEl = el('div', 'dlg-text');
    const nextMark = el('div', 'dlg-next', '▼');
    box.append(nameTag, textEl, nextMark);
    const choicesLayer = el('div', 'dlg-choices');
    const controls = el('div', 'dlg-controls');
    s.root.append(charsLayer, titleCard, box, choicesLayer, controls);

    if (params.heading) s.root.appendChild(el('div', 'dlg-heading', params.heading));

    const autoBtn = Game.button('자동', () => setAuto(!state.auto));
    const skipBtn = Game.button('넘기기', () => setSkip(!state.skip));
    const logBtn = Game.button('기록', () => openLog());
    for (const b of [autoBtn, skipBtn, logBtn]) {
      b.classList.add('dlg-ctrl');
      b.setAttribute('aria-pressed', 'false');
      controls.appendChild(b);
    }
    logBtn.removeAttribute('aria-pressed');

    // ----- 상태 -----
    const state = {
      script: null,
      index: 0,
      vars: {},          // 이 파일을 한 번 플레이하는 동안만 쓰는 값 (set)
      cast: [],          // 무대 위 캐릭터 [{ id, face }] 최대 3명, 왼쪽부터
      speakerId: null,   // 말하는 캐릭터 (나머지는 어둡게)
      dimAll: false,     // 화면 밖 인물(선생님 등)이 말할 때 모두 어둡게
      bgKey: null,
      cgOn: false,      // CG 가 보이는 중
      mode: 'loading',   // loading | typing | shown | title | choice | ended | error
      auto: false,
      skip: false,
      log: [],
    };
    let typer = null;
    let raf = 0;
    let timer = 0;
    let logOverlay = null;
    const castEls = new Map(); // id → { face, el }

    // ----- 조건과 값 -----
    function flagValue(name) {
      if (name in state.vars) return state.vars[name];
      return Save.data ? Save.data.flags[name] : undefined;
    }

    function conditionOk(cond) {
      const list = Array.isArray(cond) ? cond : [cond];
      return list.every((item) => {
        const str = String(item);
        return str.startsWith('!') ? !flagValue(str.slice(1)) : Boolean(flagValue(str));
      });
    }

    function applyValues(obj) {
      if (obj && obj.set) Object.assign(state.vars, obj.set);
      if (obj && obj.remember && Save.data) Save.update((d) => Object.assign(d.flags, obj.remember));
      // 유대 올리기. once 키가 있으면 저장 데이터당 한 번만 (다시 보기로 중복되지 않게)
      if (obj && obj.bond && Save.data) {
        const { pair, amount = 1, once } = obj.bond;
        if (!once || !Save.data.flags[`bond:${once}`]) {
          Save.update((d) => {
            const key = Save.bondKey(pair[0], pair[1]);
            d.bonds[key] = (d.bonds[key] || 0) + amount;
            if (once) d.flags[`bond:${once}`] = true;
          });
        }
      }
    }

    // ----- 배경 -----
    /** key 가 'cg:이름' 이면 CG, 아니면 배경 */
    function setBackground(key) {
      if (key === state.bgKey) return;
      state.bgKey = key;
      const pic = key.startsWith('cg:') ? Assets.cg(key.slice(3)) : Assets.background(key);
      pic.classList.add('dlg-bg-in');
      // 바로 아래 한 장만 남겨 겹쳐 보이게(페이드) 하고, 그보다 오래된 배경은 지운다
      while (s.bg.children.length > 1) s.bg.firstElementChild.remove();
      s.bg.appendChild(pic);
      pic.addEventListener('animationend', () => {
        while (s.bg.firstElementChild && s.bg.firstElementChild !== pic) s.bg.firstElementChild.remove();
      }, { once: true });
    }

    // ----- 캐릭터 -----
    function toCastEntry(item) {
      return typeof item === 'string' ? { id: item, face: 'default' } : { id: item.id, face: item.face || 'default' };
    }

    function renderCast() {
      const keep = new Set();
      state.cast.forEach((entry, i) => {
        const member = Game.cast(entry.id);
        if (!member) return;
        keep.add(entry.id);
        let rec = castEls.get(entry.id);
        if (!rec || rec.face !== entry.face) {
          const pic = Assets.standing(member, entry.face, 'standing dlg-standing');
          if (rec) rec.el.replaceWith(pic);
          rec = { face: entry.face, el: pic };
          castEls.set(entry.id, rec);
        }
        if (charsLayer.children[i] !== rec.el) charsLayer.insertBefore(rec.el, charsLayer.children[i] || null);
        const dim = state.dimAll || (state.speakerId != null && state.speakerId !== entry.id);
        rec.el.classList.toggle('dim', dim);
      });
      for (const [id, rec] of castEls) {
        if (!keep.has(id)) {
          rec.el.remove();
          castEls.delete(id);
        }
      }
    }

    function applyLine(line) {
      // CG: 여러 명이 함께 나오는 장면 그림. 보이는 동안은 스탠딩을 내린다. 다음 bg 가 오면 끝난다
      if (line.cg) {
        setBackground(`cg:${line.cg}`);
        state.cgOn = true;
        state.cast = [];
      }
      if (line.bg) {
        setBackground(line.bg);
        state.cgOn = false;
      }
      if (Array.isArray(line.show) && !state.cgOn) state.cast = line.show.map(toCastEntry).filter((e) => Game.cast(e.id));
      applyValues(line);

      // 말하는 사람이 등장인물이면 무대에 올리고 표정을 바꾼다
      state.speakerId = null;
      state.dimAll = false;
      if (line.speaker || line.who) {
        const member = line.who ? Game.cast(line.who) : Game.castByName(line.speaker);
        if (member && (line.offstage || state.cgOn)) {
          // 화면 밖에서 말함: 무대에 올리지 않는다
          state.dimAll = true;
        } else if (member) {
          let entry = state.cast.find((e) => e.id === member.id);
          if (!entry) {
            entry = { id: member.id, face: 'default' };
            if (state.cast.length >= 3) state.cast.shift();
            state.cast.push(entry);
          }
          if (line.face) entry.face = line.face;
          state.speakerId = member.id;
        } else {
          state.dimAll = true;
        }
      }
      renderCast();
    }

    // ----- 진행 -----
    function jump(label) {
      state.index = state.script.labels[label];
    }

    /** 지금 위치부터 화면에 보여줄 줄이 나올 때까지 진행 */
    function run() {
      const lines = state.script.lines;
      for (let guard = 0; guard < 10000; guard++) {
        const line = lines[state.index];
        if (!line) return finish();
        if (line.if != null && !conditionOk(line.if)) {
          state.index++;
          continue;
        }
        applyLine(line);

        if (line.choice) {
          const options = line.choice.filter((opt) => opt.if == null || conditionOk(opt.if));
          if (options.length) return showChoices(options);
          state.index++;
          continue;
        }
        if (line.title != null) return showTitle(line);
        if (line.tutorial != null) return showTutorial(line);
        if (line.text != null || line.narration != null) return showLine(line);
        if (line.battle != null) return launchBattle(line.battle);

        if (line.goto != null) jump(line.goto);
        else state.index++;
      }
      showError(new Error('대사가 끝없이 반복돼요. goto와 if를 확인하세요.'));
    }

    /** 보여준 줄을 넘기고 다음으로 */
    function proceed() {
      clearTimeout(timer);
      const line = state.script.lines[state.index];
      if (line && line.goto != null) jump(line.goto);
      else state.index++;
      run();
    }

    function speakerLabel(line) {
      if (!line.speaker) return '';
      return line.aside ? `${line.speaker} (${line.aside})` : line.speaker;
    }

    function showLine(line) {
      titleCard.classList.remove('show');
      box.classList.remove('hidden');
      const isNarration = line.text == null;
      box.classList.toggle('narration', isNarration);
      nameTag.textContent = isNarration ? '' : speakerLabel(line);
      nameTag.classList.toggle('empty', isNarration || !line.speaker);
      textEl.replaceChildren();
      nextMark.classList.remove('show');

      const segments = isNarration ? [{ text: line.narration, em: true }] : Story.parseInline(String(line.text));
      typer = new Typer(textEl, segments);
      state.log.push({ kind: isNarration ? 'narration' : 'line', speaker: speakerLabel(line), segments });

      state.mode = 'typing';
      if (state.skip) return completeLine();
      const cps = TEXT_SPEED_CPS[Settings.get('textSpeed')] || TEXT_SPEED_CPS[3];
      const start = performance.now();
      const tick = (now) => {
        if (state.mode !== 'typing') return;
        const n = Math.floor(((now - start) / 1000) * cps) + 1;
        if (n >= typer.total) return completeLine();
        typer.reveal(n);
        raf = requestAnimationFrame(tick);
      };
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    }

    function completeLine() {
      cancelAnimationFrame(raf);
      if (typer) typer.reveal(typer.total);
      state.mode = 'shown';
      nextMark.classList.add('show');
      scheduleAdvance();
    }

    function showTitle(line) {
      box.classList.add('hidden');
      titleCard.classList.remove('tutorial');
      titleCard.textContent = String(line.title);
      titleCard.classList.add('show');
      state.log.push({ kind: 'title', speaker: '', segments: [{ text: String(line.title), em: false }] });
      state.mode = 'title';
      scheduleAdvance();
    }

    function showTutorial(line) {
      box.classList.add('hidden');
      const t = line.tutorial;
      titleCard.replaceChildren();
      titleCard.classList.add('tutorial');
      const panel = el('div', 'dlg-tutorial');
      panel.appendChild(el('div', 'dlg-tutorial-tag', '튜토리얼'));
      if (t.title) panel.appendChild(el('h2', null, t.title));
      panel.appendChild(el('p', null, t.text));
      titleCard.appendChild(panel);
      titleCard.classList.add('show');
      state.log.push({ kind: 'title', speaker: '[튜토리얼]', segments: [{ text: `${t.title ? `${t.title} — ` : ''}${t.text}`, em: false }] });
      state.mode = 'title';
      scheduleAdvance();
    }

    /** 대사 도중 전투. 이기면 다음 줄부터 이어서, 지면 깨어나는 장면 후 다시 도전 */
    function launchBattle(cfg) {
      setAuto(false);
      setSkip(false);
      state.mode = 'ended';
      const snapshot = {
        index: state.index + 1,
        vars: { ...state.vars },
        cast: state.cast.map((c) => ({ ...c })),
        bgKey: state.bgKey,
        cgOn: state.cgOn,
        log: state.log.slice(-300),
      };
      const resumeParams = { ...params, resume: snapshot };
      const battleParams = {
        party: cfg.party,
        reserve: cfg.reserve,
        enemies: cfg.enemies,
        tutorial: cfg.tutorial,
        onWin: () => Game.go('dialogue', resumeParams),
        onLose: () => Game.go('dialogue', {
          file: cfg.wakeup || 'prologue_wakeup',
          heading: params.heading,
          onEnd: (vars) => (vars.retry ? Game.go('battle', battleParams) : Game.go('room')),
        }),
      };
      Game.go('battle', battleParams);
    }

    function showChoices(options) {
      setSkip(false);
      clearTimeout(timer);
      state.mode = 'choice';
      nextMark.classList.remove('show');
      choicesLayer.replaceChildren();
      for (const opt of options) {
        const b = Game.button(opt.text, () => {
          if (state.mode !== 'choice') return;
          choicesLayer.replaceChildren();
          choicesLayer.classList.remove('show');
          state.log.push({ kind: 'choice', speaker: '', segments: [{ text: opt.text, em: false }] });
          applyValues(opt);
          if (opt.goto != null) jump(opt.goto);
          else state.index++;
          run();
        });
        b.classList.add('dlg-choice');
        choicesLayer.appendChild(b);
      }
      choicesLayer.classList.add('show');
    }

    function finish() {
      state.mode = 'ended';
      setAuto(false);
      setSkip(false);
      if (typeof params.onEnd === 'function') params.onEnd(state.vars);
      else Game.go('room');
    }

    function showError(err) {
      console.error(err);
      state.mode = 'error';
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      titleCard.classList.remove('show');
      box.classList.remove('hidden', 'narration');
      nameTag.textContent = '대사 파일 오류';
      nameTag.classList.remove('empty');
      textEl.textContent = err.message;
      controls.replaceChildren(Game.button('부실로', () => Game.go('room')));
    }

    // ----- 자동 / 넘기기 -----
    function scheduleAdvance() {
      clearTimeout(timer);
      if (state.mode !== 'shown' && state.mode !== 'title') return;
      if (logOverlay) return;
      if (state.skip) {
        timer = setTimeout(proceed, 60);
      } else if (state.auto) {
        const len = typer && state.mode === 'shown' ? typer.total : 12;
        timer = setTimeout(proceed, 1100 + len * 55);
      }
    }

    function setAuto(on) {
      state.auto = on;
      autoBtn.classList.toggle('active', on);
      autoBtn.setAttribute('aria-pressed', String(on));
      if (on) scheduleAdvance();
      else if (!state.skip) clearTimeout(timer);
    }

    function setSkip(on) {
      state.skip = on;
      skipBtn.classList.toggle('active', on);
      skipBtn.setAttribute('aria-pressed', String(on));
      if (on && state.mode === 'typing') completeLine();
      else if (on) scheduleAdvance();
      else if (!state.auto) clearTimeout(timer);
    }

    // ----- 대사 기록 -----
    function openLog() {
      if (logOverlay) return;
      clearTimeout(timer);
      logOverlay = el('div', 'dlg-log');
      const panel = el('div', 'dlg-log-panel');
      const head = el('div', 'dlg-log-head');
      head.appendChild(el('h2', null, '대사 기록'));
      head.appendChild(Game.button('닫기', closeLog, { primary: true }));
      const list = el('div', 'dlg-log-list scrollable');
      for (const entry of state.log) {
        const item = el('div', `dlg-log-item ${entry.kind}`);
        if (entry.speaker) item.appendChild(el('div', 'dlg-log-speaker', entry.speaker));
        const body = el('div', 'dlg-log-text');
        if (entry.kind === 'choice') body.appendChild(el('span', 'dlg-log-mark', '▶ '));
        for (const seg of entry.segments) body.appendChild(el(seg.em ? 'em' : 'span', null, seg.text));
        item.appendChild(body);
        list.appendChild(item);
      }
      if (!state.log.length) list.appendChild(el('p', 'dlg-log-empty', '아직 기록이 없어요.'));
      panel.append(head, list);
      logOverlay.appendChild(panel);
      s.root.appendChild(logOverlay);
      list.scrollTop = list.scrollHeight;
    }

    function closeLog() {
      if (!logOverlay) return;
      logOverlay.remove();
      logOverlay = null;
      scheduleAdvance();
    }

    // ----- 입력: 화면 아무 곳이나 누르면 다음 -----
    function advanceByUser() {
      if (logOverlay) return;
      if (state.skip) {
        setSkip(false);
        return;
      }
      if (state.mode === 'typing') completeLine();
      else if (state.mode === 'shown' || state.mode === 'title') proceed();
    }

    s.root.addEventListener('click', (e) => {
      if (e.target.closest('button, .dlg-log, .dlg-choices')) return;
      advanceByUser();
    });

    const onKey = (e) => {
      if (e.repeat && !state.skip) return;
      if (e.key === 'Escape' && logOverlay) return closeLog();
      if ((e.key === ' ' || e.key === 'Enter') && !e.target.closest('button')) {
        e.preventDefault();
        advanceByUser();
      }
    };
    document.addEventListener('keydown', onKey);

    // ----- 시작 -----
    box.classList.add('hidden');
    Story.load(params.file || 'prologue_01')
      .then((script) => {
        state.script = script;
        state.index = 0;
        const r = params.resume;
        if (r) {
          // 전투가 끝나고 돌아온 경우: 배경·인물·기록을 되살리고 다음 줄부터
          state.index = r.index;
          Object.assign(state.vars, r.vars);
          state.cast = r.cast.map((c) => ({ ...c }));
          state.log = r.log.slice();
          if (r.bgKey) setBackground(r.bgKey);
          state.cgOn = Boolean(r.cgOn);
          renderCast();
        }
        run();
      })
      .catch(showError);

    // 화면을 떠날 때 정리
    return () => {
      state.mode = 'ended';
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
    };
  },
});
