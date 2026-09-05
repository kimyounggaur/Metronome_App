# 전체 사용자 여정과 추가 접근성 검증

검증일: 2026-09-05. 개발 서버 `http://127.0.0.1:5173`와 독립 Playwright Chromium context를 사용했다. 사용자 브라우저 저장소와 별도 5184 장시간 계측 origin은 건드리지 않았다. 제품 코드 변경 없이 `e2e/journeys.spec.ts`를 추가했다.

## 실행 결과

새 테스트 6개 모두 통과했다. 실제 60초 타이머는 시간을 가속하지 않고 실행했다.

| 항목 | 실제 확인 결과 | 증거 |
|---|---|---|
| 여정 A | BPM 90 직접 입력 → 3/4 → 2분할 → 카운트인 1마디 → 1분 타이머 → 정상 자동 정지 | `output/playwright/journeys/journey-a.json` |
| 여정 C | 6/8 점4분=60, gap 3:1, random beat 30%, speed 60→64 / 2BPM / 2마디, 남은 시간과 실행 BPM 표시 | `output/playwright/journeys/journey-c.json` |
| 다크 접근성 | 메인·설정·리듬 axe 검사 각각 위반 0 | `output/playwright/journeys/accessibility-dark.json` |
| 라이트 접근성 | 메인·설정·리듬 axe 검사 각각 위반 0 | `output/playwright/journeys/accessibility-light.json` |
| 확대·작은 화면 | 320×568에서 글자 200% 확대 후 메인·연습 모달 가로 넘침 0, 닫기 버튼 화면 안; Chromium page scale 2와 visualViewport.scale 2 확인 | `output/playwright/journeys/zoom.json` |
| reduced-motion | 300 BPM / 4분할 / 플래시 선택 상태에서 flash-on 미발생, 정지 후 currentEvent null | `output/playwright/journeys/reduced-motion.json` |

모든 테스트에서 pageerror를 수집·검사했고 0개였다. 첫 여정 C 실행의 실패는 숨겨진 PC 리듬 select와 열린 모달 select를 함께 찾은 테스트 locator 문제였다. 열린 리듬 dialog로 범위를 제한한 뒤 통과했다. 재현된 제품 결함은 없었다.

## 여정 A의 시간과 자원

실제 경과 시간은 62,747ms였다. 엔진의 첫 예약 시간은 0.06초, 본 연습 시작은 2.06초, 타이머 deadline은 62.06초였다. 따라서 카운트인 2초와 본 연습 60초가 분리되어 있다.

예약 이벤트 186개, 누락 0, 중복 0이었다. 마지막 예약 시간 61.7266666666668초는 deadline 이전이다. 자동 정지 후 visual queue 0, 활성 source 0, transport idle, 현재 이벤트와 타이머 표시 null을 확인했다. 이 수치는 브라우저 AudioContext 시간축과 자원 상태의 검증이며 물리적인 스피커 출력 지터 측정이 아니다.

## 여정 C의 음악 상태

처음 6/8 점4분음표=60일 때 UI의 한 마디 길이가 2초임을 확인했다. 카운트인 기본 끔·타이머 기본 끔을 먼저 확인한 뒤 1분 타이머를 선택했다. 속도 목표 동작은 기본 hold, gap은 3:1, 묵음 중 시각·햅틱 유지는 켬, 랜덤 단위는 beat와 30%로 설정했다.

0부터 세는 barIndex 3에서 BPM 62, gapMute true, isAudible false였고 남은 시간이 계속 보였다. barIndex 4에서 목표 BPM 64가 실행되며 큰 BPM 입력 표시도 64로 일치했다. 관찰된 목표 이벤트는 randomMute true였다. 이 짧은 실행으로 랜덤 분포의 통계적 정확성이나 실기 음향을 보증하지는 않는다.

## 확대 검증의 정확한 범위

글자 확대는 documentElement font-size 200%를 실제 320×568 viewport에서 적용했다. 메인 documentWidth 320, 연습 modal clientWidth/scrollWidth 318/318, 가로 범위 밖의 버튼·입력·선택 컨트롤 0개였다. 연습 모달의 닫기 버튼도 viewport 안에 있었다. 스크롤이 필요한 내용은 내부에서 흐른다.

확대 제한 해제는 Chromium의 `Emulation.setPageScaleFactor`로 2를 적용해 확인했다. visualViewport.scale=2, visualWidth=160, layoutWidth=320이었으며 열린 설정 모달을 Escape로 정상 닫았다. 이것은 모바일 pinch 형태의 시각 viewport 확대 검증이다. 데스크톱 브라우저 메뉴의 200% 확대와 실제 터치 기기의 pinch 제스처는 별도 실기 항목으로 남긴다.

CSS `zoom:2`만으로는 브라우저 viewport 단위를 동일하게 재현하지 못하므로, 해당 프록시 결과를 합격 근거에서 제외했다. [VisualViewport.scale](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport/scale)과 [Chrome DevTools Protocol Emulation](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/)의 의미에 맞춰 기록했다.

## 실행 명령

```text
npx playwright test e2e/journeys.spec.ts --grep "journey A" --reporter=line
npx playwright test e2e/journeys.spec.ts --grep-invert "journey A" --reporter=line
npx playwright test e2e/journeys.spec.ts --grep "journey C" --reporter=line
npx playwright test e2e/journeys.spec.ts --grep "200 percent" --reporter=line
```

최종 전체 검증에서는 `npx playwright test e2e/journeys.spec.ts`로 6개를 함께 실행할 수 있다. 여정 A는 실제 약 62초가 필요하며 테스트 제한은 90초다. 서버·브라우저·제품 소스가 바뀌는 중간에는 장시간 실행을 시작하지 않는 것이 좋다.

기존 저장·프리셋·오디오·PWA 테스트는 해당 별도 테스트 및 보고서가 담당한다. 이 문서는 그 결과를 재실행한 것처럼 중복 표시하지 않는다.
