# Pulse 메트로놈 리팩토링 검증과 복구

## 비교 기준

2026-11-24 점검한 기준 코드는 `2f97e9a302274fca30d461e9eedeb287ecafc4be`이다. 이 커밋에서 Node 24.22.3, npm 11.19.1, Linux headless Chromium 153.0.8010.0으로 기존 단위 검사 18개 파일 172건, Chromium E2E 23건 및 기존 운영 빌드 PWA 검사가 통과했다. 당시 운영 주소는 같은 커밋을 서비스했다. 기본 4/4·120 BPM의 재생·정지, 공연 모드에서 일반 화면으로 복귀하는 동작만 운영 화면에서 확인했다. 후보 변경의 검증은 격리된 로컬 origin에서 수행한다.

기준 커밋에 신규 브라우저 검사만 복사해 두 가지 실패를 다시 확인했다. 정지 화면의 120 BPM에서 속도 훈련 시작값을 80으로 두고 +1을 누르면 화면은 81이 됐다. 4/4를 연주하는 중 3/4를 예약하면 현재 마디의 네 번째 박 버튼이 계속 활성화됐다. 같은 조건의 통과 기준은 121 BPM과 네 번째 버튼 비활성화이다.

일반 보기는 BPM 숫자와 박 표시를, 공연 보기는 큰 BPM과 재생·곡 이동 조작을 제공한다. 기계식 진자는 독립 컴포넌트 시험 대상이며 화면 선택기에서 제공하는 기능은 일반·공연 두 가지다. 기본 Vitest 검색 범위를 `src/**/*.test.{ts,tsx}`로 확장했으며 기계식 컴포넌트 검사 1건의 발견과 실행을 확인했다.

## 재현 환경과 명령

저장소 최상위에서 Node 24와 잠금 파일을 사용한다. 로컬 검사는 임시 Chromium 문맥에서 실행한다. 한 기기 두 탭은 하나의 문맥을 공유하며, 백업을 복원할 기기는 별도의 새 문맥을 사용한다.

```bash
git rev-parse HEAD
git status --short
node --version
npm --version
npm ci
npx playwright install chromium
node scripts/refactor-fixtures.mjs
npx vitest list --filesOnly
npm test
npm run build
npm run test:e2e
npm run test:pwa
```

개별 재현 명령은 `npx playwright test e2e/refactoring.spec.ts`(표시 템포·마디 경계), `npx playwright test e2e/classroom.spec.ts`(교실 화면), `npx playwright test e2e/journeys.spec.ts`(60초 카운트인·타이머 및 6/8 훈련), `npx playwright test e2e/audio.spec.ts`(브라우저 합성 파형)이다. 개발용 테스트 서버는 5173 포트를, 운영 번들 PWA 검사는 전용 포트를 쓴다. 자동화된 PWA 결과는 `output/playwright/pwa-*/report.json`, 수업 흐름은 `output/playwright/journeys/`에 기록한다. 실패한 브라우저 테스트는 `test-results/`의 추적 파일을 확인한다.

`scripts/refactor-fixtures.mjs`는 `docs/backup-example.json`으로부터 다음 v2 데이터를 생성한다. ID, 항목 순서, 날짜가 고정되어 실행마다 같은 UTF-8 크기가 나온다. 작은 자료는 같은 BPM의 곡 두 개와 첫 곡을 한 번 더 넣은 순서를 가지며, 세 번째 항목이 선택되어 있다. 큰 자료는 기준 시점의 500곡과 목록별 역순 500항목이다.

| 프리셋 / 목록 | compact 바이트 | 2칸 들여쓰기 바이트 |
|---|---:|---:|
| 2 / 1 | 2,423 | 3,879 |
| 500 / 25 | 1,514,642 | 2,261,076 |
| 500 / 37 | 2,091,614 | 3,090,540 |
| 500 / 38 | 2,139,763 | 3,159,730 |

### 성능과 오디오 계측

아래 두 서버는 각각 별도 터미널에서 실행한다. 운영 입력 벤치마크는 서비스 워커를 차단한 격리 문맥을 사용한다. 브라우저에서 처리한 동기 키 이벤트와 IDB 트랜잭션 시작부터 완료까지의 시간을 따로 기록한다. 재생 기한·누락 계측은 진단이 활성화된 로컬 빌드를 사용한다.

