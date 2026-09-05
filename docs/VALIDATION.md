# Pulse 최종 구현·검증 기록

검증일은 2026-09-05이며 Windows, Node 24.14.0, npm 11.9.0, Chromium 153.0.8010.12 환경을 사용했다. 기존 앱을 유지하면서 첨부 설계의 필수 단계 00–10을 구현했다. 선택 단계 11, 외부 배포, 로그인·서버·새 서비스 연결은 수행하지 않았다.

**자동 검증으로 확인한 핵심 사용 흐름에는 남은 P0 차단 결함이 없다.** 최종 production 10분 실행은 일반 입력 조건에서 누락·중복 0으로 통과했다. 아래 표의 ‘부분 확인’은 실기까지 통과했다는 뜻이 아니다. 실제 iPhone/Android 동작, 스크린리더와 물리 음향은 별도 확인 대상이며 무간격 자동 입력 스트레스의 지연도 공개한다.

## 최종 실행 결과

| 검사 | 실제 결과 | 조건·근거 |
|---|---|---|
| `npm test` | **18파일 · 172개 통과** | 22:53 KST 최종 전체 실행. 순수 도메인, 가짜 오디오 시계, React 입력·저장·수명 테스트 |
| `npm run build` | **통과** | TypeScript 검사, Vite 번들, 버전별 서비스 워커 생성 |
| 브라우저 E2E | **23개 검증 통과** | 전체 21개 약 2.1분 + 이후 추가한 시트 드래그 2개 4.9초. 독립 Chromium context, 개발 origin `http://127.0.0.1:5173` |
| `npm run test:pwa` | **PASS** | 별도 production origin `http://127.0.0.1:4173`, [최종 PWA 보고서](../output/playwright/pwa-1788616391353/report.json) |
| `npm audit` | **취약점 0개** | 최종 의존성 검사. 초기 개발 의존성 경고 3개는 범위 내 패치 후 해소 |
| production 번들 | JS **302.98kB / gzip 92.33kB** | CSS gzip 4.33kB, scheduler Worker 0.32kB |

초기 기준선은 5파일·14개 테스트와 JS gzip 75.35kB였다. 현재 JS gzip은 16.98kB, 약 22.5% 증가했다. 중첩 데이터 검증·이관·복구, 취소 가능한 오디오 수명, 연습 planner, 대화상자·입력 처리, 프리셋 관리와 PWA 상태 처리가 추가되었다. React·Lucide 외 새 런타임 프레임워크나 상태관리 라이브러리는 넣지 않았다. 개별 기능별 바이트 크기는 별도로 분리 계측하지 않았다. [초기 기준선](BASELINE.md)

## 단계별 구현과 발견 ID

| 단계 | 구현한 변경 | 연결된 발견 ID·검증 |
|---|---|---|
| 00 실행 기반 | ZIP 원본 보존, `npm ci` 복구, Node 24 선언, 독립 개발·production 브라우저 검증 | 초기 14개 테스트·빌드, [BASELINE](BASELINE.md) |
| 01 데이터 | v2 단일 envelope, 모든 중첩 필드 검증, v1 이관·원본 보존, 복구 다운로드, 실패 시 메모리 유지, ErrorBoundary | F03·F22·F23 → T13·T14; storage·storageDebounce 단위 테스트와 storageRecovery E2E |
| 02 입력·화면 | BPM 외부 변경 동기화, 입력 확정·취소·보정, 단일 버튼 활성화, 명시적 공연 화면, 작은 화면 스크롤, 느린 탭 경계 | F01·F02·F07·F17·F30 → T01·T02·T16·T18 |
| 03 오디오 | starting/playing/중단 상태, 시작 요청 무효화, 미래 소리 취소와 8ms fade, 단일 볼륨 적용, 최신 콜백·dispose, 지연 복구 | F04–F10 → T03–T05·T22; 실제 OfflineAudioContext 포함 |
| 04 음악 모델 | BPM 기준 음표와 셀·분할 분리, 그룹 선택, v1 /8 속도 보존, 셀 전체 쉼, 다음 마디 원자 적용 | F13·F14 → T06–T08; audioRhythm·rhythm·migration 검증 |
| 05 연습 | 오디오 시계 기반 planner, 카운트인 제외 타이머, 목표 구간을 연주한 뒤 stop/hold/loop, 박·마디 랜덤, 묵음 시 표시 정책 | F11–F16·F28 → T08–T12·T19; planner·enginePractice·journeys |
| 06 접근성 | 공통 native dialog, 초점 이동·가두기·복귀, Esc, 핸들 전용 드래그, 확대 허용, 이름·선택 상태, 플래시 제한 | F17–F20·F28·F31 → T16–T19; axe와 키보드 검증, 실기 한계 별도 표시 |
| 07 프리셋·목록 | ID와 항목 위치의 단일 탐색, 이름·복제·업데이트·검색, 반복 항목·정렬, 여러 목록, 백업 미리보기·병합·교체 | F21·F22·F31 → T13·T15; navigation·presets·storageRecovery E2E |
| 08 PWA·복귀 | 빌드 자산 전체 precache, 준비 상태, 명시적 업데이트, 소유 캐시·scope만 정리, 설치 흐름, Wake Lock 재획득 | F10·F24–F27 → T20–T22; production PWA 보고서·Wake Lock 모의 API |
| 09 계측 | 이벤트·자원·Worker·UI 비용 구분, 비트 DOM 재생성 제거, 5개 컴포넌트 memo, 설정 쓰기 180ms 합치기 | F29 → 전후 계측; T23 최종 600초 누락·중복 0 |
| 10 사용자 여정 | A/B/C/E/F의 연결 흐름, 오류·복구, 확대·키보드, 오프라인 업데이트, 실행·복구 문서 | E2E 21개와 별도 production PWA. D/G/H의 실기 경계는 미검증 표시 |

