# 직관적인 메트로놈 웹앱 개발을 위한 바이브코딩 프롬프트 설계서

작성일: 2026-06-13  
목적: 기존 메트로놈 앱·웹앱의 기능과 UX 패턴을 분석한 뒤, **가장 직관적이고 사용자 친화적인 메트로놈 웹앱**을 AI 코딩 도구로 구현하기 위한 단계별 프롬프트를 제공한다.

> 사용법: ① 먼저 이 문서의 “마스터 프롬프트”를 새 프로젝트 첫 프롬프트로 붙여넣는다. ② 이후 “단계별 프롬프트”를 1단계부터 순서대로 실행한다. ③ 각 단계가 끝날 때마다 “검수 프롬프트”로 품질을 점검한다.

---

## 0. 조사 범위와 전제

이 분석은 2026-06-13 기준으로 확인 가능한 공식 스토어 설명, 개발사 페이지, 온라인 메트로놈 페이지, Web Audio API 문서, 접근성 문서를 기반으로 한다. 실제 앱 설치 후 장시간 오디오 레이턴시 실측을 수행한 것은 아니므로, 개발 단계에서는 실제 기기 테스트가 필요하다.

분석 대상은 다음 성격의 앱과 웹앱이다.

- **Soundbrenner The Metronome**: 시간표, 세분박, 악센트, 탭 템포, 세트리스트, 시각 효과, 카운트인, 연습 추적, MIDI/Ableton Link 등 고급 기능을 제공한다.[^soundbrenner-play]
- **Pro Metronome**: 비트 사운드·악센트·강약 조절, 세분박, 폴리리듬, 배경 재생, 플레이리스트, 리듬 트레이너, 자동 템포 변화 연습 모드가 강점이다.[^pro-metronome-play]
- **Metronome Beats**: 탭 템포, 시각 비트 표시, 스피드 트레이너, 프리셋·세트리스트, 타이머·카운트인 등 연습 중심 기능이 명확하다.[^metronome-beats]
- **Time Guru**: 랜덤/패턴 묵음과 복합 박자 시퀀스로 사용자의 내적 박자감을 훈련시키는 데 특화되어 있다.[^time-guru]
- **Tempo / Tempo Advance by Frozen Ape**: 세트리스트, 블루투스 컨트롤러, 자동 세트리스트 진행, accelerando/ritardando, 복잡한 곡 구조 프로그래밍을 강조한다.[^tempo-frozenape][^tempo-advance]
- **TonalEnergy Tuner & Metronome**: 튜너·톤 제너레이터·분석·녹음까지 묶은 올인원 연습 앱이며, 메트로놈도 사운드·템포·박자·세분 패턴·시각 표시·보이스 카운트인·프리셋 그룹을 지원한다.[^tonalenergy]
- **Musicca Online Metronome**: BPM 슬라이더, 탭 템포, 키보드 조작, 마디당 박자 선택, 묵음 연습, 점진적 템포 상승 등 웹에서 바로 쓰는 단순함이 장점이다.[^musicca]
- **OnlineMetronome.app**: 30–500 BPM, 탭 BPM, 다양한 박자표와 악센트 패턴, 사일런트 바, 타이머, 스윙, 설정 저장 등 웹앱에서도 고급 리듬 기능을 제공한다.[^online-metronome]

---

## 1. 경쟁 앱 분석 요약

| 사례 | 장점 | 웹앱에 가져올 점 | 주의할 점 |
|---|---|---|---|
| Soundbrenner | 기능이 많지만 “쉬운 인터페이스”와 세트리스트·시각 효과·연습 추적을 함께 제공 | 시각 비트, 프리셋/세트리스트, 카운트인, 테마 | 계정·클라우드·하드웨어 연동은 MVP에서 제외 |
| Pro Metronome | 악센트/강약/세분박/폴리리듬/리듬 트레이너가 강력 | 비트별 악센트, 묵음 트레이너, 자동 템포 변화 | 첫 화면에 모든 옵션을 노출하면 초보자가 압도됨 |
| Metronome Beats | 탭 템포, 시각 표시, 스피드 트레이너, 타이머가 연습 흐름에 잘 맞음 | “오늘 연습” 중심의 타이머·카운트다운·스피드 트레이너 | 드럼머신까지 MVP에 넣으면 범위가 커짐 |
| Time Guru | 랜덤/패턴 묵음으로 내적 박자 훈련에 특화 | Gap Trainer / Random Mute를 고급 연습 모드로 채택 | 고급 모드는 접힌 패널 또는 별도 탭에 배치 |
| Tempo / Tempo Advance | 세트리스트와 공연용 컨트롤, 복잡한 곡 구조 프로그래밍 | 프리셋 → 세트리스트 → 다음 곡 이동 흐름 | 블루투스 페달·곡 구조 편집기는 V2 이후 |
| TonalEnergy | 시각적으로 친숙하고 올인원 연습 도구 | “친근한 시각 피드백”과 보이스 카운트인 아이디어 | 튜너/녹음/분석까지 넣지 말고 메트로놈에 집중 |
| Musicca | 웹에서 즉시 시작, 키보드 단축키, 단순한 설명 | 1초 안에 재생 가능한 단순 화면 | 너무 단순하면 중급자의 연습 확장성이 부족 |
| OnlineMetronome.app | 박자표/악센트 패턴/스윙/사일런트 바 등 웹 고급 기능 | 고급 리듬 패널의 참조 모델 | 모든 박자표를 MVP에 넣기보다 자주 쓰는 것부터 |

---

## 2. 핵심 UX 인사이트

### 2.1 첫 화면의 목표는 “설명 없이 바로 시작”이다

메트로놈은 음악가가 연습 중 즉시 켜는 도구다. 따라서 첫 화면은 다음 5개만 보여준다.

1. 현재 BPM
2. 재생/정지 버튼
3. 탭 템포 버튼
4. BPM ± 버튼 또는 슬라이더
5. 현재 박자와 시각 비트 표시

고급 기능은 “리듬”, “연습”, “저장” 패널로 접어 둔다.