```bash
npm run build
npm run preview -- --port 4190 --strictPort
# 새 터미널
node scripts/measure-storage.mjs pulse-refactor-storage http://127.0.0.1:4190/
```

```bash
npx vite build --mode diagnostics --outDir output/diagnostics-dist
npm run preview -- --port 5190 --strictPort --outDir output/diagnostics-dist
# 새 터미널. 첫 인수는 측정할 실제 재생 시간(초).
node scripts/measure.mjs 60 5190 pulse-refactor-audio --large-library
```

저장 측정 기본값은 자료 규모마다 워밍업 1회 후 100회 × 3회이며 ↑·↓ 입력 간격은 300ms이다. 결과 파일의 `keyboardBpm`, `finalBpm`, `savedBpm`과 큰 자료의 동기 처리 중앙값 8ms·p95 16ms 목표를 함께 살핀다. 재생 계측에서는 300 BPM·4분할을 유지하며 속도·저장 지연과 오디오 누락·중복을 별도로 판정한다.

### 2026-11-24 입력 측정 결과

운영 번들 ID `3c729d6cf84049e9bb1a`의 복사본을 고정해 Node 24.22.3, Linux x64, Chromium 153.0.8010.0 headless, 390×844 화면에서 재생을 멈추고 측정했다. 각 행의 키 표본은 워밍업을 제외한 100개이다. IDB 지연은 키 입력과 별도이며 슬라이더 조작까지 포함한 완료 트랜잭션의 중앙값이다.

| 회차 | 자료 | 키 중앙값 (ms) | 키 p95 (ms) | IDB 완료 중앙값 (ms) |
|---:|---|---:|---:|---:|
| 1 | 빈 목록 | 1.4 | 19.0 | 1.9 |
| 1 | 500곡·25목록 | 1.3 | 8.8 | 3.0 |
| 2 | 빈 목록 | 1.2 | 19.8 | 1.5 |
| 2 | 500곡·25목록 | 1.5 | 10.1 | 5.3 |
| 3 | 빈 목록 | 1.3 | 13.3 | 2.0 |
| 3 | 500곡·25목록 | 1.3 | 9.7 | 2.5 |

큰 자료 세 회차 모두 중앙값 8ms·p95 16ms 이내였다. 각 회차에 키 입력 직후 121 BPM, 슬라이더 조작 후 300 BPM, 새로고침 후 300 BPM을 확인했고 102회의 IDB 쓰기 완료를 관찰했다. 원자료는 `output/playwright/pulse-refactor-storage.json`이다. 빈 목록의 상위 지연이 큰 자료보다 길었던 런도 있었으므로 분포의 차이를 데이터 크기만의 효과로 해석할 수 없다.

### 60초 재생과 레거시 복구

500곡·25개 목록이 있는 진단용 로컬 번들에서 Chromium 153.0.8010.0, 1440×900, 전경, 300 BPM·4분할로 60초 재생했다. 연습 중 갭과 랜덤 묵음을 켜고 33ms 이상 간격으로 슬라이더 키를 30번 조작했다. 예약된 이벤트 1,199개, 늦어서 건너뛴 이벤트 1개, 중복 0개였고 Worker 틱의 최대 간격은 130.6ms, 예약 큐 최댓값은 5개였다. 작업별 시작과 종료 시점까지 누락은 0개였고 이후 관측 구간에서 1개가 기록됐다. 정지 뒤 큐와 활성 음원은 모두 0개, 페이지 오류도 0개였다. 이 결과는 물리 출력 파형을 측정한 값이 아니며, 100ms 선예약 시간을 넘기는 지연에서 항상 모든 박을 연주한다는 주장을 뒷받침하지 않는다. 원자료는 `output/playwright/pulse-refactor-audio.json`이다.

이전 v2 키에 38개 목록의 2,139,763바이트 원문을 넣고 첫 실행을 거친 뒤, 별도의 새 탭에서 같은 '연습 499'를 열었다. IndexedDB로 이관한 설정·프리셋 500개·셋리스트 38개·선택 위치가 원문과 일치했고, 예전 키의 원문이 그대로 남았다. 이 검사는 `npx playwright test e2e/refactoring.spec.ts -g "R02 migrate"`로 재현한다.

## 인수 기준과 증거