설정의 의미·오디오 적용 시점은 [README](../README.md)와 [AUDIO-PLAN](AUDIO-PLAN.md), PWA의 캐시·갱신 규칙은 [PWA](PWA.md)를 참고한다.

### 발견 F01–F31의 회귀 연결

| 발견 ID | 수정한 사용자 문제 | 수용 기준·검증 파일 |
|---|---|---|
| F01 | 외부 BPM 변경 후 큰 입력 숫자 불일치 | T01·T02; `input.test.tsx`, `app.spec.ts`, `journeys.spec.ts` |
| F02·F07 | PC 조작 소실·320px 겹침 | T18; `app.spec.ts`, `journeys.spec.ts` |
| F03 | 불완전 프리셋 가져오기로 빈 화면 | T13; `storage.test.ts`, `storageRecovery.spec.ts` |
| F04 | 정지 뒤 늦은 unlock으로 재생 부활 | T03; `engine.test.ts` |
| F05 | 정지 뒤 미래 클릭 잔존 | T04; `engine.test.ts`, `audio.spec.ts` |
| F06 | 긴 지연 뒤 과거 클릭 몰림 | T05; `scheduler.test.ts`, `engine.test.ts`, `engineManualTempo.test.ts` |
| F08 | 볼륨 두 번 곱하기 | T04; `engine.test.ts`, 실제 OfflineAudioContext `audio.spec.ts` |
| F09 | 생성 당시 고정된 햅틱·이벤트 콜백 | T03·T22; `engine.test.ts`의 최신 콜백·dispose 검증 |
| F10 | unmount·Worker·AudioContext 오류 수명 누락 | T03·T22; `engine.test.ts` |
| F11 | rAF 뒤에 결정되어 늦는 speed 예약 | T09·T12; `planner.test.ts`, `enginePractice.test.ts` |
| F12 | 감속과 목표 BPM 구간 생략 | T09; `planner.test.ts`, `enginePractice.test.ts` |
| F13 | 박 쉼·랜덤 100%인데 분할 소리 잔존 | T08; `audioRhythm.test.ts`, `planner.test.ts` |
| F14 | 박자 분모·BPM 단위 불일치 | T06·T07; `rhythm.test.ts`, `audioRhythm.test.ts`, `storage.test.ts` |
| F15 | keepVisual·랜덤 단위 설정 누락 | T11; `planner.test.ts`, `feedback.test.tsx`, `journeys.spec.ts` |
| F16 | 준비·카운트인을 포함하는 타이머와 부족한 표시 | T10; `enginePractice.test.ts`, `journeys.spec.ts` |
| F17 | ± 키보드 무반응·Space 기본 동작 가로채기 | T16; `input.test.tsx`, `app.spec.ts` |
| F18 | 도움말 Esc·모달 초점 이동/복귀 누락 | T17; `app.spec.ts`, `presets.spec.ts` |
| F19 | 확대 금지·h1 부재 | T16·T18; axe를 포함한 `app.spec.ts`, `journeys.spec.ts` |
| F20 | 시트 내부 스크롤과 드래그 닫기 충돌 | T17·T18; `sheet-drag.spec.ts` 실제 mouse/capture + 취소 이벤트 주입, `presets.spec.ts` 긴 시트 스크롤·닫기 |
| F21 | 첫 목록·BPM으로 추정하는 서로 다른 탐색 | T15; `navigation.test.ts`, `presets.spec.ts` |
| F22 | settings 미복원·교체만 가능한 가져오기·복사 실패 | T13·T15; `storage.test.ts`, `presets.spec.ts`, `storageRecovery.spec.ts` |
| F23 | 저장 실패 숨김·fallback 원본 덮어쓰기 | T13·T14; `storage.test.ts`, `storageDebounce.test.tsx`, `storageRecovery.spec.ts` |
| F24 | 의미 없는 설치 배너 | T20·T21; `PwaStatus.tsx` 상태별 표시 및 PWA 자동 검증. 실제 설치 화면은 실기 미검증 |
| F25 | 첫 방문 JS/CSS/Worker precache 누락·고정 HTML | T20·T21; 최종 production PWA의 자산 11개·첫 재생·두 버전 전환 |
| F26 | 모든 GET에 HTML fallback·다른 캐시/SW 삭제 | T20·T21; 최종 production PWA의 자산/API 응답·다른 scope 보존 |
| F27 | Wake Lock 해제·복귀 재요청 누락 | T22; `wakeLock.test.tsx`; 실제 OS 동작은 미검증 |
| F28 | 정지 후 박·플래시 잔존·과도한 점멸 | T11·T19; `feedback.test.tsx`, `audio.spec.ts`, `journeys.spec.ts` |
| F29 | 매 분할 DOM 재생성·렌더·동기 저장 비용 | T23·아래 전후 계측. 개선 수치와 10분 최종 판정을 분리 |
| F30 | 30 BPM 탭 간격 reset 경계 | T01·T02; `tapTempo.test.ts` |
| F31 | 현재 프리셋·변경 상태·훈련 정보 누락 | T01·T10·T15; `navigation.test.ts`, `presets.spec.ts`, `journeys.spec.ts` |