### 2.2 BPM 조작은 최소 4가지 경로를 제공한다

- 큰 숫자 직접 입력
- `−` / `+` 버튼
- 슬라이더 또는 원형 다이얼
- Tap Tempo
- 키보드: `Space`, `T`, `↑`, `↓`, `Shift+↑`, `Shift+↓`

서로 다른 사용자 상황을 고려한다. 악기를 든 상태, 노트북 앞, 모바일 한 손 조작, 수업 중 빠른 전환이 모두 가능해야 한다.

### 2.3 청각 + 시각 + 촉각을 함께 제공한다

Pro Metronome은 소리 외에도 시각·플래시·진동 피드백을 강조하고, Soundbrenner와 Metronome Beats도 시각 비트 표시를 전면에 둔다.[^pro-metronome-play][^soundbrenner-play][^metronome-beats] 웹앱에서는 다음처럼 구현한다.

- 청각: 강박, 보통박, 세분박의 톤/볼륨 차이
- 시각: 원형 펄스, 비트 도트, 현재 박자 하이라이트
- 촉각: 지원 기기에서 `navigator.vibrate()`를 옵션으로 제공하되 기본값은 꺼짐

### 2.4 고급 연습 기능은 “처음엔 안 보여야” 한다

중급자에게는 세분박, 악센트, 묵음 트레이너, 속도 증가, 세트리스트가 중요하다. 초보자에게는 방해 요소다. 따라서 정보 구조는 다음 원칙을 따른다.

- 기본 모드: BPM, Start, Tap, 박자 선택
- 리듬 패널: 박자표, 세분박, 악센트
- 연습 패널: 카운트인, 타이머, 스피드 트레이너, 묵음 트레이너
- 저장 패널: 프리셋, 세트리스트
- 설정 패널: 사운드, 테마, 진동, 접근성

### 2.5 정확도는 신뢰의 핵심이다

브라우저에서는 `setInterval()`만으로 소리를 직접 내면 타이밍이 흔들릴 수 있다. Web Audio API는 오디오 소스와 이벤트를 오디오 컨텍스트 시간 기준으로 예약할 수 있고, `AudioContext.currentTime`은 오디오 재생 스케줄링에 사용할 수 있는 시간축이다.[^mdn-currenttime][^mdn-start] 따라서 오디오 엔진은 “lookahead scheduler + Web Audio 예약 재생”으로 설계한다.[^webdev-scheduling]

---

## 3. 제품 콘셉트

### 3.1 작업명

**Pulse One**  
부제: “켜자마자 맞춰지는 가장 단순한 웹 메트로놈”

### 3.2 핵심 가치 제안

> 초보자는 한 번 눌러 바로 연습하고, 중급자는 악센트·세분박·묵음 훈련까지 확장할 수 있는 모바일 우선 웹 메트로놈.

### 3.3 주요 사용자

| 사용자 | 상황 | 필요한 기능 |
|---|---|---|
| 초보 악기 학습자 | 악보에 적힌 BPM을 맞추고 천천히 연습 | 큰 BPM, 쉬운 시작/정지, 기본 박자, 탭 템포 |
| 드러머/기타리스트/피아니스트 | 세분박, 악센트, 묵음 훈련, 속도 증가 연습 | 세분박, 악센트, 스피드 트레이너, Gap Trainer |
| 교사/레슨 사용자 | 학생별 템포와 곡을 빠르게 전환 | 프리셋, 세트리스트, 카운트인, 키보드 단축키 |
| 공연/합주 사용자 | 세트 순서대로 템포를 빠르게 불러오기 | 세트리스트, 큰 화면 모드, 다음/이전 프리셋 |

### 3.4 제품 원칙

1. **3초 안에 첫 박자**: 페이지 진입 → BPM 확인 → Start.
2. **모든 핵심 조작은 한 손 엄지 영역에 배치**: 모바일 하단에 Start/Tap/± 배치.
3. **고급 기능은 숨기되, 찾기 쉬워야 한다**: 아코디언/탭 구조.
4. **소리 없이도 박자를 볼 수 있어야 한다**: 비트 도트와 펄스 링.
5. **가입 없이 저장 가능**: 로컬 저장소 기반 프리셋.
6. **정확도를 과장하지 않는다**: 내부 스케줄링은 정밀하게 하되, 기기·브라우저·절전 상태의 한계를 안내한다.

---

## 4. 기능 범위

### 4.1 MVP

- BPM 30–300
- Start/Stop
- Tap Tempo
- BPM 직접 입력, ±1, ±5, 슬라이더
- 박자표: 1/4, 2/4, 3/4, 4/4, 5/4, 6/8, 7/8, 12/8
- 세분박: 없음, 8분음표, 셋잇단음표, 16분음표
- 비트별 악센트: 강, 보통, 약, 묵음
- 시각 비트 도트와 큰 펄스
- 볼륨, 사운드 타입 3종
- 카운트인 0/1/2마디
- 타이머 1–60분
- 프리셋 저장/불러오기/삭제
- 다크/라이트 테마
- 키보드 단축키
- 반응형 모바일/데스크톱 UI

### 4.2 V1 확장

- Speed Trainer: N마디마다 BPM +1/+2/+5
- Gap Trainer: N마디 재생 후 M마디 묵음
- Random Mute: 지정 확률로 클릭 묵음
- 세트리스트: 프리셋 순서 배열, 다음/이전 이동
- 전체화면 Practice Mode
- PWA 설치 및 오프라인 캐시
- 설정 내보내기/가져오기 JSON

### 4.3 V2 이후

- 폴리리듬
- 커스텀 박자 그룹: 7/8 = 2+2+3, 3+2+2, 2+3+2
- 곡 구조 편집: Intro 2마디 → Verse 16마디 → Chorus 8마디
- MIDI/Ableton Link 연동
- 블루투스 페달/외부 컨트롤러
- 보이스 카운트인
- 튜너/녹음은 별도 앱 또는 플러그인으로 분리

---

## 5. 정보 구조와 화면 설계

### 5.1 기본 화면

