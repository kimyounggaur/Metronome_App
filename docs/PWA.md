# PWA 및 화면 켜짐 유지

## 빌드와 파일 경계

`npm run build`의 마지막 단계는 `node scripts/build-sw.mjs`여야 한다. Vite가 생성한 index HTML, JS, CSS, scheduler Worker와 manifest·아이콘을 수집하고 파일 내용 및 SW 소스의 SHA-256에서 build version을 만든다. 생성 목록은 `dist/pwa-precache.json`이며 배포할 SW는 생성된 `dist/sw.js`다. `public/sw.js` 원본은 배포용 캐시 목록이 없는 템플릿이다.

PNG 아이콘은 기존 `public/icon.svg`의 원·선 기하를 유지한다. `node scripts/generate-icons.mjs`로 192·512 PNG, 512 maskable, 180 Apple 아이콘을 다시 만들 수 있다. 로고는 maskable 안전 영역 안에 있고 네 아이콘 모두 불투명 배경을 사용한다.

## 준비·업데이트 규칙

- install에서 선언된 모든 자산의 precache 성공이 필요하다. 첫 재생 전 Worker도 저장한다.
- activate 완료 후 활성 controller에 실제 캐시 완전성을 묻고, 성공했을 때만 ‘오프라인 사용 준비 완료’를 보여 준다.
- 현재 SW가 담당하는 build의 HTML과 자산을 함께 사용한다. 새 build는 별도 캐시에 준비된 뒤 waiting 상태로 남는다.
- 사용자가 ‘업데이트 적용’ 또는 ‘정지 후 업데이트 적용’을 누르면 저장 flush 이후 waiting SW에 적용 메시지를 보낸다. 그 페이지는 controllerchange 뒤 새로 열린다. 자동 reload·자동 skipWaiting은 없다.
- cache 이름은 `pulse-metronome-v2:<scope pathname>:<build hash>`다. 활성화 시 같은 scope의 이 prefix에 속한 이전 build만 정리한다. 다른 앱 캐시·SW와 다른 scope의 Pulse 캐시는 유지한다.
- DEV 정리는 scope와 scriptURL이 모두 일치하는 이 앱의 SW만 unregister한다. 캐시 정리도 같은 scope의 전용 prefix로 제한한다.
- navigation만 HTML shell fallback을 사용한다. 없는 JS·CSS·Worker·JSON·API에 HTML을 반환하지 않는다. 임의 요청을 추가 캐싱하지 않는다.
- 브라우저가 일부 캐시를 지운 경우 상태 확인 시 누락된 선언 자산만 온라인 복구를 시도한다. 실패했다면 준비 실패로 표시한다.

## 설치와 기기 복귀

설치는 `beforeinstallprompt`가 제공될 때 사용자가 직접 시작한다. iOS에서는 요청 시 Safari 공유 → 홈 화면에 추가 절차를 보여 준다. standalone으로 실행 중이면 설치 안내를 숨긴다. 닫기 동작은 App의 `showInstallHint` 설정으로 저장해야 한다.

Wake Lock은 재생 중이며 문서가 visible일 때만 요청한다. 숨김·정지·unmount 시 해제하고, 복귀하면 재요청한다. 진행 중인 요청은 하나이며 뒤늦게 완료된 이전 요청은 즉시 해제한다. 보이는 동안 예기치 않게 해제되면 750ms 뒤 한 번 재요청하고, 운영체제의 반복 해제에 무한 재요청하지 않는다. 권한·전원 정책 실패는 오디오 실행을 막지 않는다.

## 검증 실행

`node scripts/verify-pwa.mjs`는 현재 production `dist`를 사용한다. 먼저 정상 build가 필요하다. 테스트는 독립 origin `http://127.0.0.1:4173`의 임시 서버와 새 Chromium context를 사용하고 기존 사용자의 브라우저 데이터는 접근하지 않는다.

검증기는 `output/playwright/pwa-<timestamp>` 아래에 production A/B 사본을 만들고 B에 검증 메타데이터만 추가하여 새 precache build를 생성한다. 테스트 후 서버와 브라우저는 닫고 보고서·스크린샷·빌드 사본은 증거로 남긴다.