파일명은 단위 테스트의 경우 `src/tests`, E2E는 `e2e` 폴더 기준이다. 화면 상태 구현 확인과 자동 실행, 실기 미검증을 같은 수준의 증거로 취급하지 않는다.

## 수용 기준 T01–T23

‘자동 범위 통과’는 명시된 테스트 계층에서 통과했다는 뜻이다. 가짜 clock의 예약 timestamp, OfflineAudioContext 렌더 결과, 화면 관찰과 물리 출력은 서로 다른 결과로 구분한다.

| ID | 판정 | 확인한 결과·재현 파일 | 남은 범위 |
|---|---|---|---|
| T01 표시·저장·실행 BPM | 자동 범위 통과 | input·tapTempo·engineManualTempo 단위 테스트, app·presets·journeys E2E. ±·슬라이더·입력·탭·프리셋과 speed 실행 표시 확인 | 실제 장치 출력 템포는 별도 측정 |
| T02 잘못된 입력·취소 | 자동 범위 통과 | 빈칸·999·20·Escape·드래그 취소는 마지막 유효값 또는 30–300 보정 정책 적용 | — |
| T03 비동기 시작 경쟁 | 자동 범위 통과 | `engine.test.ts`: resume 대기 중 stop, start-stop-start, stale Worker, 50회 반복에서 마지막 유효 세션만 유지 | 실제 OS 오디오 권한 UX |
| T04 정지·미래 소리 취소 | 자동 범위 통과 | 엔진 source 취소·fade·자원 정리와 `audio.spec.ts`의 실제 OfflineAudioContext에서 미래 소리 0, fade 이후 tail 0 | 스피커·Bluetooth 경로 |
| T05 지연 복구 | 자동 범위 통과 | 200ms는 지난 위치만 건너뜀; 2초·30초는 중단. 과거 시각 클릭 몰림 없음 | OS별 백그라운드 제한 |
| T06 음표 기준과 마디 길이 | 자동 범위 통과 | 4/4 quarter120=2초, 6/8 dotted-quarter60=2초, eighth120=3초, quarter120=1.5초. 수식·예약·UI 설명 확인 | — |
| T07 v1 /8 호환 | 자동 범위 통과 | migration fixture에서 eighth로 이관, 기존 6/8 BPM120의 마디 3초·악센트·순서 유지 | /16은 명시적 거절 정책 |
| T08 셀 전체 쉼 | 자동 범위 통과 | planner·audioRhythm에서 악센트 쉼 및 random beat 100%의 네 분할 모두 묵음 | — |
| T09 speed 목표 구간 | 자동 범위 통과 | `[80,80,82,82,84,84]` 이후 stop/hold/loop, 감속·start=target·step 초과. 수동 BPM은 speed 해제 | — |
| T10 카운트인·60초 종료 | 자동 범위 통과 | 2마디 카운트인과 deadline은 엔진 단위 테스트. 실제 브라우저는 **1마디** 카운트인 뒤 본 연습 60초 실행, 종료 후 이벤트·타이머·자원 정리 | 2마디+60초 실시간 브라우저 조합은 별도 실행하지 않음 |
| T11 gap·keepVisual | 자동 범위 통과 | 본 연습 `[소리,소리,소리,묵음]` 반복, keepVisual=false에서 훈련 묵음의 이벤트 표시·플래시·햅틱 경로 차단 | 물리 진동 지원·세기 |
| T12 rAF 독립성 | 자동 범위 통과 | `enginePractice.test.ts`: rAF를 중단해도 speed/gap/random/타이머 예약 계획과 종료 동일 | — |
| T13 손상·부분·미래 버전 JSON | 자동 범위 통과 | `storageRecovery.spec.ts`: 실제 R2는 `presets[0].timeSignature` 표시, JSON 문법·미래 버전 거절, 원본 전체 유지, 정상 복원 성공 | — |
| T14 저장 실패 | 자동 범위 통과 | quota/security 실패 시 오류·메모리·백업 유지, fallback 자동 덮어쓰기 금지. 실제 브라우저 쓰기 거절 주입 포함 | 기기별 저장소 제거·용량 정책 |
| T15 동일 BPM·반복 곡 탐색 | 자동 범위 통과 | 같은 BPM A/B/C의 모바일 B→공연 다음 C→이전 B. 반복 A의 item ID, 삭제·재정렬·목록 전환·재접속 확인 | — |
| T16 키보드·보조기술 | 부분 확인 | 버튼 Enter/Space, 전역 단축키 충돌 방지, 키보드 조작 및 axe 검사 통과 | 실제 NVDA·VoiceOver·TalkBack 낭독 미검증 |
| T17 대화상자 초점 | 자동 범위 통과 | 도움말·저장 패널 진입, Tab 초점 유지, Escape 닫기와 트리거 복귀. native dialog 사용 | 실제 스크린리더 탐색은 T16에 남김 |
| T18 작은 화면·200% 확대 | 부분 확인 | 320×568~1440×900 조작·가로 넘침 검사, 320px의 글자 200%, Chromium visualViewport.scale=2 확인 | 데스크톱 브라우저 메뉴 200% 확대·실제 터치 pinch 미검증 |
| T19 플래시·정지 표시 | 자동 범위 통과 | 최대 초당 2회 정책 단위 테스트, 300 BPM/4분할 reduced-motion에서 flash-on 없음, stop 후 currentEvent null | 점멸 면적·휘도 측정 및 접근성 인증은 수행하지 않음 |
| T20 오프라인 첫 재생 | 부분 확인 | production 첫 온라인 준비 후 HTTP 캐시 비활성화, 서버 연결 차단·브라우저 offline, 새로고침·첫 재생 통과. 첫 재생 전 Worker 캐시 포함 | 실제 회선 차단·설치한 iPhone/Android 앱 종료 후 냉시작·비행기 모드 미검증 |
| T21 두 버전 갱신 | 자동 범위 통과 | production A/B build에서 재생 중 waiting 유지, 명시 적용, 데이터 보존, 다른 앱·scope 캐시 보존 | 실제 모바일 설치 앱의 업데이트 화면 |
| T22 중단·복귀·Wake Lock | 부분 확인 | Worker/context 오류 정리·재시도, visible 전환·release·거절·stale 요청 해제 모의 API 통과 | 화면 잠금·기기 오디오 중단·홈 화면 복귀·실제 Wake Lock 미검증 |
| T23 10분 최대 부하 | **자동 범위 통과** | 최종 production 600초: 예약 12,001, 건너뜀·중복 0, 최대 큐 3, 정지 후 큐·source 0. 50회 시작/정지는 엔진 검증 | 키 입력 최소 33ms 조건. 무간격 자동 연타 스트레스에서는 실제 건너뜀을 별도 관찰; 물리 출력 측정 아님 |

