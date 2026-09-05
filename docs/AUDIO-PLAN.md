# Pulse 오디오 구현 계약

첨부 설계의 단계 03–05를 구현한 오디오 계약과 회귀 검증 기록이다. 최종 통합 결과와 실기 검증 범위는 [검증 보고서](VALIDATION.md)에 정리한다.

## 단계 03: 수명과 취소

- `TransportState = idle | starting | playing | stopping | interrupted | error`. 엔진이 단일 상태 원본이며 Hook은 구독 결과를 표시한다.
- `start()`는 사용자 gesture에서 AudioContext 생성/resume을 즉시 호출한 뒤 Worker 준비 응답까지 기다린다. 준비와 resume이 모두 끝나야 playing이다.
- 각 요청에 generation 번호. stop/dispose와 새 start는 이전 generation을 무효화한다. 대기 중 Promise나 Worker 응답은 번호가 다르면 아무런 상태 변경도 하지 않는다.
- session마다 새 출력 Gain을 만든다. stop은 출력에 8ms 선형 fade를 예약하고 미래 source를 취소한다. 이미 재생 중인 source는 fade 끝에서 정지한다. 이전 Gain은 다시 올리지 않는다.
- `scheduleClick`은 source의 시간과 취소/정리 함수를 가진 핸들을 반환한다. ended 시 모든 노드를 disconnect하고 소유 Set에서 핸들을 제거한다.
- envelope에는 상대 악센트 진폭만 적용한다. 사용자 volume은 별도 master Gain 한 곳에만 적용하고 session Gain은 정지와 타이머 fade를 담당한다. volume=0와 mute는 정확한 Gain 0이다.
- `dispose()`는 세션, Worker, rAF, statechange listener, AudioContext를 정리한다. Hook effect에서 엔진을 생성하고 cleanup에서 dispose하여 StrictMode 재마운트도 새 인스턴스를 갖게 한다.
- 주입 경계는 AudioContext 생성기, Worker 생성기, request/cancelAnimationFrame, watchdog set/clearTimeout, RNG. 사적인 scheduler를 테스트용 public으로 열지 않는다.
- Worker 메시지는 sessionId와 ready/tick를 포함한다. Worker 준비 제한 시간은 2초. 오류는 engine error로 전환하고 정지와 같은 음원 정리를 한다.
- scheduler는 audio currentTime을 단일 음악 시계로 사용한다. 25ms 깨우기, 100ms 예약 창. audio time보다 지난 이벤트는 클릭을 만들지 않고 위치만 전진한다. 늦은 간격이 0.5초를 초과하면 interrupted로 전환한다. 200ms 수준 지연은 지난 이벤트를 건너뛰고 유효한 미래 위치를 계속한다. 2초/30초 지연은 중단 상태로 재개 gesture를 기다린다.
- visual queue는 최대 256개. rAF는 지난 이벤트 중 가장 최신 하나만 내보내며 모든 과거 박 애니메이션을 재생하지 않는다. 음악 진행과 종료는 rAF와 독립적이다.

## 단계 04: 음악 시간

- `secondsPerQuarter = 60 / bpm / quarterNotesPerTempoUnit`, 단위 환산값 quarter=1, eighth=0.5, dotted-quarter=1.5.
- 셀 길이는 `secondsPerQuarter * 4 / noteValue`; 마디 길이는 셀 길이 × beats; 분할 길이는 셀 길이 ÷ 분할 수.
- 사용자 설정은 tempoUnit과 beatGroups를 필수로 가진다. 기존 subdivision enum은 분할 수 1/2/3/4로 해석하며 라벨을 새로 표시한다.
- 박자/tempoUnit/그룹/분할/악센트 및 프리셋은 다음 마디에 하나의 snapshot으로 적용한다. 이미 예약된 이벤트의 snapshot은 변하지 않는다.
- BPM 수동 조절은 다음 미예약 이벤트 간격부터 적용한다. speed를 함께 해제한다. 볼륨과 global mute는 출력 Gain에 즉시 반영한다.
- BeatEvent는 실행에 실제 사용한 bpm, tempoUnit, timeSignature, subdivision, beatGroups, accents를 소유한다. 화면은 선택된 설정과 실제 이벤트가 다를 때 적용 대기를 설명한다.
- 쉼 악센트는 셀의 모든 분할을 지운다. 그룹 표시 변경만으로 수동 악센트를 덮지 않는다.

## 단계 05: 순수 연습 planner

