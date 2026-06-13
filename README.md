# Pulse

Pulse is a mobile-first metronome web app built with React, TypeScript, Vite, Tailwind CSS, and the Web Audio API.

## Run

```bash
npm install
npm run dev
```

## Test

```bash
npm test
npm run build
```

## Features

- BPM 30-300 with direct input, slider, +/- buttons, long press, tap tempo, and vertical drag on the BPM number
- 1/4, 2/4, 3/4, 4/4, 5/4, 6/8, 7/8, 12/8
- Subdivisions: none, eighth, triplet, sixteenth
- Per-beat accents: strong, normal, soft, mute
- Count-in, timer, speed trainer, gap trainer, random mute
- Presets, setlists, JSON import/export
- Dark/light/system theme, mute visual mode, flash, haptics, wake lock
- PWA manifest and service worker for offline app-shell use

## Shortcuts

- `Space`: play / stop
- `T`: tap tempo
- `ArrowUp` / `ArrowDown`: +/- 1 BPM
- `Shift + ArrowUp` / `Shift + ArrowDown`: +/- 5 BPM
- `Esc`: close sheet
- `?`: shortcut help

## Audio Architecture

Pulse does not loop audio files. It uses a Web Audio lookahead scheduler:

- A Web Worker posts a `tick` every 25 ms.
- The main thread schedules clicks against `AudioContext.currentTime`.
- Notes are scheduled 100 ms ahead with `osc.start(when)`.
- Scheduled notes are also pushed into a visual queue.
- `requestAnimationFrame` reads the audio clock and updates the pulse/dots when queued notes pass.

The first play gesture creates or resumes `AudioContext` and plays a silent buffer to unlock mobile audio. The Screen Wake Lock API is requested while playing when supported.

## Mobile Browser Limits

Mobile browsers can still limit audio in background tabs, during battery saving, or when iOS silent mode is active. Pulse keeps scheduling precise while the page is active and gracefully ignores unsupported haptics or wake-lock APIs.