## 실제 사용자 여정 증거

- **A — 본 연습 60초:** [최신 journey-a.json](../output/playwright/journeys/journey-a.json)은 실제 경과 **62,469ms**, 본 연습 시작 **2.0706666667초**, 종료 deadline **62.0706666667초**를 기록한다. 90 BPM·3/4·2분할·카운트인 1마디 뒤 본 연습이 정확히 60초다. 예약 186개, 건너뜀·중복 0, 정지 후 큐·활성 source 0이었다. 최신 실행값이므로 [JOURNEYS](JOURNEYS.md)의 앞선 개별 실행 시간과 다를 수 있다.
- **B — 레슨·공연 전환:** `e2e/presets.spec.ts`에서 같은 BPM 곡 선택, 공연 화면 탐색, 현재 항목 업데이트와 새로고침 후 보존을 확인했다. 별도 사례는 이름 변경·복제·검색·반복 곡·순서 이동·목록 삭제를 포함한다.
- **C — 복합 훈련:** [journey-c.json](../output/playwright/journeys/journey-c.json)에서 6/8 점4분=60, gap3:1, beat random30%, speed 증가의 실제 이벤트와 UI를 비교했다. 목표 BPM64 표시와 gap 구간의 isAudible=false를 확인했다. 짧은 표본으로 확률 분포의 통계적 정확성을 주장하지 않는다.
- **E/F — 백업·손상 복구:** 실제 파일 다운로드 후 독립 Chromium context에서 교체해 envelope 전체가 동등함을 확인했다. 손상 v2 원본 다운로드는 원본 문자열 그대로였으며, 복원 후 `pulse:recovery:v2`에도 같은 문자열이 남았다. 실패 가져오기는 기존 저장 문자열과 동작을 유지했다.
- **G — 오프라인·갱신:** 아래 production PWA 결과가 담당한다. 물리 기기 냉시작은 포함하지 않는다.
- **H — 접근성:** 메인·모달 및 다크·라이트 설정·리듬 화면의 axe 결과는 위반 0이었다. 키보드와 자동 확대 검증은 실제 스크린리더·물리 확대와 구분했다. [확대 증거](../output/playwright/journeys/zoom.json), [320px 셋리스트 화면](../output/playwright/stage07-setlist-320x568.png)

