# 이미지 파일 이름 규칙

아래 이름 그대로 파일을 넣으면 게임에서 자동으로 이미지가 보여요. 파일이 없으면 색 네모 안에 이름이 글자로 표시돼요. 형식은 PNG(투명 배경)이고, 이름은 모두 소문자예요.

## 캐릭터 아이디

| 아이디 | 이름 |
| --- | --- |
| `hayun` | 하윤 |
| `seoyeon` | 서연 |
| `dahyeon` | 다현 |
| `yuna` | 유나 |
| `jiyu` | 지유 |
| `eunchae` | 은채 |

## 스탠딩 — `assets/characters/아이디_표정.png`

| 표정 | 뜻 |
| --- | --- |
| `default` | 기본 |
| `smile` | 웃음 |
| `sad` | 슬픔 |
| `surprised` | 놀람 |
| `angry` | 화남 |

예: `assets/characters/hayun_default.png`, `assets/characters/seoyeon_smile.png`

표정 이미지가 아직 없고 `아이디_default.png`만 있으면 기본 표정을 대신 보여줘요.

## 조연

`data/npcs.json`에 있는 조연도 같은 규칙을 따라요. 교감은 `vp`예요. 예: `assets/characters/vp_smile.png`

## 악몽 속 모습 — `assets/characters/아이디_nightmare.png`

예: `assets/characters/dahyeon_nightmare.png`

## 배경 — `assets/backgrounds/배경키.png`

| 배경키 | 장소 |
| --- | --- |
| `staff_room` | 교무실 |
| `club_room` | 부실 |
| `club_room_rain` | 부실 — 비 오는 저녁 |
| `club_room_dark` | 부실 — 정전 |
| `hallway` | 복도 |
| `classroom` | 교실 |
| `classroom_night` | 교실 — 저녁 |
| `field` | 운동장 |
| `garden` | 학교 뒤 화단 |
| `ch1_classroom` | 1장 악몽 — 끝없는 교실 |
| `ch1_erased` | 1장 악몽 — 지워지는 교실 |
| `library` | 도서관 |
| `nightmare_hallway` | 악몽 — 끝없는 복도 (프롤로그) |

새 배경키를 쓰려면 파일을 넣고 대사 파일의 `"bg"`에 그 키를 적으면 돼요. 대체 표시에 한글 이름을 보이고 싶으면 `js/assets.js`의 `BACKGROUNDS`에도 추가하세요.

## 적 — `assets/enemies/적키.png`

적 그림 파일 이름은 `data/enemies.json`의 `images`에 적어요. 같은 적이 여럿 나오면 목록을 돌아가며 써요.

| 파일 | 적 |
| --- | --- |
| `shade_1~3` | 그늘 |
| `boss_door` | 보스 닫힌 문 |
| `ch1_enemy_1` | 등 돌린 아이 (1장) |
| `ch1_enemy_2` | 지우개 얼룩 (1장) |
| `ch1_boss` | 돌아보지 않는 교실 (1장 보스) |

## 표정이 없을 때

그 표정 그림이 없으면 `default`, 그다음 다른 표정 중 있는 것을 대신 보여줘요. (예: 서연은 `default`가 없어서 `smile`이 대신 나와요)

## SD와 동작 시트 — `assets/characters`

- `아이디_sd.png`: 뒷모습 SD 한 장
- `아이디_attack.png` (6프레임), `아이디_skill.png` (6프레임), `아이디_heart.png` (8프레임): 가로로 이어진 동작 시트

## CG — `assets/cg/키.png`

여러 명이 함께 나오는 장면 그림. 대사 파일에서 `"cg": "prologue_1"`로 띄우고, 다음 `"bg"`가 오면 끝나요.

| 키 | 장면 |
| --- | --- |
| `prologue_1` | 비 오는 저녁 부실 (프롤로그 3) |
| `prologue_2` | 어두운 복도에서 손을 잡는 장면 (프롤로그 4) |
| `ch1_end` | 1장 끝, 아침 교실 인사 |

## 아이콘 — `assets/ui`

| 파일 | 쓰는 곳 |
| --- | --- |
| `skill_아이디_basic/skill/heart` | 전투 행동 버튼, 캐릭터 화면 |
| `cmd_hold`, `cmd_stay` | 전투의 붙잡기, 곁에 있기 |
| `promise_종류_등급` (smile/trust/tomorrow × bronze/silver/gold) | 편성 약속 슬롯, 상담 결과 |
| `act_study/walk/snack/talk/play/stay/rest` | 방과후 상담 활동 |
| `logo`, `title_bg` | 타이틀 (아직 없음) |

원본 아이콘 시트는 `assets/ui/sheets`, 배경을 지우기 전 원본은 `assets/originals`, 같은 이름 후보 중 쓰지 않은 그림은 `assets/extra`에 있어요.
