# Pulse 기준선 — 2026-09-05

- 원본: 상위 폴더 `메트로놈 웹앱.zip` (수정 없이 보존). 압축 소스의 node_modules/dist/log는 복원하지 않고 `npm ci`로 설치.
- 작업 폴더: 원본 ZIP 안의 `메트로놈 웹앱` 폴더. 기존 Git 저장소 없음.
- Windows, Node 24.14.0, npm 11.9.0. Vite 8.0.16 engines `^20.19.0 || >=22.12.0`, Vitest 4.1.8 engines `^20.0.0 || ^22.0.0 || >=24.0.0`. 검증 버전은 Node 24.
- `npm ci`: 성공. `npm test`: 5파일/14테스트 통과. `npm run build`: 성공.
- JS 245.38kB / gzip 75.35kB, CSS 13.15kB / gzip 4.10kB, Worker 0.24kB.
- 개발 검증: 127.0.0.1:5173. 프로덕션 PWA: 127.0.0.1:4173. 각각 독립 Chromium context와 테스트 데이터만 사용.
- 회귀 대상: 비편집 BPM 외부 갱신 불일치, PC 자동 공연 모드, 320px 겹침, 도움말 Escape/포커스, 불완전 JSON 렌더 중단. 초기 캡처는 `output/playwright/baseline-*`.
- 추가 개발 의존성: @playwright/test, @axe-core/playwright (설계서 요구 브라우저 E2E/axe 검증).
- 초기 npm audit: browserslist/nanoid/postcss 개발 의존성 3개 high. 무조건 force 업그레이드하지 않고 최종 점검에 범위 내 패치 적용 여부 기록.

지원 범위 확인: [Vite](https://vite.dev/guide/), [Vitest](https://vitest.dev/guide/). 오디오 예약 방식: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques). PWA 정책: [서비스 워커 생명주기](https://web.dev/articles/service-worker-lifecycle).