## 최종 production PWA 결과

[pwa-1788616391353/report.json](../output/playwright/pwa-1788616391353/report.json)의 결과는 **PASS**다. 이전 PWA 문서의 개별 실행보다 이 보고서가 최신이다.

| 확인 항목 | 실제 결과 |
|---|---|
| origin·브라우저 | `http://127.0.0.1:4173`, Chromium 153.0.8010.12, HTTP cache 비활성화 |
| 첫 재생 전 캐시 | HTML·JS·CSS·scheduler Worker·manifest·SVG/PNG 아이콘 **11개** |
| 오프라인 | 서버가 socket 연결을 끊는 상태와 Chromium offline을 함께 적용. 별도 Node 연결 실패 확인 후 새로고침·첫 재생 통과 |
| 없는 자산 응답 | offline JS는 **503 text/plain**. online의 없는 JS·CSS·Worker·`/api`·`/api/missing`은 **404 text/plain**, HTML 아님 |
| 버전 전환 | A `56a630db0727b0d4ccd7` → B `91934e5a0c937a698488` |
| 연습 중 갱신 | 기존 controller 유지·waiting 확인 후 사용자 명시 적용. 자동 재생 중단 없음 |
| 데이터·소유 범위 | 적용 후 저장 데이터 유지. `unrelated-app-cache`, 다른 `/other/` scope의 Pulse 캐시·SW 등록 유지 |
| 페이지 오류 | **0개** |