- 저장된 PracticeSettings와 실행 중 PracticeSessionState를 분리한다. 실행 상태는 phase, count-in 잔여 셀, main barIndex, bpm, tempo 구간 경과 마디, target 구간 여부, mainStartedAt, timerDeadline, 마디/셀 random 결정을 가진다.
- 다음 이벤트 계획 전에 마디 경계의 pending snapshot, speed, gap, random 정책을 확정한다. rAF onBeat는 관찰자이며 저장 설정을 매 박 수정하지 않는다.
- timer는 최초 main 이벤트 audio time부터 센다. deadline 이상의 이벤트는 생성하지 않으며 session Gain을 deadline 직전부터 최대 8ms fade하여 deadline에서 정확히 0이 되게 예약하고 scheduler에서 종료한다. 표시 타이머만으로 소리를 멈추지 않는다. count-in 화면에는 전체 남은 시간이 유지된다.
- background/main-thread 차단이 0.5초를 초과하면 중단한다. 재개는 새 세션이고 count-in과 timer를 다시 시작한다. 멈춘 시간을 보상하여 과거 클릭을 몰아내지 않는다.
- 80→84, step2/everyBars2는 `[80,80,82,82,84,84]` 이후 stop/hold/loop를 실행한다. 하강은 부호만 반대로 적용한다. start=target도 목표 구간 하나를 완주한다. hold는 상태를 한 번만 전환한다.
- random은 주입 RNG로 셀 또는 마디 경계에서 한 번 결정하고 모든 하위 분할에 재사용한다. 확률 0/1은 RNG 호출 없이 확정 가능하다.
- BeatEvent에는 globalMute, accentRest, gapMute, randomMute를 구분하고 showVisual을 계산한다. keepVisual=false의 훈련 묵음은 도트/카운트/flash/haptic 단서를 숨긴다. global mute는 시각 박을 유지한다.
- count-in/timer 변경은 다음 start 적용. gap/random/speed 구성 변경은 다음 main 마디. speed 중 수동 BPM은 speed 해제와 BPM 변경을 함께 적용한다.

## 회귀 검증

가짜 AudioContext clock + Worker/RAF harness로 pending resume→stop, stale worker, 50회 start/stop, duplicate start, resume/worker 오류, dispose, 100ms ahead 취소, 200ms/2s/30s 지연을 검증한다. 실제 브라우저 OfflineAudioContext로 volume 0/0.5/1의 peak/RMS 비율과 stop 후 출력을 확인한다. 물리 스피커와 모바일 background 지연은 실측 전 보장하지 않는다.

순수 함수 검증은 4/4 quarter120=2s, 6/8 dotted-quarter60=2s, 6/8 eighth120=3s, 6/8 quarter120=1.5s; 4/4→3/4와 12/8→4/4 원자 경계; 4분할→없음 strictly increasing time; count-in 2마디 후 main0; speed 전 조합; gap3:1; seeded beat/bar random+분할+gap 조합을 포함한다.


## 구현 완료와 검증 기록 (2026-09-05)

단계 03/04/05를 순서대로 구현했다. 음악 planner는 `domain/planner.ts`의 `createPracticeSession`과 `planNextEvent`이며 clock, React, rAF를 읽지 않는다. 엔진은 planner 결과를 오디오 시간에 예약하고 rAF는 최신 과거 이벤트 하나만 표시한다.

- 단계 03: fake-clock 수명/취소/오류/지연/상대 Gain/10분 가상 실행 11개 통과.
- 단계 04: 기존 수명 검증 포함 22개 통과. 네 음악 시간 예시의 실제 예약 마디 길이, 박자/분할 원자 전환과 인덱스 범위를 확인했다.
- 단계 05: planner와 통합 37개 통과. 초기 RNG fixture가 두 마디 모두 같은 쪽으로 추첨되어 fixture seed를 수정했고, timer startup padding이 1초를 2초로 표시하는 결함은 전체 설정 시간으로 제한하여 수정했다.
- 이후 start-stop-start의 이전 unlock 무효화, runtime Worker 오류와 context 중단 정리 검증을 추가했다.
- TypeScript 검사 통과. 실제 브라우저 장시간 실행과 OfflineAudioContext 출력 확인은 상위 작업의 통합 검증에서 별도 기록한다.

### 실제 API

`MetronomeEngine(settings, callbacks?, dependencies?)`는 `start(): Promise<void>`, `stop()`, `dispose()`, `updateSettings(settings, source?)`, `getSnapshot()`, `subscribe(listener)`, `setCallbacks(callbacks)`, `getDiagnostics()`를 제공한다. source는 `settings | manual | preset`이다. Hook은 기존 API에 `transportState`, `error`, `pendingSettings`, `queuePreset(settings)`, `applySettings(settings, source?)`를 추가했다. `setBpm`은 speed를 해제한다. `queuePreset` 호출 후 저장할 desired settings를 갱신하면 동일 payload를 중복 적용하지 않는다.

BeatEvent는 실제 예약에 쓰인 `bpm`, `tempoUnit`, `timeSignature`, `subdivision`, `beatGroups`, `accents`와 `sessionId`, 묵음 원인, `showVisual`, `mainStartedAt`, `timerDeadline`을 포함한다. preset 볼륨은 다음 main 마디의 정확한 오디오 시각에 적용하며, 적용 대기 표시는 해당 이벤트가 화면에 전달될 때까지 유지한다. main 이전 카운트인 전체 동안 변경은 대기한다. count-in과 timer 설정 자체는 다음 세션부터 적용한다.