```
┌──────────────────────────────┐
│ Pulse One      Preset: 기본  │
├──────────────────────────────┤
│              120             │
│              BPM             │
│        Moderato / 4-4         │
│                              │
│      ◯  ◯  ●  ◯              │
│                              │
│     −5  −1  ▶  +1  +5        │
│          Tap Tempo           │
│                              │
│  4/4  3/4  6/8  Custom       │
├──────────────────────────────┤
│ ▾ 리듬  ▾ 연습  ▾ 저장  ⚙    │
└──────────────────────────────┘
```

### 5.2 모바일 레이아웃

- 상단: 앱명, 프리셋명, 설정 버튼
- 중앙: BPM 숫자와 원형 펄스
- 중앙 하단: Play/Stop 대형 버튼
- 하단 고정 컨트롤: `−`, `Tap`, `+`
- 고급 패널은 bottom sheet로 열기
- 모든 주요 터치 타깃은 최소 44×44 CSS px 이상으로 설계한다. WCAG 2.2의 포인터 타깃 최소 기준은 24×24 CSS px이며, 중요한 컨트롤은 그보다 여유 있게 설계한다.[^wcag-target]

### 5.3 데스크톱 레이아웃

- 좌측: 핵심 컨트롤
- 우측: 리듬/연습/저장 패널
- 키보드 단축키 도움말을 우측 하단 `?` 버튼에 배치
- 넓은 화면에서는 비트 도트를 크게 표시해 합주/레슨에서 멀리서도 보이게 한다.

### 5.4 상태별 UI

| 상태 | UI |
|---|---|
| 첫 방문 | 120 BPM, 4/4, “시작” 버튼 강조, 짧은 사용 힌트 |
| 재생 중 | Play 버튼을 Stop으로 변경, 현재 박자 펄스, BPM 변경 즉시 반영 |
| 카운트인 중 | “2마디 카운트인” 표시, 카운트다운 숫자 |
| 묵음 마디 | 시각 펄스는 유지하되 “묵음 훈련 중” 작은 배지 표시 |
| 저장 완료 | 토스트: “프리셋 ‘Warmup 80’ 저장됨” |
| 오디오 권한 필요 | “브라우저 정책상 한 번 탭해야 소리가 시작됩니다” 안내 |

---

## 6. 상호작용 상세

### 6.1 BPM 조작

- 범위: MVP는 30–300 BPM, 내부 타입은 1–500까지 확장 가능하게 설계.
- `+/-` 버튼: 짧게 누르면 1 BPM, 길게 누르면 반복 증가.
- `Shift + ArrowUp/Down`: 5 BPM 단위.
- 숫자 입력: 포커스 아웃 또는 Enter 시 적용, 범위 밖은 clamp.
- 슬라이더: coarse 조정, ± 버튼은 fine 조정.

### 6.2 Tap Tempo 알고리즘

요구사항:

- 최근 탭 간격 4–8개를 사용한다.
- 2초 이상 탭이 끊기면 새 측정으로 리셋한다.
- 너무 빠른 오탭은 무시한다. 예: 20 BPM 미만, 400 BPM 초과 결과 제외.
- 평균은 단순 평균보다 중앙값 또는 절사 평균을 사용해 오탭 영향을 줄인다.
- 결과는 정수 BPM으로 반올림한다.

의사코드:

```ts
function calculateTapTempo(timestamps: number[]): number | null {
  const intervals = diff(timestamps).filter(ms => ms >= 150 && ms <= 3000);
  if (intervals.length < 2) return null;
  const sorted = [...intervals].sort((a, b) => a - b);
  const trimmed = sorted.length >= 5 ? sorted.slice(1, -1) : sorted;
  const avgMs = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  return clamp(Math.round(60000 / avgMs), 30, 300);
}
```

### 6.3 악센트 편집

비트 도트를 탭할 때마다 다음 순서로 순환한다.

1. 강박
2. 보통
3. 약박
4. 묵음

Soundbrenner도 악센트 마커에 여러 상태를 두고, 상태별 사운드와 시각 효과를 지정할 수 있게 한다.[^soundbrenner-manual] 웹앱에서는 MVP에서 단순 순환 방식으로 구현하고, 설정에서 각 상태의 소리/색/볼륨을 조정하게 한다.

### 6.4 세분박

- 없음: 박자당 1클릭
- 8분음표: 박자당 2클릭
- 셋잇단음표: 박자당 3클릭
- 16분음표: 박자당 4클릭

세분박은 강박보다 작은 볼륨과 다른 톤으로 재생한다.

### 6.5 연습 모드

#### Count-in

- 0, 1, 2마디 선택
- 카운트인 중에도 같은 BPM과 박자표 사용
- 본 재생 시작 시 마디 번호 1로 리셋

#### Timer

- 1, 3, 5, 10, 15, 30, 60분 프리셋
- 종료 시 자동 정지
- 마지막 5초는 시각 카운트다운만 표시하고 소리는 과하게 추가하지 않는다.

#### Speed Trainer

- 시작 BPM, 목표 BPM, 증가 단위, 증가 주기 설정
- 예: 80 BPM에서 시작, 4마디마다 +2, 120 BPM에서 정지
- 템포가 변할 때 토스트 또는 작은 배지로 “+2 BPM → 92” 표시

#### Gap Trainer

- 예: 3마디 재생 + 1마디 묵음
- 묵음 중 시각 비트는 유지할 수 있게 옵션 제공
- 중급자용 기본 프리셋: 3:1, 2:2, 1:1

#### Random Mute

- 0–80% 범위
- 박 단위 또는 마디 단위 선택
- Time Guru처럼 랜덤/패턴 묵음은 내적 박자감 훈련에 유용하지만[^time-guru], 초보자에게는 어렵기 때문에 연습 패널 안에 배치한다.

### 6.6 프리셋과 세트리스트

프리셋 필드:

```ts
interface MetronomePreset {
  id: string;
  name: string;
  bpm: number;
  timeSignature: { beats: number; noteValue: 4 | 8 | 16 };
  subdivision: 'none' | 'eighth' | 'triplet' | 'sixteenth';
  accents: Array<'strong' | 'normal' | 'soft' | 'mute'>;
  sound: 'classic' | 'wood' | 'digital';
  practice?: PracticeSettings;
  createdAt: string;
  updatedAt: string;
}
```