| ID | 검사에서 판정하는 동작 | 증거 경로 |
|---|---|---|
| R01 | 같은 브라우저의 두 탭에서 저장한 곡과 121 BPM이 새 탭에도 남고 겹치는 편집은 검토할 수 있다. | `e2e/storageConcurrency.spec.ts`, `src/tests/storageTransactions.test.ts` |
| R02 | 기존 2,139,763바이트 v2 원문을 이관한다. 2,261,076바이트 파일을 가져오고 빈 문맥에서 내보낸 설정·곡·목록·선택을 비교한다. | `e2e/backupLarge.spec.ts`, `e2e/refactoring.spec.ts`, `e2e/presets.spec.ts` |
| R03 | 쓰기 실패 시 화면에 미저장 상태가 보이며, 격리된 브라우저 문맥에서 초안 내보내기와 재시도를 검증한다. | `e2e/app.spec.ts`, `e2e/storageRecovery.spec.ts`, `e2e/savedData.ts` |
| R04 | 작은 자료와 큰 자료에서 입력 동기 시간·IDB 기록 완료·마지막 BPM을 비교한다. 재생 중 누락·중복은 별도 계측한다. | `scripts/measure-storage.mjs`, `scripts/measure.mjs` |
| R05 | 바꾸지 않은 필드를 Tab으로 통과하거나 Escape로 취소한 경우 타이머·훈련을 유지한다. | `src/tests/input.test.tsx`, `e2e/app.spec.ts` |
| R06 | 정지 120→121·훈련 84→85를 일반, 공연, 키보드에서 각각 확인한다. 저장 후 다시 연 값, 실제 재생 이벤트 및 같은 프레임의 +1 세 번도 확인한다. | `e2e/refactoring.spec.ts`, `src/tests/engineManualTempo.test.ts` |
| R07 | 4/4에서 3/4를 예약한 동안 현재 네 번째 버튼이 비활성화된다. 리듬 패널로 바꾼 세 번째 악센트가 새 마디 첫 이벤트에 포함되고 화면에 세 셀이 남는다. | `e2e/refactoring.spec.ts`, `src/tests/engineClockBoundary.test.ts` |
| R08 | 선예약 음원의 뮤트 해제, 다음 마디부터 발생하는 프리셋 음량 전환을 예약 시각·합성 파형으로 확인한다. | `src/tests/enginePractice.test.ts`, `e2e/audio.spec.ts` |
| R09 | 1/4·전역 뮤트에서도 연속한 주박이 보인다. 훈련 묵음의 단서 숨김과 동작 줄이기 설정이 지켜진다. | `src/tests/feedback.test.tsx`, `e2e/classroom.spec.ts` |
| R10 | 6/8 점4분음표 60은 두 큰박·여섯 셀이다. 강세 적용 시 편집한 쉼·약과 해당 그룹 규칙을 보존한다. | `src/tests/rhythm.test.ts`, `e2e/classroom.spec.ts`, `e2e/journeys.spec.ts` |
| R11 | 320·390px에서 12/8의 12셀을 실제로 누른다. 가로 공연 화면에서 시간과 재생 버튼에 접근할 수 있다. | `e2e/classroom.spec.ts` |
| R12 | 공연 진입과 복귀 후 초점을 검사하고, 한국어 강세 이름과 타이머의 낭독 속성을 확인한다. | `e2e/classroom.spec.ts`, `e2e/journeys.spec.ts`, 실기 낭독 별도 |
| R13 | 잘못된 MIME·내용·캐시 손상에서 준비 완료가 되지 않고, 정상 복구 뒤 오프라인 첫 재생과 박 진행이 가능하다. | `scripts/verify-pwa.mjs` |
| R14 | 해시가 다른 두 세대의 번들·Worker를 같은 origin에서 배포한다. 한 탭이 갱신된 뒤 이전 탭도 다시 연주하고 갱신 버튼이 응답해야 한다. | `scripts/verify-pwa.mjs`, `src/tests/pwaStatus.test.tsx` |
| R15 | 기본 단위 검사에 기계식 컴포넌트 시험이 포함되고, 실제 일반·공연 화면에서 열기와 복귀가 가능하다. | `npx vitest list --filesOnly`, `src/components/MechanicalMetronome.test.tsx`, `e2e/classroom.spec.ts` |

## 미리보기 출시와 복구

