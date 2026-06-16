# Tasks: Holographic Particle Avatar

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1200–1800 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: Backend + Stores → PR 2: Three.js Engine → PR 3: UI Widgets |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No (user chose feature-branch-chain)
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Backend: continuous capture + emotion events + stores | PR 1 | Branch `feat/hologram-backend`; base = `feature/hologram-avatar` |
| 2 | Three.js engine: particles, morphing, emotions, dance | PR 2 | Branch `feat/hologram-engine`; base = `feat/hologram-backend` |
| 3 | Frontend: HologramWidget, Settings tab, Chat image btn | PR 3 | Branch `feat/hologram-ui`; base = `feat/hologram-engine` |

## Phase 1: Foundation (Stores + Types)

- [ ] 1.1 Create `src/lib/stores/hologram.ts` — HologramState store (enabled, style, size, position, emotion)
- [ ] 1.2 Extend `src/lib/stores/settings.ts` — add HologramConfig interface, persist logic
- [ ] 1.3 Extend `src/lib/stores/voice.ts` — add `emotion`, `continuousMode` fields
- [ ] 1.4 Add `--color-holo-primary`, `--color-holo-glow`, `--holo-size` to `src/app.css`

## Phase 2: Three.js Engine

- [ ] 2.1 Create `src/lib/hologram/HologramEngine.ts` — Three.js scene, camera, renderer, lifecycle
- [ ] 2.2 Create `src/lib/hologram/particles.ts` — BufferGeometry + Points, morph target positions for 5 styles
- [ ] 2.3 Create `src/lib/hologram/emotions.ts` — expression presets (smile, serious, thinking, neutral)
- [ ] 2.4 Create `src/lib/hologram/dance.ts` — Web Audio API FFT analysis → dance animation
- [ ] 2.5 Create `src/lib/hologram/audioReactivity.ts` — bridge voice store audioLevel to particle brightness

## Phase 3: Frontend Components

- [ ] 3.1 Create `src/lib/components/HologramWidget.svelte` — overlay wrapper, lazy Three.js import, show/hide CSS transitions
- [ ] 3.2 Modify `src/lib/components/Chat.svelte` — add HologramWidget + image button
- [ ] 3.3 Modify `src/lib/components/Settings.svelte` — add "Avatar" tab (6th tab) with style, size, position, on/off

## Phase 4: Backend (Rust)

- [ ] 4.1 Add `start_continuous_capture` / `stop_continuous_capture` IPC in `commands/voice.rs`
- [ ] 4.2 Add continuous capture background thread in `voice/mod.rs` — cpal + VAD loop + auto-transcribe
- [ ] 4.3 Modify `commands/chat.rs` — emit emotion tag in `chat-done` payload from LLM response
- [ ] 4.4 Add `voice:emotion` and `holo:emotion` Tauri event listeners in `api/voice.ts`

## Phase 5: Testing

- [ ] 5.1 Test HologramEngine init/destroy lifecycle
- [ ] 5.2 Test morph target interpolation math
- [ ] 5.3 Test emotion→expression mapping
- [ ] 5.4 Test continuous capture flow (mock backend)

## Phase 6: Polish

- [ ] 6.1 Remove old static avatar from MessageBubble (or keep as fallback)
- [ ] 6.2 Verify 60fps on target hardware, auto-quality adjustment
