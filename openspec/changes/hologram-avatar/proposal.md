# Proposal: Holographic Particle Avatar

## Intent

Mambru's current avatar is a static 32px CSS circle — it has no visual identity. Replace it with a holographic particle-based avatar (cyan glowing particles) that reacts to voice, displays emotions, and makes the assistant feel alive. This is the biggest visible differentiator for the app.

## Scope

### In Scope (Phase 1 — MVP)
- WebGL (Three.js) 3D particle system for hologram rendering (three styles: woman face, man face, ethereal sphere)
- Floating 3D widget overlay — positioned outside the layout, with fluid animation when chat opens/closes
- Smooth morphing transitions between avatar styles (particles reconfigure in motion, no sudden switch)
- Voice reactivity: audio level drives particle brightness/intensity
- Emotion reactivity: LLM-based emotion tags from assistant responses → avatar expressions (smile, serious, thinking, neutral)
- Music detection: when idle mic picks up music → loose dancing (Pragmata-style)
- Settings tab "Avatar": enable/disable, style selector, size adjust, position
- Image attachment button in chat input
- CSS tokens `--color-holo-*` added to design system

### Out of Scope (Phase 2+)
- Continuous VAD capture (backend streaming mode — Phase 2)
- Voice tone emotion analysis (Phase 3)
- Mouse/touch interaction with hologram (Phase 3)

## Capabilities

### New Capabilities
- `hologram-avatar`: Real-time 3D particle-based avatar rendered via WebGL (Three.js), reactive to voice amplitude and emotion state, with fluid morphing between styles

### Modified Capabilities
- `voice-input`: Add continuous capture mode toggle (always-listening VAD vs PTT). Currently PTT-only.
- `appearance-settings`: Extend from `{ theme: string }` to include avatar style, size, position, enable/disable

## Approach

**Phase 1**: WebGL (Three.js) 3D particle system, lazy-loaded via dynamic `import()`. Particles arranged as point cloud forming facial features, with noise-based flow-field for organic motion. Morphing between styles uses particle interpolation (each particle lerps to target position). Positioned as an overlay widget (fixed/absolute, outside `.chat-area` layout flow) with CSS transitions for show/hide fluidity. Audio level piped from `VoiceControls.svelte` rAF loop. Emotion tags extracted from LLM responses via backend `chat-done` event. Settings tab mirrors existing pattern (5 existing tabs → 6th "Avatar" tab).

**Music detection**: Frequency analysis via Web Audio API on mic input → detect sustained non-speech rhythmic patterns → trigger dance animation state.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/components/Chat.svelte` | Modified | Add floating hologram container + image button |
| `src/lib/components/MessageBubble.svelte` | Modified | Remove static avatar (or keep as fallback) |
| `src/lib/components/VoiceControls.svelte` | Modified | Add continuous/PTT toggle, expose audio level |
| `src/lib/components/Settings.svelte` | Modified | New "Avatar" tab with style/size/position controls |
| `src/lib/stores/settings.ts` | Modified | Extend AppearanceConfig with HologramConfig fields |
| `src/lib/stores/voice.ts` | Modified | Add emotion state, continuous mode flag |
| `src/lib/api/voice.ts` | Modified | Add continuous capture IPC + holo:emotion listener |
| `src/app.css` | Modified | Add `--color-holo-*` tokens + glow keyframes |
| `src-tauri/src/commands/voice.rs` | Modified | Add continuous capture commands |
| `src-tauri/src/voice/mod.rs` | Modified | Background mic thread with VAD auto-transcribe |
| `src-tauri/src/commands/chat.rs` | Modified | Emit emotion tag in chat-done payload |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| WebGL support in WebView2 | Low | WebGL 2.0 supported since Edge 91. Test early. |
| Three.js bundle size (~600KB) | Medium | Dynamic `import()` — only loads when hologram enabled |
| GPU perf on low-end | Medium | Offer quality slider + "disabled" fallback |
| Emotion inaccuracies | Low | Only show if confidence > threshold |
| Music detection false positives | Low | Require sustained rhythm before dance trigger |

## Rollback Plan

- Feature-flag the hologram: disabled by default until fully tested
- Remove `openspec/changes/hologram-avatar/` and revert file changes per affected-areas list
- Static CSS avatar remains as fallback — toggle via settings

## Dependencies

- Tauri v2 event system (already used for voice events — no new permissions needed)
- Three.js (lazy-loaded, not in critical path)
- Web Audio API (browser built-in, no extra deps)

## Success Criteria

- [ ] WebGL particle system renders at 60fps on target hardware
- [ ] Avatar reacts to audio level within 100ms
- [ ] Avatar displays correct emotion based on LLM tag
- [ ] Continuous voice mode captures and auto-submits via VAD
- [ ] Settings panel persists avatar style/size across restarts
- [ ] Music detection triggers dance animation within 2 seconds
