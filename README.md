# 쉼표부

동아리 담당 선생님이 되어 여섯 아이의 악몽에 함께 들어가는 스토리 중심 턴제 웹 게임.

- 플레이: https://hoduzy.github.io/Domang/
- 기획서: [docs/design.md](docs/design.md) · 프롤로그 대본: [docs/prologue.md](docs/prologue.md) · 캐릭터 디자인: [docs/characters.md](docs/characters.md)

## 배포 (GitHub Pages)

`main` 브랜치의 루트 폴더를 그대로 배포해요. 빌드 과정은 없어요.

- 모든 경로는 상대 경로(`data/...`, `assets/...`)라서 `https://hoduzy.github.io/Domang/` 처럼 하위 경로에서도 그대로 동작해요.
- `.nojekyll` 파일이 있어서 GitHub Pages가 Jekyll 변환 없이 파일을 그대로 내보내요.
- GitHub Pages 주소는 대소문자를 구분해요. 이미지 파일 이름은 `assets/README.md`의 규칙대로 소문자로 넣어 주세요.

## 로컬에서 실행

`index.html`을 더블클릭해서 열면 브라우저가 데이터 파일(JSON)을 막아서 시작되지 않아요. 저장소 폴더에서 간단한 서버를 띄워 주세요.

```
python3 -m http.server 8000
```

그다음 http://localhost:8000 에 접속하면 돼요.

## 폴더

| 폴더 | 내용 |
| --- | --- |
| `index.html`, `css/`, `js/` | 게임 코드 |
| `data/` | 캐릭터·스킬·적·대사·성장·상담 수치 (JSON) |
| `assets/` | 이미지와 소리. 파일 이름 규칙은 `assets/README.md` |
| `docs/` | 기획 문서 |
