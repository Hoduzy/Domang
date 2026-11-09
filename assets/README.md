# 이미지 파일 이름 규칙

아래 이름 그대로 파일을 넣으면 게임에서 자동으로 이미지가 보여요. 파일이 없으면 색 네모 안에 이름이 글자로 표시돼요. 형식은 PNG(투명 배경)이고, 이름은 모두 소문자예요.

## 캐릭터 아이디

| 아이디 | 이름 |
| --- | --- |
| `hayun` | 하윤 |
| `seojin` | 서진 |
| `dohyeon` | 도현 |
| `yuna` | 유나 |
| `jiho` | 지호 |
| `eunjae` | 은재 |

## 스탠딩 — `assets/characters/아이디_표정.png`

| 표정 | 뜻 |
| --- | --- |
| `default` | 기본 |
| `smile` | 웃음 |
| `sad` | 슬픔 |
| `surprised` | 놀람 |
| `angry` | 화남 |

예: `assets/characters/hayun_default.png`, `assets/characters/seojin_smile.png`

표정 이미지가 아직 없고 `아이디_default.png`만 있으면 기본 표정을 대신 보여줘요.

## 조연

`data/npcs.json`에 있는 조연도 같은 규칙을 따라요. 교감은 `vice_principal`이에요. 예: `assets/characters/vice_principal_default.png`

## 악몽 속 모습 — `assets/characters/아이디_nightmare.png`

예: `assets/characters/dohyeon_nightmare.png`

## 배경 — `assets/backgrounds/배경키.png`

| 배경키 | 장소 |
| --- | --- |
| `staff_room` | 교무실 |
| `club_room` | 부실 |
| `hallway` | 복도 |
| `classroom` | 교실 |
| `classroom_night` | 교실 — 저녁 |
| `schoolyard` | 운동장 |
| `flowerbed` | 학교 뒤 화단 |
| `library` | 도서관 |
| `nightmare_hallway` | 악몽 — 끝없는 복도 (프롤로그) |

새 배경키를 쓰려면 파일을 넣고 대사 파일의 `"bg"`에 그 키를 적으면 돼요. 대체 표시에 한글 이름을 보이고 싶으면 `js/assets.js`의 `BACKGROUNDS`에도 추가하세요.

## 적 — `assets/enemies/적키.png`

예: `assets/enemies/shade.png` (그늘)