A/B는 production 사본 중 B의 검증 메타데이터를 바꿔 새 build를 만드는 테스트다. 앱 데이터·SW 생명주기·버전 자산 일관성을 실제로 확인했으며 다른 기능을 가진 모바일 배포 버전을 현장에서 설치한 결과로 해석하지 않는다. 보고서·스크린샷·A/B 사본은 증거로 보존하고 테스트 서버·브라우저는 종료한다.

## 성능 계측과 개선 범위

음악 이벤트 계획 시각과 실제 예약 당시 AudioContext 시각, Worker tick 간격, rAF 표시, React 렌더 비용, localStorage 비용을 분리했다. 개발 도구 계측은 로컬에서만 유지한다. 물리 출력 지터·Bluetooth 지연·배터리 소비는 측정하지 않았다.

[OfflineAudioContext 실제 렌더](../output/playwright/offline-audio.json)는 동일 클릭에서 volume 1의 peak **0.88729578**, volume 0.5의 peak **0.44364789**로 진폭비 **0.5**를 확인했다. volume 0·mute·미래 음원 취소 출력은 정확히 0이며, 활성 클릭 정지 fade 뒤 tail도 0이다. 이는 브라우저 합성 결과이며 물리 출력 측정이 아니다.

| 변경·조건 | 개선 전 | 개선 후 | 해석 |
|---|---:|---:|---|
| 300 BPM/4분할 10초의 비트 시각화 추가 DOM 노드 | 198개 | 0개 | pulse key에 의한 재생성을 제거. 두 실행 모두 건너뜀·중복 0, 최대 큐 3 |
| 60단계 BPM 슬라이더의 localStorage 쓰기 | 59회 | 1회 | 설정만 180ms 합치고 확정·pointerup·정지·pagehide에 flush |
| 같은 슬라이더에서 기록한 문자열 길이 합 | 43,586자 | 739자 | 계측 JSON의 `bytes`는 `string.length`이므로 실제 UTF-8 바이트가 아닌 문자열 길이 |
| 같은 슬라이더의 setItem 호출 시간 합 | 약 2.7ms | 0ms로 기록 | 브라우저 시계 해상도에서 0으로 관찰된 값이며 저장 비용이 완전히 없다는 뜻이 아님 |
| 슬라이더 최종 입력·저장 BPM | 300 / 300 | 300 / 300 | 마지막 변경 보존 |

근거: [performance-before](../output/playwright/performance-before.json), [performance-after](../output/playwright/performance-after.json), [storage-before](../output/playwright/storage-before.json), [storage-after](../output/playwright/storage-after.json). 짧은 실행 간 총 예약 수 차이는 측정 종료 시각과 예약 창 차이를 포함하므로 그 자체를 누락으로 계산하지 않는다.

[React Profiler 별도 10초 실행](../output/playwright/performance-profiler.json)은 236 commits, actualDuration 합 약 2,908.2ms, 최대 commit 약 29.7ms를 기록했다. 이후 자주 쓰는 표시·조작 컴포넌트 5개의 memo 적용을 [같은 10초 조건](../output/playwright/performance-profiler-after-memo.json)에서 측정했으며 241 commits, actualDuration 합 약 **1,725.3ms**, 최대 commit 약 **25.2ms**였다. actualDuration 합이 약 **40.7% 감소**했으나 commit 수는 줄지 않았다. 두 실행의 시각화 추가 DOM 노드는 모두 0이다.

Profiler 실행의 건너뜀은 전 3개·후 2개이며 최대 Worker tick 간격은 각각 0.2초·약 0.178667초였다. 입력 자동화·개발 환경·도구 오버헤드의 영향을 완전히 분리하는 통제 실험이 아니므로 이 수치만으로 모든 장치가 빨라졌거나 오디오 누락이 해결됐다고 주장하지 않는다. Long Tasks 역시 실행 조건별 관찰값이며 일반적인 개선 보장으로 사용하지 않는다.

### T23 장시간 실행 — 정상 조건 통과와 스트레스 결과