출력 경로는 voice envelope → session fade Gain → user volume Gain → destination이다. timer 마감은 미리 session Gain에 `deadline-8ms → deadline 0`을 예약하므로 rAF/표시 타이머 지연으로 소리가 마감 뒤 계속되지 않는다. Worker가 돌아오면 transport 상태를 정리한다. 긴 지연은 0.5초 초과로 정의하며 중단 후 재생은 새 세션이다.

개발 빌드에서만 `window.__pulseDiagnostics`가 노출된다. `getSnapshot()`과 `getDiagnostics()`는 읽기 전용 관찰용이며 언마운트 때 제거한다. 최근 512개 이벤트의 계획 시각/예약 당시 오디오 시각, 늦음/건너뜀/중복 수, 총 예약 수, 첫/마지막 이벤트 시각, 최대 큐 크기, 최대 Worker tick 간격, 마지막 시각 전달 시각을 제공한다. production에는 창에 진단 API를 붙이지 않는다. 실제 사용자 오디오나 개인 데이터는 수집하지 않는다.

오디오 통합 중간 게이트: `npx tsc --noEmit` 성공, audio/lifecycle/planner/rhythm 5개 파일 총 44개 테스트 성공. stop/start에서 이전 preset의 미래 master Gain 자동화를 제거하는 회귀 검증과, preset 대기 중 재시작 시 desired volume을 쓰는 검증을 포함한다. speed 중 ± 조절은 저장된 시작 전 BPM 대신 실제 표시 중인 이벤트 BPM을 기준으로 수동 전환한다.

### 수동 BPM 간격 회귀 수정 및 production 계측 모드

최종 감사에서 30 BPM 재생의 첫 클릭이 0.06초인 상태로 0.20초에 120 BPM을 선택하면, 다음 미예약 클릭이 기존 2.06초에 남는 결함을 확인했다. 마지막 계획 이벤트의 시각을 별도 보관하고, 수동 또는 일반 BPM 변경은 그 이벤트 다음의 미예약 간격만 현재 실제 박자/분할/음표 기준으로 다시 계산한다. 이미 예약한 음원과 이벤트 위치는 변경하지 않는다. 가속 후 계산된 시각이 과거이면 기존 scheduler 정책으로 위치만 전진하고 클릭을 생성하지 않는다. preset의 마디 경계 적용과 timer의 절대 deadline은 유지한다.

`engineManualTempo.test.ts`의 7개 회귀 검증 및 BPM×분할 20개 matrix를 포함해 관련 67개 테스트와 TypeScript 검사를 통과했다. 최종 계측은 이 수정이 포함된 source로 진행한다.

진단은 개발 모드 또는 명시적인 `vite build --mode diagnostics`에서만 활성화된다. `ENGINE_DIAGNOSTICS_ENABLED = import.meta.env.DEV || import.meta.env.MODE === "diagnostics"`를 사용한다. 일반 production 빌드는 창에 진단 API를 붙이지 않는다. diagnostics 모드는 production 최적화를 사용하면서 한정된 메모리 기록과 읽기 전용 API를 제공하므로 React/Vite 개발 비용과 배포 코드의 측정을 구분할 수 있다. 25ms wake-up / 100ms 예약 창은 변경하지 않았다.

### 시간 경계와 입력 부하 최종 검증

분할 간격의 소수점 합산으로 계획 시각 `3.5599999999999956`이 현재 시각 `3.56`보다 작은 것으로 비교되어 클릭을 버리는 경계 결함을 수정했다. 1e-9초보다 실제로 늦을 때만 건너뛰고, 허용오차 안의 실제 source 시작 시각은 `Math.max(event.time, now)`를 사용한다. 정확한 경계에서는 건너뜀 0, 50ms 실제 지연에서는 건너뜀 1을 구분하는 두 회귀 테스트가 있다. 기존의 지연 복구 정책과 100ms 예약 창은 유지한다.

대기 없는 자동 키 입력 30개가 Worker 메시지 전달을 약 281ms 미룬 별도 실험에서는 실제 클릭 4개를 건너뛰었다. 같은 조작에 16/25/33ms 간격을 주면 각각 건너뜀 0이었다. 한 개의 긴 작업 없이 짧은 입력 작업이 연속되어도 메시지 처리가 늦을 수 있으므로 Long Task 0을 오디오 정상의 대리 지표로 쓰지 않는다. 정상 속도 10분 결과와 스트레스 결과는 [최종 보고서](VALIDATION.md)에서 구분한다.

최종 전체 단위 검증은 18파일 172개 통과다. 가짜 오디오 harness는 종료 이벤트 대기 Set만 순회하고 전체 생성 이력은 assertion용으로 보존한다. 긴 가상 실행에서 이미 종료한 모든 oscillator를 매 tick 다시 순회하던 검사 도구의 비용을 제거했으며, 테스트 제한 시간을 늘리지 않았다.