검사 항목:

1. HTTP 캐시를 CDP로 비활성화하고 첫 재생 전에 전체 선언 자산·Worker 캐시 확인.
2. 서버가 모든 연결을 실제 끊도록 변경하고 Chromium도 offline으로 전환. Node 네트워크 요청 실패를 별도로 확인한 뒤 새로고침과 첫 재생·정지.
3. offline의 없는 JS는 503 text, online의 SPA HTML fallback은 404 text로 변환.
4. 재생 중 새 버전 준비와 waiting 유지, 사용자 적용 후 새 버전·BPM·localStorage 보존.
5. 다른 앱 캐시, 다른 scope의 Pulse 캐시, 다른 SW 등록 보존 및 이전 자기 build 정리.

화면 켜짐 유지의 API 경계는 `src/tests/wakeLock.test.tsx`로 검증한다. 실제 iPhone Safari 및 Android Chrome의 설치 화면·홈 화면 실행·OS 오디오 중단·Wake Lock 동작은 실기 검증 항목이다. 자동 테스트의 서버 차단은 물리적인 인터넷 회선 차단·장치 출력의 측정이 아니다.

실기 절차: 온라인 첫 방문 후 준비 완료 확인 → 아직 재생하지 않은 상태에서 비행기 모드 → 앱 종료·홈 화면에서 재실행 → 첫 재생·정지 → 화면 잠금/앱 전환 후 복귀 → 중단 안내 또는 정상 transport 상태 → 온라인 복귀와 새 버전 사용자 적용 → 기존 프리셋 유지 확인. 사용 기기·OS·브라우저 버전과 유선/Bluetooth 출력 조건을 기록한다.

## 근거

[Service worker lifecycle](https://web.dev/articles/service-worker-lifecycle), [PWA updates](https://web.dev/learn/pwa/update), [Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API).

실제 실행 결과는 timestamp별 `report.json`에 기록한다. 실행하지 않은 항목을 통과로 취급하지 않는다.

## 실제 자동 검증 결과 — 2026-09-05

독립 production 검증을 Chromium 153.0.8010.12, 390×844, `http://127.0.0.1:4173`에서 실행해 통과했다. HTTP 캐시를 비활성화했고 필수 자산 11개에 scheduler Worker가 포함됨을 확인했다. 서버 socket 차단 및 브라우저 offline 상태에서 새로고침·첫 재생·정지가 통과했다. 존재하지 않는 JS는 offline 503 text / online 404 text였으며 HTML을 반환하지 않았다.

build `6eae9c6d4ef5230a11cc`에서 검증용 build `e7c4ea45a263bc7f54b7`로 갱신할 때 재생 중 waiting 유지, 명시 적용 후 BPM 93 및 원본 localStorage 문자열 유지, 다른 앱 캐시·다른 scope SW 보존, 이전 자기 캐시 삭제를 확인했다. 수집된 pageerror는 0개다.

증거: `output/playwright/pwa-1788614278507/report.json`, `online-ready.png`, `offline-ready.png`, `update-waiting.png`.

`npm test -- src/tests/wakeLock.test.tsx`는 4개 테스트가 통과했다. 물리 기기 설치·출력·OS 정책은 위 실기 절차에 따라 별도 확인이 필요하다.

추가 경계 검증: 없는 CSS·Worker·`/api`·`/api/missing`에도 HTML 대신 404 text를 반환하도록 확인했다. 갱신된 SW build `d9ace004afe2bfa83e02`를 포함한 전체 production 검증도 재통과했다. 해당 중간 증거는 `output/playwright/pwa-1788614395398/report.json`이다.

최종 source 빌드 `56a630db0727b0d4ccd7` → 검증용 B `91934e5a0c937a698488`에서도 위 모든 검사를 다시 통과했다. 최신 증거는 [pwa-1788616391353/report.json](../output/playwright/pwa-1788616391353/report.json)이며 자산 11개, 페이지 오류 0, 원본 데이터와 다른 앱 캐시·SW 보존을 확인했다.