**최종 통과:** [최종 production 10분 보고서](../output/playwright/performance-final-ten-minutes.json)는 300 BPM·4분할, timer 650초, 초기 speed 300→300 hold 상태에서 시작했다. 재생 중 연습 시트를 열어 gap·random을 켜고 비율을 30%로 조절한 뒤, 시트를 닫고 BPM 300→299→300으로 수동 전환했다. 키 입력 30개 사이에 최소 33ms를 뒀으며 각 조작의 시작·끝 시각과 누락 카운터도 기록했다. Chrome 153.0.8010.12, headless foreground, production 최적화 diagnostics 빌드 `b477fd8e546aa45255c5`, 별도 origin `http://127.0.0.1:5186` 조건이다.

정지 직전 예약 **12,001개**, 건너뜀 **0**, 중복 **0**, 최대 visual queue **3**, 최대 Worker tick 간격 **69.33ms**였다. 마지막 예정 시각은 600.060167초이며 100ms 미래 예약 창을 포함한다. 정지 명령 처리까지 한 개가 더 예약돼 afterStop 총수는 12,002개이고, **정지 후 큐 0·활성 source 0**을 확인했다. 실행 오류와 추가 비트 DOM 노드는 0이며 localStorage 쓰기는 5회였다. 이 결과로 T23의 정상 전경 자동 검증 범위를 통과했다. 앞선 스트레스 실행 결과는 아래에 그대로 보존한다.

[DEV 10분 보고서](../output/playwright/performance-ten-minutes.json)는 독립 `http://127.0.0.1:5184`, headless Chromium, foreground 조건에서 수집했다. 300 BPM·4분할로 타이머·speed를 설정하고 실행 중 갭·랜덤·시트 열기·BPM 조절을 수행했다. 마지막 정지 명령 직전 예약 11,997개, 건너뜀 3개, 중복 0개, 최대 큐 3, 최대 Worker tick 간격 약 0.250667초였다. 정지 후 큐·활성 source는 모두 0이었다. 정지 명령 처리까지의 추가 예약으로 afterStop 총 예약 값은 11,999개다.

초기 [production 10분 실행](../output/playwright/performance-production-ten-minutes.json)도 정지 직전 예약 11,998개·건너뜀 3개·중복 0개·최대 큐 3을 기록했고, 정지 후 큐·활성 source는 0이었다. 두 장시간 실행 모두 자동화가 랜덤 비율 입력을 위해 키 30개를 의도적인 대기 없이 연속 전송한 구간을 포함한다.

추가 진단에서 그 연속 입력 동안 Worker 메시지 처리가 지연되는 현상을 확인했다. [별도 입력 스트레스 진단](../output/playwright/skip-audit-5185.json)에서는 실제 건너뜀 4개가 관찰됐고 이후 구간에는 추가 건너뜀이 없었다. AudioContext가 running이고 Long Task가 없더라도 짧은 입력 작업이 연속되면 Worker 메시지 처리가 밀릴 수 있으므로 Long Task 0만으로 오디오 정상 여부를 판정하지 않는다. 이 스트레스 결과를 일반 입력 속도의 결과와 합쳐 보고하지 않는다.

별도로 10초 profiler 기록에서 `3.5599999999999956 < 3.56` 등 부동소수점 경계의 건너뜀 오판 두 개를 직접 확인해 1e-9초 허용 오차와 두 회귀 검증을 추가했다. 과거 장시간 실행은 최근 512개 기록만 남으므로 그 3개 모두의 원인이 같다고 단정하지 않는다. 16/25/33ms 간격을 준 별도 짧은 대조 실험은 각각 누락 0이었다. 근거: [16ms](../output/playwright/skip-audit-5185-pace16.json), [25ms](../output/playwright/skip-audit-5185-pace25.json), [33ms](../output/playwright/skip-audit-5185-pace33.json).

무간격 자동 입력의 결과를 누락 0으로 바꾸거나 최종 일반 입력 결과에 합산하지 않는다. 긴 실행의 큐·자원 상한과 일반 입력의 정확도, 극단적 지연의 복구는 구분해 해석한다. 가짜 clock의 BPM 30/60/120/240/300 × 1/2/3/4분할 **20조합**도 별도로 정확한 간격, 미래 예약, 누락·중복 0, 큐·활성 자원 상한을 통과했다.

## 재현 명령

이 README가 있는 소스 폴더에서 실행한다. 사용자 브라우저·저장소 대신 별도 Chromium context와 테스트 데이터만 사용한다.