로컬 저장 키:

```txt
pulse-one:settings:v1
pulse-one:presets:v1
pulse-one:setlists:v1
```

---

## 7. 오디오 엔진 설계

### 7.1 핵심 원칙

1. 소리 발생은 Web Audio API로 한다.[^mdn-webaudio]
2. `AudioContext`는 사용자 제스처 후 생성 또는 resume한다.
3. `setInterval()`은 “예약할 이벤트를 찾는 루프”로만 쓰고, 실제 클릭 시점은 `AudioScheduledSourceNode.start(when)`에 예약한다.[^mdn-start]
4. 오디오 시간축은 `audioContext.currentTime`을 기준으로 한다.[^mdn-currenttime]
5. UI 애니메이션은 `requestAnimationFrame()`으로 처리한다.
6. 브라우저 백그라운드/절전 모드에서는 완벽한 동작을 보장하지 않는다고 안내한다.

### 7.2 스케줄러 설정값

```ts
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_TIME = 0.1; // seconds
```

- 25ms마다 다음 100ms 안에 울릴 클릭을 미리 예약한다.
- BPM 변경 시 다음 예약되지 않은 박부터 새 BPM을 적용한다.
- Stop 시 예약 루프를 멈추고, 이미 예약된 소리는 짧게 fade-out하거나 이후 예약을 취소한다.

### 7.3 클릭 사운드 생성

MVP에서는 외부 오디오 파일 없이 oscillator + gain envelope로 만든다.

| 클릭 종류 | 주파수 예시 | 길이 | 볼륨 |
|---|---:|---:|---:|
| 강박 | 1400Hz | 35ms | 1.0 |
| 보통박 | 900Hz | 25ms | 0.75 |
| 약박 | 650Hz | 20ms | 0.45 |
| 세분박 | 500Hz | 15ms | 0.25 |
| 묵음 | 없음 | 없음 | 0 |

의사코드:

```ts
function scheduleClick(ctx: AudioContext, time: number, click: ClickType) {
  if (click.level === 'mute') return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = click.waveform;
  osc.frequency.setValueAtTime(click.frequency, time);

  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(click.volume, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + click.duration);

  osc.connect(gain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + click.duration + 0.01);
}
```

### 7.4 스케줄러 의사코드

```ts
class MetronomeEngine {
  private ctx: AudioContext | null = null;
  private timerId: number | null = null;
  private nextNoteTime = 0;
  private beatIndex = 0;
  private subdivisionIndex = 0;
  private scheduledNotes: ScheduledNote[] = [];

  async start(settings: MetronomeSettings) {
    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.beatIndex = 0;
    this.subdivisionIndex = 0;
    this.timerId = window.setInterval(() => this.scheduler(settings), LOOKAHEAD_MS);
  }

  private scheduler(settings: MetronomeSettings) {
    if (!this.ctx) return;
    while (this.nextNoteTime < this.ctx.currentTime + SCHEDULE_AHEAD_TIME) {
      const note = this.createNote(settings, this.beatIndex, this.subdivisionIndex, this.nextNoteTime);
      this.scheduleNote(note);
      this.advanceNote(settings);
    }
  }
}
```

### 7.5 UI 동기화

오디오가 예약된 시점과 화면이 반드시 완벽히 일치할 수는 없다. 하지만 사용자에게 자연스럽게 보이도록 다음 방식을 쓴다.

- 예약된 노트 배열을 `scheduledNotes`에 저장한다.
- `requestAnimationFrame()`에서 `audioContext.currentTime`과 가장 가까운 현재/다음 노트를 계산한다.
- 현재 비트 도트와 펄스 크기를 갱신한다.
- `prefers-reduced-motion` 사용자는 큰 스케일 애니메이션 대신 색/테두리 변화로 표시한다.[^reduced-motion]

---

## 8. 접근성 기준

- WCAG 2.2를 기본 참조 기준으로 삼는다.[^wcag22]
- 모든 버튼에는 명확한 accessible name을 제공한다.
- 색만으로 강박/약박을 구분하지 않는다. 아이콘, 굵기, 텍스트, 패턴을 함께 사용한다.
- 중요한 UI 컴포넌트와 상태 표시는 최소 3:1 비텍스트 대비를 목표로 한다.[^wcag-nontext]
- 포인터 타깃은 최소 24×24 CSS px 이상, 주요 컨트롤은 44×44 CSS px 이상으로 설계한다.[^wcag-target]
- 키보드만으로 모든 기능을 사용할 수 있어야 한다.
- Space가 페이지 스크롤을 일으키지 않고 재생/정지를 수행해야 한다.
- 스크린리더용 live region은 너무 자주 말하지 않는다. BPM 변경, 재생/정지, 프리셋 저장 정도만 알린다.
- `prefers-reduced-motion`을 감지해 펄스 확대/축소 애니메이션을 줄인다.[^reduced-motion]

---

## 9. 권장 기술 스택

특정 프레임워크 버전에 의존하지 않는 프롬프트로 설계한다.

- React + TypeScript
- Vite 또는 Next.js 중 하나. 단일 웹앱 MVP라면 Vite 권장
- Tailwind CSS 또는 CSS Modules
- 상태 관리: 작은 앱이면 Zustand 또는 React Context
- 테스트: Vitest + Testing Library + Playwright
- 오디오: Web Audio API 직접 사용
- 저장: localStorage, 추후 IndexedDB 확장
- PWA: manifest + service worker

금지 또는 회피:

- 오디오 클릭을 `HTMLAudioElement` 반복 재생에만 의존하지 말 것
- 실제 클릭 타이밍을 `setInterval()` 콜백 안에서 즉시 재생하지 말 것
- MVP에 로그인, 결제, 소셜 공유, 튜너, 녹음 기능을 넣지 말 것
- 첫 화면에 모든 고급 옵션을 펼쳐 놓지 말 것

---

## 10. 파일 구조 제안

