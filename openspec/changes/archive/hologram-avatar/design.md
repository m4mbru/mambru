# Design: Holographic Particle Avatar

## Technical Approach

Three.js particle system (lazy-loaded) rendered as a floating overlay widget. A TypeScript `HologramEngine` class manages the WebGL lifecycle, particle morphing, and reactivity. The Rust backend adds continuous voice capture + emotion event emission. A new Svelte component `HologramWidget.svelte` wraps the engine and slots into `Chat.svelte` as an overlay.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| Rendering engine | Three.js (BufferGeometry + Points) | Raw WebGL, PixiJS | Three.js handles WebGL boilerplate + shader compositing; raw WebGL is too low-level; PixiJS is 2D-focused |
| Load strategy | Dynamic `import('three')` | Static bundle | Three.js ~600KB; lazy load keeps initial chunk small |
| Positioning | Fixed overlay (position: fixed in Svelte wrapper) | In-layout, CSS absolute | Overlay does not affect layout reflow; CSS transitions for show/hide |
| Particle morphing | Per-particle lerp in vertex shader | CPU interpolation | GPU-side lerp is cheaper — no JS overhead per frame |
| Emotion pipeline | LLM tag → backend event `holo:emotion` → Svelte store | Frontend-only NLP, voice tone analysis | Uses existing LLM pipeline (zero new deps); works for both user & assistant |
| Music detection | Web Audio API AnalyserNode → FFT analysis | External library | Browser built-in; FFT can distinguish speech vs rhythmic patterns |
| Continuous capture | New IPC `start_continuous_capture` + background thread with VAD loop | Modify existing capture | Existing `start/stop_capture` is synchronous; continuous needs persistent thread + auto-transcribe |

## Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                     THREE.JS (lazy import)                        │
│  ┌────────────────────────────────────────────────────────┐      │
│  │  HologramEngine                                        │      │
│  │  ├─ Scene + Camera + Renderer                          │      │
│  │  ├─ ParticleSystem (Points + BufferGeometry)           │      │
│  │  ├─ MorphController (lerp target positions)            │      │
│  │  ├─ EmotionController (expression presets)             │      │
│  │  └─ DanceController (music-driven animation)           │      │
│  └──────────────┬─────────────────────────────────────────┘      │
└─────────────────┼────────────────────────────────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
    ▼             ▼             ▼
audioLevel   emotion       styleChange
 (rAF loop)   (event)       (settings)

 ┌──────────┐   ┌───────────┐   ┌───────────┐
 │ VoiceCtrl│   │ Rust Back │   │ Settings  │
 │ .svelte  │   │ end       │   │ .svelte   │
 │ audioLvl │   │ holo:emo  │   │ style=    │
 └──────────┘   └───────────┘   └───────────┘

Backend capture flow (continuous):
  Mic ──→ cpal chunks ──→ VAD ──→ speech-end? ──→ STT (whisper)
                                                     │
                                          transcription ──→ chat message
                                          `voice:transcribed` event ──→ frontend
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/components/HologramWidget.svelte` | Create | Main widget wrapper: canvas + overlay positioning + Three.js lazy init |
| `src/lib/hologram/HologramEngine.ts` | Create | Three.js engine: scene, camera, particle system, render loop |
| `src/lib/hologram/particles.ts` | Create | Particle geometry + morph targets per style (woman, man, sphere) |
| `src/lib/hologram/emotions.ts` | Create | Expression presets for each emotion (particle positions, colors) |
| `src/lib/hologram/dance.ts` | Create | Music-driven dance animation controller |
| `src/lib/hologram/audioReactivity.ts` | Create | Bridges audioLevel + emotion store to Three.js state |
| `src/lib/stores/hologram.ts` | Create | Svelte store for hologram state: enabled, style, size, position, emotion |
| `src/lib/components/Chat.svelte` | Modify | Add `<HologramWidget>` + image button in input area |
| `src/lib/components/VoiceControls.svelte` | Modify | Add continuous/PTT toggle; expose `audioLevel` as store |
| `src/lib/components/Settings.svelte` | Modify | Add "Avatar" tab (6th tab) with style, size, position, on/off |
| `src/lib/stores/settings.ts` | Modify | Extend types: `HologramConfig`, `VoiceMode` |
| `src/lib/stores/voice.ts` | Modify | Add `emotion` field, `continuousMode` flag |
| `src/lib/api/voice.ts` | Modify | Add `start_continuous_capture`, `stop_continuous_capture` IPC + `holo:emotion` listener |
| `src/app.css` | Modify | Add `--color-holo-primary`, `--color-holo-glow`, `--holo-size` tokens |
| `src-tauri/src/commands/voice.rs` | Modify | Add `start_continuous_capture` / `stop_continuous_capture` IPC handlers |
| `src-tauri/src/voice/mod.rs` | Modify | Add continuous capture background thread with VAD loop |
| `src-tauri/src/commands/chat.rs` | Modify | Emit emotion tag in `chat-done` event payload |

## Interfaces / Contracts

```typescript
// Store types
interface HologramConfig {
  enabled: boolean;
  style: 'woman' | 'man' | 'sphere';
  size: number;            // 100–400, canvas dimension
  position: 'floating' | 'minimal' | 'panel';
}

interface EmotionState {
  emotion: 'happy' | 'sad' | 'thinking' | 'neutral' | 'speaking';
  confidence: number;
}

// Tauri events (backend → frontend)
// event: 'holo:emotion', payload: { emotion: string, confidence: number }
// event: 'voice:transcribed', payload: string (existing, reused)
```

```rust
// New IPC commands
#[tauri::command]
async fn start_continuous_capture(app: State<'_>) -> Result<(), String>;

#[tauri::command]
async fn stop_continuous_capture(app: State<'_>) -> Result<(), String>;
```

```typescript
// New frontend IPC wrappers
export async function startContinuousCapture(): Promise<void>;
export async function stopContinuousCapture(): Promise<void>;
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | HologramEngine init/destroy | Vitest + jsdom — verify Three.js scene created |
| Unit | MorphController lerp math | Vitest — verify particle positions interpolate |
| Unit | Audio reactivity thresholds | Vitest — verify brightness scales with input |
| Unit | Emotion→expression mapping | Vitest — verify correct preset chosen |
| Integration | Continuous capture flow | Backend test: start → speak → silence → auto-transcribe |
| Integration | Tauri events flow | Mock IPC: emit holo:emotion → verify store updates |
| E2E | Widget show/hide transitions | Playwright — verify CSS transitions fire |

## Open Questions

- [ ] Will Three.js `PointsMaterial` support per-particle colors for emotion effects? (Likely yes via `vertexColors`)
- [ ] Does the WebView2 on the user's machine support WebGL 2.0? (Yes since Edge 91, but verify during implementation)
- [ ] What is the FFT frequency range for reliable music vs speech distinction? (Tuning needed during implementation)
