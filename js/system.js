/*
 * system.js — 주제 안내, 타이틀, 설정 화면
 */

const chapterLabel = (chapter) => Game.chapterLabel(chapter);

function supportBox(className = '') {
  const box = Game.el('div', `support-box ${className}`.trim());
  box.setAttribute('role', 'note');
  box.appendChild(Game.el('p', 'support-text', Game.SUPPORT_MESSAGE));
  box.appendChild(Game.el('p', 'support-number', '자살예방상담전화 109'));
  box.appendChild(Game.el('p', 'support-sub', '24시간 · 무료'));
  return box;
}

// ===== 주제 안내 (게임을 켤 때마다 타이틀보다 먼저) =====
Game.registerScreen('notice', {
  title: '주제 안내',
  hideTitle: true,
  render(s) {
    s.body.classList.add('notice-body');
    s.body.appendChild(supportBox('large'));
    s.nav.classList.add('center');
    s.addButton('확인', () => Game.go('title'), { primary: true });
  },
});

// ===== 타이틀 =====
Game.registerScreen('title', {
  title: '타이틀',
  render(s) {
    s.body.appendChild(Game.el('div', 'title-logo', '쉼표부'));

    const hasSave = Save.exists();
    s.addButton('설정', () => Game.go('settings', { from: 'title' }));
    s.addButton('새로 하기', async () => {
      if (Save.exists()) {
        const ok = await Game.confirm('저장된 진행이 지워지고 처음부터 시작해요. 계속할까요?', { ok: '새로 하기' });
        if (!ok) return;
      }
      Save.startNew();
      Game.playStage(0, 1);
    }, { primary: !hasSave });
    s.addButton('이어하기', () => {
      if (!Save.load()) {
        Game.toast('저장 데이터를 읽지 못했어요.');
        return;
      }
      Game.resume();
    }, { primary: hasSave, disabled: !hasSave });
  },
});

// ===== 설정 =====
Game.registerScreen('settings', {
  title: '설정',
  render(s, params) {
    const from = params.from || 'title';
    if (!Save.data && Save.exists()) Save.load(); // 타이틀에서 들어와도 내보내기를 할 수 있게

    s.body.classList.add('settings-body');
    const layout = Game.el('div', 'settings-layout');
    s.body.appendChild(layout);

    // --- 왼쪽 위: 조절 ---
    const sliders = Game.el('div', 'panel settings-sliders');
    sliders.appendChild(Game.el('h2', 'panel-title', '화면과 소리'));
    sliders.appendChild(sliderRow('textSpeed', '대사 속도', (v) => Settings.TEXT_SPEED_LABELS[v]));
    sliders.appendChild(sliderRow('bgmVolume', '배경음 크기', (v) => `${v}`));
    sliders.appendChild(sliderRow('sfxVolume', '효과음 크기', (v) => `${v}`));
    layout.appendChild(sliders);

    // --- 오른쪽 위: 상담 연락처 (항상 표시) ---
    layout.appendChild(supportBox('settings-support'));

    // --- 아래: 저장 파일 ---
    const files = Game.el('div', 'panel settings-files');
    const info = Game.el('div', 'settings-files-info');
    files.appendChild(info);
    info.appendChild(Game.el('h2', 'panel-title', '저장 파일'));
    const status = Game.el('p', 'save-status');
    const refreshStatus = () => {
      const d = Save.data;
      status.textContent = d
        ? `${chapterLabel(d.progress.chapter)} 스테이지 ${d.progress.stage} · 마지막 저장 ${new Date(d.updatedAt).toLocaleString('ko-KR')}`
        : '아직 저장된 진행이 없어요.';
    };
    refreshStatus();
    info.appendChild(status);
    info.appendChild(Game.el('p', 'save-hint', '진행 상황은 이 브라우저에 자동 저장돼요. 기기를 바꿀 때는 파일로 내보낸 뒤 새 기기에서 불러오세요.'));

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.hidden = true;
    files.appendChild(fileInput);

    const row = Game.el('div', 'panel-buttons');
    const exportBtn = Game.button('내보내기', () => {
      try {
        const name = Save.exportFile();
        Game.toast(`${name} 파일로 내보냈어요.`);
      } catch (e) {
        Game.toast(e.message);
      }
    }, { disabled: !Save.data });
    const importBtn = Game.button('불러오기', () => fileInput.click());
    row.append(exportBtn, importBtn);
    files.appendChild(row);
    layout.appendChild(files);

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      let data;
      try {
        data = Save.parseFile(await file.text());
      } catch (e) {
        Game.toast(`불러오지 못했어요. ${e.message}`);
        return;
      }
      const summary = `${chapterLabel(data.progress.chapter)} 스테이지 ${data.progress.stage} (${new Date(data.updatedAt).toLocaleString('ko-KR')} 저장)`;
      const msg = Save.exists()
        ? `${summary}\n이 파일로 지금 진행을 덮어쓸까요?`
        : `${summary}\n이 파일을 불러올까요?`;
      if (!(await Game.confirm(msg, { ok: '불러오기' }))) return;
      Save.apply(data);
      refreshStatus();
      exportBtn.disabled = false;
      Game.toast('저장 파일을 불러왔어요.');
    });

    s.addButton(from === 'title' ? '타이틀로' : '돌아가기', () => Game.go(from), { primary: true });
  },
});

function sliderRow(key, label, format) {
  const [min, max] = Settings.RANGES[key];
  const row = Game.el('label', 'slider-row');
  row.appendChild(Game.el('span', 'slider-label', label));
  const input = document.createElement('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.step = 1;
  input.value = Settings.get(key);
  const value = Game.el('span', 'slider-value', format(Settings.get(key)));
  input.addEventListener('input', () => {
    Settings.set(key, input.value);
    value.textContent = format(Settings.get(key));
  });
  row.append(input, value);
  return row;
}