```txt
src/
  audio/
    MetronomeEngine.ts
    clickFactory.ts
    schedulerTypes.ts
  components/
    AppShell.tsx
    BpmControl.tsx
    PlayButton.tsx
    TapTempoButton.tsx
    BeatVisualizer.tsx
    RhythmPanel.tsx
    PracticePanel.tsx
    PresetPanel.tsx
    SettingsPanel.tsx
    ShortcutHelp.tsx
  hooks/
    useKeyboardShortcuts.ts
    useTapTempo.ts
    useAnimationClock.ts
    useLocalStorage.ts
  store/
    metronomeStore.ts
  domain/
    rhythm.ts
    presets.ts
    practiceModes.ts
  styles/
    tokens.css
    globals.css
  tests/
    tapTempo.test.ts
    rhythm.test.ts
    scheduler.test.ts
```

---

## 11. 완료 기준

### 11.1 사용성

- 첫 방문자가 설명을 읽지 않고도 120 BPM 4/4를 재생할 수 있다.
- BPM 변경이 재생 중에도 끊김 없이 반영된다.
- Tap Tempo는 4번 이상 탭하면 안정적으로 BPM을 계산한다.
- 모바일 360px 폭에서 핵심 조작이 겹치지 않는다.
- 고급 패널을 닫으면 화면이 단순해진다.

### 11.2 오디오

- `AudioContext.currentTime` 기반으로 다음 클릭을 미리 예약한다.
- 40, 120, 240 BPM에서 기본 클릭이 동작한다.
- 120 BPM 16분음표 세분박에서도 클릭이 누락되지 않는다.
- Stop 후 예약 루프가 중단되고 메모리 누수가 없다.
- iOS Safari에서 사용자 탭 이후 오디오가 시작된다.

### 11.3 접근성

- 모든 핵심 기능이 키보드로 동작한다.
- 포커스 링이 보인다.
- Play 버튼, Tap 버튼, BPM 입력, 박자 선택에 accessible label이 있다.
- 색상만으로 상태를 전달하지 않는다.
- reduced motion 환경에서 큰 펄스 애니메이션이 줄어든다.

### 11.4 저장

- 프리셋 저장 후 새로고침해도 남아 있다.
- 프리셋 삭제 시 확인 절차가 있다.
- localStorage 데이터 파싱 실패 시 앱이 깨지지 않고 기본값으로 복구한다.

---

# 12. 마스터 프롬프트

아래 프롬프트를 AI 코딩 도구에 그대로 붙여넣는다.

```md
너는 시니어 프론트엔드 엔지니어이자 음악 연습 도구 UX 디자이너다. React + TypeScript 기반으로 “Pulse One”이라는 메트로놈 웹앱을 만든다.

목표는 초보자도 페이지를 열자마자 3초 안에 첫 박자를 들을 수 있고, 중급자는 세분박·악센트·카운트인·타이머·프리셋까지 자연스럽게 확장해서 쓸 수 있는 가장 직관적인 웹 메트로놈을 구현하는 것이다.

핵심 UX 원칙:
1. 첫 화면에는 BPM, Start/Stop, Tap Tempo, ± 조절, 박자표, 시각 비트만 둔다.
2. 고급 기능은 리듬/연습/저장/설정 패널로 접어 둔다.
3. 모바일 우선으로 설계하고, 핵심 버튼은 최소 44×44 CSS px 이상으로 만든다.
4. 색만으로 상태를 전달하지 말고 텍스트, 아이콘, 형태를 함께 사용한다.
5. 가입, 서버, 결제, 광고 없이 localStorage로 프리셋을 저장한다.

기술 요구사항:
- React + TypeScript를 사용한다.
- 오디오는 Web Audio API로 구현한다.
- 실제 클릭 타이밍은 setInterval 즉시 실행이 아니라 AudioContext.currentTime 기준 예약 재생으로 구현한다.
- lookahead scheduler를 사용한다. 권장값은 lookahead 25ms, scheduleAheadTime 0.1s.
- AudioContext는 사용자 제스처 후 생성 또는 resume한다.
- UI 애니메이션은 requestAnimationFrame으로 동기화한다.
- reduced motion 사용자를 위해 큰 스케일 애니메이션을 줄인다.
- 테스트 가능한 순수 함수로 BPM 계산, Tap Tempo, 박자 진행, 프리셋 직렬화를 분리한다.

MVP 기능:
- BPM 30–300
- Start/Stop
- Tap Tempo: 최근 탭 간격 4–8개 기반, 2초 이상 끊기면 리셋, 오탭 완화
- BPM 직접 입력, ±1, ±5, 슬라이더
- 박자표: 1/4, 2/4, 3/4, 4/4, 5/4, 6/8, 7/8, 12/8
- 세분박: 없음, 8분음표, 셋잇단음표, 16분음표
- 비트별 악센트: strong, normal, soft, mute
- 시각 비트 도트와 원형 펄스
- 사운드 타입 3종: classic, wood, digital
- 볼륨 조절
- 카운트인 0/1/2마디
- 타이머 1–60분
- 프리셋 저장/불러오기/삭제
- 다크/라이트 테마
- 키보드 단축키: Space 재생/정지, T 탭 템포, ↑/↓ 1 BPM, Shift+↑/↓ 5 BPM, Esc 패널 닫기, ? 단축키 도움말

구현 구조:
- src/audio/MetronomeEngine.ts: AudioContext, scheduler, start/stop, tempo update
- src/audio/clickFactory.ts: oscillator + gain envelope 클릭 생성
- src/domain/rhythm.ts: 박자표, 세분박, 악센트, 다음 노트 계산
- src/hooks/useTapTempo.ts: 탭 템포 계산
- src/hooks/useKeyboardShortcuts.ts: 단축키
- src/store/metronomeStore.ts: 전역 상태
- src/components/*: UI 컴포넌트
- src/tests/*: 핵심 로직 테스트

디자인 방향:
- 중앙에 아주 큰 BPM 숫자.
- Play/Stop은 가장 큰 버튼.
- 재생 중에는 현재 비트가 도트와 펄스 링으로 보인다.
- “기본” 화면은 매우 단순하게 유지한다.
- “리듬”, “연습”, “저장”, “설정”은 접이식 패널로 만든다.
- 모바일에서는 하단 고정 컨트롤을 사용한다.
- 데스크톱에서는 좌측 핵심 컨트롤, 우측 고급 패널 2열 레이아웃을 사용한다.

품질 기준:
- placeholder 코드 없이 실제로 동작하는 MVP를 만든다.
- 타입 오류가 없어야 한다.
- localStorage 파싱 오류에도 앱이 깨지지 않아야 한다.
- 오디오 엔진 stop 시 타이머와 예약 상태를 정리한다.
- 핵심 함수에는 단위 테스트를 작성한다.
- 접근성 label, keyboard focus, aria-live를 적절히 넣는다.

작업 방식:
1. 먼저 전체 파일 트리와 구현 계획을 짧게 제시한다.
2. 그다음 실제 코드를 파일별로 작성한다.
3. 각 단계가 끝나면 실행 방법과 테스트 방법을 알려준다.
4. 불명확한 부분은 질문하지 말고 위 요구사항에 맞는 합리적 기본값을 선택한다.
5. 기능을 과도하게 늘리지 말고 MVP 완성도를 우선한다.
```