```powershell
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:pwa
npm audit
```

오류 복구·프리셋·실제 타이머를 좁혀 재현하려면 다음을 사용한다. 실제 1분 타이머는 시간을 가속하지 않으며 약 62초가 필요하다.

```powershell
npx playwright test e2e/storageRecovery.spec.ts --reporter=line
npx playwright test e2e/presets.spec.ts --reporter=line
npx playwright test e2e/audio.spec.ts --reporter=line
npx playwright test e2e/journeys.spec.ts --grep "journey A" --reporter=line
npm test -- src/tests/engineManualTempo.test.ts src/tests/audioMatrix.test.ts
npm test -- src/tests/storage.test.ts src/tests/storageDebounce.test.tsx
```

짧은 계측은 별도로 실행 중인 개발 서버를 사용한다. 짧은 결과를 10분 결과로 취급하지 않는다. production 계측은 `vite build --mode diagnostics`로 만든 격리 계측 빌드와 별도 서버를 사용하며 일반 배포 빌드에 진단 API를 노출하지 않는다.

```powershell
node scripts/measure-storage.mjs storage-check
node scripts/measure.mjs 10 5173 performance-check
```

최종 장시간 계측은 다음 빌드를 먼저 준비하고 preview를 실행한 터미널과 별도 터미널에서 `node scripts/measure.mjs 600 5186 performance-final-ten-minutes`를 실행한다. 기본 키 입력 간격은 최소 33ms이며, 마지막 인자 `--input-burst`를 주면 대기 없는 스트레스 입력으로 별도 기록한다.

```powershell
npx vite build --mode diagnostics --outDir output/performance-final
node scripts/build-sw.mjs output/performance-final
npx vite preview --outDir output/performance-final --host 127.0.0.1 --port 5186 --strictPort
```

## 남은 검증·출시 판단·복구

| 우선순위 | 남은 항목·영향 | 다음 검증 또는 현재 대안 |
|---|---|---|
| P0 | 실행한 핵심 A/B/E/F 흐름에서 남은 차단 결함 없음 | 사용자 설정은 백업 가능. 미검증 기기 전체에 같은 결과를 보장하지 않음 |
| P2 | 대기 없는 자동 키 30개 입력의 Worker 전달 지연으로 클릭 4개 건너뜀 | 일반 33ms 입력 10분은 누락 0. 100ms 예약 창을 넘긴 지연은 과거 클릭을 몰아서 재생하지 않고 미래 박을 이어가는 정책 유지 |
| P1 | iPhone Safari·Android Chrome 설치·비행기 모드·화면 잠금·오디오 중단·Wake Lock | [PWA 실기 절차](PWA.md)로 기기/OS/브라우저/출력 경로를 기록하며 검증. 중단 시 화면 안내 후 새 세션 재개 |
| P1 | NVDA·VoiceOver·TalkBack 실제 낭독, 브라우저 메뉴 확대·물리 pinch | 실제 보조기술과 기기에서 T16/T18 확인. 자동 axe와 CDP 확대를 그 결과로 대체하지 않음 |
| P2 | 유선·스피커·Bluetooth 물리 출력 지터·지연·배터리 | loopback 녹음 등 별도 측정법과 장비 조건을 설계. timestamp나 rAF 로그로 출력 정밀도를 주장하지 않음 |

복구 시 먼저 현재 v2 백업과 손상 원본을 내려받는다. 정상 백업을 검증한 뒤 병합 또는 교체하면 되며, 실패한 가져오기는 기존 데이터를 유지한다. 소스 롤백은 수정하지 않은 상위 `메트로놈 웹앱.zip`을 **새 폴더**에 풀어 수행한다. 이전 앱은 v2 저장소를 읽지 않으므로 원본 v1 키를 유지하고 별도 origin에서 비교한다. 테스트 증거와 원본 ZIP은 보존하며 사용자 파일·실사용 프리셋을 초기화하지 않는다.

장시간 계측용 5184/5185/5186 서버와 독립 테스트 브라우저는 종료했다. 소스 개발 서버 5173과 사용자 확인용 production preview 4173은 실행해 두었다. 완성본 ZIP에는 소스·잠금 파일·dist·문서·주요 JSON/화면 증거가 들어가며 node_modules와 임시 production 사본은 제외한다. 기존 원본 ZIP은 유지한다.