1. 격리된 **같은 origin**에서 후보 빌드 이전 버전 A, 후보 B를 제공한다. `dist` 전체와 `pwa-precache.json`의 빌드 ID 및 커밋을 쌍으로 기록한다. A의 두 창에서 기존 v2를 준비하고, 그중 한 창에서 B를 적용한다. 다른 창의 연습 유지와 네트워크 차단 상태의 첫 재생, 동일 셋리스트 반복 항목의 선택 위치를 확인한다.
2. 빈 설치 → v2 이관 → 곡 저장·공연 탐색 → 다른 탭 BPM 변경 → 백업을 새 문맥에서 복원 → 두 탭 오프라인 갱신 순으로 점검한다. 저장 오류를 주입한 상태에서는 미저장 초안을 내려받을 수 있고 갱신 동작이 페이지를 강제 재시작하지 않아야 한다.
3. 데이터 소실, 거짓 저장 성공, 거짓 오프라인 준비, 오프라인 새 재생 실패, 잘못된 마디 전환 또는 필수 정지·복구 버튼의 잘림이 재현되면 후보를 보류한다. 최초 전환은 사용 중인 구형 탭에서 연습을 마친 뒤 메트로놈 탭을 모두 닫고 다시 연다.
4. 복귀용 빌드는 마지막 정상 UI와 현재 DB 읽기·v2 내보내기 및 현재 SW 세대 전환 프로토콜을 포함한다. 복구용 커밋으로 빌드를 생성하고 배포할 전체 산출물과 새 빌드 ID를 확인한다. 같은 시험 origin에서 B로 저장한 곡과 셋리스트가 복구판에도 보이는지, v2 백업을 다른 문맥에서 읽을 수 있는지 검증한 후 운영 후보로 사용한다. 단순 구형 JS 재배포나 사용자 저장소 일괄 삭제는 복구 절차에 포함되지 않는다.
5. 후보 설치 실패 시 마지막 정상 캐시로 연습을 유지한다. 이미 새 버전이 활성화된 경우 호환 복구판을 새 ID로 배포하고 복구판으로 오프라인 첫 재생을 검사한다. 오프라인 단말은 재접속 후 복구판을 받는다.

## 실기 점검 기록 방법

| 장비와 상태 | 확인할 결과 |
|---|---|
| iPhone Safari·홈 화면, Android Chrome·설치판 | 기종·OS·브라우저를 기록하고 비행기 모드 새 실행, 화면 잠금·복귀, 재개 1회, Android 진동을 확인한다. |
| 교실 프로젝터와 휴대전화 가로 | 1/4 무음 반복, 12개 셀의 끝까지 편집, 남은 시간·중단 안내·정지 버튼 가독성을 확인한다. |
| VoiceOver와 TalkBack | 공연 시작·복귀 후 초점과 실제 한국어 낭독, 매초 타이머를 읽는지, 중단 후 재개 안내를 기록한다. |
| 기기 스피커·유선·Bluetooth | 같은 템포·녹음 방식에서 박간 시간과 시작 조작→첫 출력 지연을 각각 기록한다. 기기·출력 경로·표본 수·범위를 함께 적는다. |

실기 점검은 미측정이다. Chromium의 모의 시계는 예약 논리를, OfflineAudioContext는 브라우저가 합성한 파형을 검사한다. 두 검사로 실물 스피커의 소리나 Bluetooth 지연을 판정할 수 없다.


## 이번 구현에서 실행한 자동 검사

- Node 24.22.3과 npm 11.19.1에서 잠금 파일로 의존성을 설치했다. Vitest는 22개 파일·203건이 통과했다. 타입 검사와 운영 빌드가 성공했으며 빌드 ID는 `53d6fb2b5929940a2dd4`다.
- 단일 작업자의 Chromium 153.0.8010.0에서 저장 실패 후 초안 다운로드·재시도, 미편집 Tab 이동, 실제 합성 파형, 2,261,076바이트와 4,194,305바이트 백업 왕복, 동작 줄이기 모드의 전체화면 플래시 차단을 다시 실행해 6건이 통과했다.
- 오프라인 전환 검사는 잘못된 MIME·내용 복구, 실제 IndexedDB 트랜잭션 실패, 해시가 다른 A/B, 기존 탭의 오프라인 첫 재생, 캐시 갱신, 구형 서비스 워커 전환을 다룬다. 실행 로그는 `npm run test:pwa`가 출력한 JSON에 기록한다.