---

# 13. 단계별 프롬프트

## 13.1 1단계: 프로젝트 스캐폴딩과 기본 UI

```md
1단계 작업을 시작하라. React + TypeScript 프로젝트 기준으로 Pulse One 메트로놈 웹앱의 기본 구조와 핵심 UI만 구현한다.

이번 단계의 목표:
- 앱 레이아웃 생성
- 큰 BPM 표시
- Start/Stop 버튼 UI
- Tap Tempo 버튼 UI
- ±1, ±5 버튼 UI
- 박자표 quick chip UI
- 비트 도트 시각화 UI
- 리듬/연습/저장/설정 접이식 패널의 껍데기
- 다크/라이트 테마 토큰
- 모바일/데스크톱 반응형 레이아웃

아직 실제 오디오 엔진은 연결하지 말고, 재생 상태 mock으로 비트 도트가 움직이게만 하라.

완료 기준:
- 360px 모바일 화면에서 핵심 버튼이 겹치지 않는다.
- Play 버튼이 가장 눈에 띈다.
- 고급 패널을 닫으면 첫 화면이 단순하다.
- 모든 버튼에 aria-label이 있다.
- Space/T/Arrow 단축키는 아직 구현하지 않아도 된다.

출력:
- 파일 트리
- 변경된 전체 코드
- 실행 방법
```

## 13.2 2단계: Web Audio 메트로놈 엔진

```md
2단계 작업을 시작하라. 실제 오디오 클릭을 Web Audio API로 구현한다.

요구사항:
- src/audio/MetronomeEngine.ts를 만든다.
- AudioContext는 사용자 제스처 후 생성 또는 resume한다.
- lookahead scheduler를 사용한다: lookahead 25ms, scheduleAheadTime 0.1s.
- 실제 클릭은 AudioContext.currentTime 기준으로 oscillator.start(when), oscillator.stop(when) 방식으로 예약한다.
- strong, normal, soft, subdivision 클릭은 주파수/볼륨/길이를 다르게 한다.
- mute는 소리를 내지 않는다.
- start, stop, updateSettings 메서드를 제공한다.
- stop 시 interval과 내부 예약 배열을 정리한다.
- tempo 변경은 다음 예약되지 않은 노트부터 반영한다.

주의:
- setInterval 콜백 안에서 즉시 소리만 내는 방식은 금지한다.
- HTMLAudioElement loop 방식은 금지한다.

완료 기준:
- Start를 누르면 실제 클릭음이 난다.
- Stop을 누르면 멈춘다.
- BPM 변경 시 재생 중에도 속도가 바뀐다.
- 4/4 strong-normal-normal-normal 악센트가 구분된다.
- 120 BPM 16분음표 세분박에서도 누락 없이 들린다.

출력:
- 변경된 코드
- 오디오 스케줄러 동작 설명
- 수동 테스트 방법
```

## 13.3 3단계: Tap Tempo, 키보드 단축키, BPM 조작 완성

```md
3단계 작업을 시작하라. Tap Tempo와 키보드 조작을 완성한다.

Tap Tempo 요구사항:
- 최근 탭 간격 4–8개를 사용한다.
- 2초 이상 탭이 끊기면 리셋한다.
- 너무 빠르거나 느린 오탭은 제외한다.
- 중앙값 또는 절사 평균으로 BPM을 계산한다.
- 결과는 30–300 BPM으로 clamp한다.

키보드 단축키:
- Space: 재생/정지. 버튼/입력 필드 포커스 상황은 방해하지 않도록 처리한다.
- T: Tap Tempo
- ArrowUp/ArrowDown: ±1 BPM
- Shift+ArrowUp/Shift+ArrowDown: ±5 BPM
- Esc: 열린 패널 닫기
- ?: 단축키 도움말 열기

BPM 조작:
- 직접 입력 필드 추가
- ±1, ±5 버튼 연결
- 슬라이더 연결
- 재생 중 변경 반영

완료 기준:
- Tap Tempo를 4회 이상 누르면 BPM이 계산된다.
- 오탭 하나가 있어도 BPM이 크게 흔들리지 않는다.
- Space를 눌렀을 때 페이지가 스크롤되지 않는다.
- 숫자 입력 중 Space/Arrow가 의도치 않게 메트로놈을 조작하지 않는다.
- tapTempo와 clamp 로직에 단위 테스트를 작성한다.

출력:
- 변경된 코드
- 테스트 코드
- 실행 및 테스트 방법
```

## 13.4 4단계: 리듬 패널, 박자표, 세분박, 악센트

```md
4단계 작업을 시작하라. 리듬 패널을 실제 기능으로 완성한다.

구현할 것:
- 박자표 선택: 1/4, 2/4, 3/4, 4/4, 5/4, 6/8, 7/8, 12/8
- 박자표 변경 시 accents 배열 길이를 자동 보정한다.
- 세분박 선택: none, eighth, triplet, sixteenth
- 비트 도트를 탭하면 strong → normal → soft → mute 순환
- 비트 도트는 색만이 아니라 라벨/모양/툴팁으로 상태를 구분한다.
- 현재 박자와 세분박을 시각화한다.
- 6/8과 7/8은 MVP에서 기본 그룹만 제공하고, 커스텀 그룹은 “추후 제공” 비활성 UI로 둔다.

완료 기준:
- 3/4 선택 시 비트 도트 3개.
- 6/8 선택 시 비트 도트 6개 또는 2그룹 표현 중 하나를 일관되게 선택.
- mute 악센트는 해당 박에서 소리가 나지 않는다.
- 세분박 클릭은 보통박보다 작게 들린다.
- 리듬 계산 순수 함수에 단위 테스트를 작성한다.

출력:
- 변경된 코드
- 리듬 모델 설명
- 테스트 방법
```

## 13.5 5단계: 연습 패널 — 카운트인, 타이머, Speed Trainer, Gap Trainer

```md
5단계 작업을 시작하라. 연습 패널을 구현한다.

구현할 것:
- Count-in: 0, 1, 2마디
- Timer: 1, 3, 5, 10, 15, 30, 60분
- Speed Trainer: 시작 BPM, 목표 BPM, 증가 단위, 증가 주기(마디) 설정
- Gap Trainer: N마디 재생 + M마디 묵음
- Random Mute: 0–80%, 박 단위 묵음

UX:
- 연습 모드는 기본적으로 꺼져 있다.
- 켜진 연습 모드는 상단에 작은 배지로 표시한다.
- 묵음 중에는 시각 비트를 유지하고 “묵음 훈련” 배지를 표시한다.
- Speed Trainer가 BPM을 변경할 때 작은 토스트로 알려준다.

완료 기준:
- Count-in 후 본 재생이 시작된다.
- Timer 종료 시 자동 정지한다.
- Speed Trainer는 지정 마디마다 BPM을 올린다.
- Gap Trainer는 지정 마디 동안 소리를 내지 않는다.
- Random Mute는 mute 확률 0일 때 일반 재생과 같고, 80일 때 대부분 묵음이다.

출력:
- 변경된 코드
- 연습 모드 상태 모델
- 수동 테스트 시나리오
```

## 13.6 6단계: 프리셋, 세트리스트, 로컬 저장, PWA

```md
6단계 작업을 시작하라. 저장 기능과 오프라인 사용성을 구현한다.

구현할 것:
- 현재 설정을 프리셋으로 저장
- 프리셋 이름 입력
- 프리셋 목록
- 프리셋 불러오기
- 프리셋 삭제 확인
- localStorage 저장/복구
- localStorage 파싱 실패 시 기본값 복구
- 세트리스트 MVP: 프리셋을 순서대로 담고 다음/이전 이동
- 설정 JSON 내보내기/가져오기
- PWA manifest
- 기본 service worker 또는 Vite PWA 플러그인 적용

완료 기준:
- 새로고침 후에도 프리셋이 남아 있다.
- 잘못된 JSON을 가져오면 사용자에게 오류를 보여주고 기존 설정은 유지한다.
- 세트리스트 다음/이전 버튼으로 프리셋이 바뀐다.
- 오프라인에서도 앱 shell이 열린다.

출력:
- 변경된 코드
- 저장 데이터 스키마
- 수동 테스트 방법
```

## 13.7 7단계: 접근성, 테스트, 최종 폴리싱

```md
7단계 작업을 시작하라. 접근성과 품질을 최종 점검하고 보완한다.

접근성:
- 모든 버튼/입력에 accessible name 확인
- focus-visible 스타일 추가
- aria-live는 재생/정지, BPM 변경, 프리셋 저장 정도만 알림
- 색만으로 상태를 전달하는 부분 제거
- reduced motion 대응
- 키보드만으로 모든 패널 조작 가능

테스트:
- tap tempo 단위 테스트
- rhythm progression 단위 테스트
- preset serialization 단위 테스트
- scheduler mock 테스트
- Playwright E2E: 첫 화면 → Start → BPM 변경 → Stop
- 모바일 viewport E2E: 360×740

폴리싱:
- 빈 상태 메시지
- 오류 토스트
- 도움말 모달
- 작은 설명 카피 정리
- 불필요한 기능/버튼 제거

완료 기준:
- 타입 오류 없음
- 테스트 통과
- 모바일/데스크톱 레이아웃 확인
- 키보드 조작 확인
- 접근성 라벨 확인
- 첫 화면이 여전히 단순함

출력:
- 변경된 코드
- 테스트 결과 요약
- 남은 한계와 추후 개선안
```

---

# 14. 검수·디버깅 프롬프트

## 14.1 UI 단순화 검수

```md
현재 메트로놈 웹앱 UI를 초보자 관점에서 검수하라.
첫 화면에 보이는 요소 중 “첫 박자를 재생하는 데 필요 없는 것”을 찾아 제거하거나 접힌 패널로 이동시켜라.
단, BPM, Start/Stop, Tap Tempo, ± 조절, 박자표, 시각 비트는 유지하라.
변경 전/후의 정보 구조를 비교해서 설명하고, 필요한 코드 변경을 적용하라.
```

## 14.2 오디오 타이밍 검수

```md
오디오 엔진이 setInterval 즉시 재생 방식이 아니라 AudioContext.currentTime 기준 예약 재생을 사용하고 있는지 검수하라.
다음을 확인하라:
- oscillator.start(when)을 사용하는가?
- nextNoteTime이 audioContext.currentTime과 별도로 관리되는가?
- lookahead scheduler가 다음 100ms 안의 노트를 미리 예약하는가?
- stop 시 interval과 예약 상태를 정리하는가?
문제가 있으면 수정하고, 40/120/240 BPM 테스트 방법을 제시하라.
```

## 14.3 Tap Tempo 검수

```md
Tap Tempo 로직을 검수하라.
요구사항:
- 2초 이상 탭 간격이 벌어지면 리셋
- 최근 4–8개 interval 사용
- 오탭 완화를 위해 중앙값 또는 절사 평균 사용
- 30–300 BPM clamp
- 숫자 입력 중 단축키 충돌 방지
단위 테스트를 추가하거나 보완하라.
```

## 14.4 접근성 검수

```md
WCAG 2.2 관점으로 메트로놈 웹앱을 검수하라.
특히 다음을 확인하라:
- 키보드만으로 모든 핵심 기능 사용 가능
- 포커스 표시 명확
- 버튼/입력 accessible name 존재
- 색만으로 상태 전달하지 않음
- 주요 터치 타깃 44×44 CSS px 이상
- reduced motion 대응
- aria-live가 과도하게 말하지 않음
문제를 발견하면 직접 수정하라.
```

## 14.5 모바일 사용성 검수

```md
360×740 모바일 viewport에서 한 손 사용성을 검수하라.
확인할 것:
- Play/Stop이 가장 쉽게 눌리는 위치에 있는가?
- Tap Tempo와 ± 버튼이 엄지 영역에 있는가?
- BPM 숫자가 충분히 큰가?
- 고급 패널이 첫 화면을 밀어내지 않는가?
- 가로 스크롤이 없는가?
문제가 있으면 레이아웃을 수정하라.
```

## 14.6 프리셋 저장 검수

```md
프리셋 저장/불러오기/삭제 로직을 검수하라.
확인할 것:
- localStorage 키 버전 관리
- JSON parse 실패 복구
- 삭제 전 확인
- 이름 중복 처리
- 현재 설정과 프리셋 스키마 일치
- 가져오기 실패 시 기존 데이터 보존
필요한 테스트를 추가하라.
```

---

# 15. 개발 중 의사결정 규칙

AI 코딩 도구가 선택해야 할 때는 다음 우선순위를 따른다.

1. **동작 안정성**이 디자인 화려함보다 우선이다.
2. **첫 화면 단순함**이 기능 노출보다 우선이다.
3. **정확한 오디오 스케줄링**이 쉬운 구현보다 우선이다.
4. **로컬 우선 저장**이 계정/서버 기능보다 우선이다.
5. **접근성**이 미세한 애니메이션보다 우선이다.
6. **테스트 가능한 순수 함수**가 거대한 컴포넌트보다 우선이다.
7. **MVP 완성**이 V2 기능 추가보다 우선이다.

---

# 16. 최종 산출물 체크리스트

- [ ] 첫 화면에서 120 BPM 4/4를 바로 시작할 수 있다.
- [ ] BPM을 입력, 버튼, 슬라이더, 탭 템포, 키보드로 바꿀 수 있다.
- [ ] Web Audio API 예약 스케줄러로 클릭을 재생한다.
- [ ] 4/4, 3/4, 6/8 등 기본 박자표가 동작한다.
- [ ] 세분박이 동작한다.
- [ ] 비트별 악센트 strong/normal/soft/mute가 동작한다.
- [ ] 카운트인과 타이머가 동작한다.
- [ ] Speed Trainer와 Gap Trainer가 동작한다.
- [ ] 프리셋 저장/불러오기/삭제가 동작한다.
- [ ] 모바일에서 조작하기 쉽다.
- [ ] 키보드만으로 핵심 기능을 사용할 수 있다.
- [ ] reduced motion 대응이 있다.
- [ ] localStorage 오류에 안전하다.
- [ ] 테스트가 있다.
- [ ] README에 실행 방법과 브라우저 오디오 제한이 설명되어 있다.

---

## 참고 출처

[^soundbrenner-play]: Soundbrenner, “The Metronome by Soundbrenner - Apps on Google Play,” https://play.google.com/store/apps/details?id=com.soundbrenner.pulse&hl=en
[^soundbrenner-manual]: Soundbrenner, “Manual The Metronome app,” https://www.soundbrenner.com/pages/manual-the-metronome-app
[^pro-metronome-play]: EUMLab, “Pro Metronome - Apps on Google Play,” https://play.google.com/store/apps/details?id=com.eumlab.android.prometronome&hl=en
[^metronome-beats]: Stonekick, “Online Metronome App | Metronome Beats,” https://stonekick.com/metronome.html
[^time-guru]: Adam Bellard, “Time Guru Metronome - Apps on Google Play,” https://play.google.com/store/apps/details?id=com.adambellard.timeguru&hl=en
[^tempo-frozenape]: Frozen Ape, “Tempo: The top paid metronome app on iOS,” https://www.frozenape.com/tempo-metronome.html
[^tempo-advance]: Apple App Store, “Tempo Advance - Metronome,” https://apps.apple.com/kr/app/tempo-advance-metronome/id368169363
[^tonalenergy]: TonalEnergy, “TonalEnergy Tuner & Metronome App - App Store,” https://apps.apple.com/tr/app/tonalenergy-tuner-metronome/id497716362
[^musicca]: Musicca, “Online metronome,” https://www.musicca.com/metronome
[^online-metronome]: OnlineMetronome.app, “Online Metronome With Time Signatures,” https://www.onlinemetronome.app/
[^mdn-webaudio]: MDN Web Docs, “Web Audio API,” https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
[^webdev-scheduling]: web.dev, “A tale of two clocks,” https://web.dev/articles/audio-scheduling
[^mdn-start]: MDN Web Docs, “AudioScheduledSourceNode: start() method,” https://developer.mozilla.org/en-US/docs/Web/API/AudioScheduledSourceNode/start
[^mdn-currenttime]: MDN Web Docs, “BaseAudioContext: currentTime property,” https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/currentTime
[^wcag22]: W3C, “Web Content Accessibility Guidelines (WCAG) 2.2,” https://www.w3.org/TR/WCAG22/
[^wcag-target]: W3C WAI, “Understanding SC 2.5.8: Target Size (Minimum),” https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
[^wcag-nontext]: W3C WAI, “Understanding SC 1.4.11: Non-text Contrast,” https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
[^reduced-motion]: MDN Web Docs, “prefers-reduced-motion,” https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
