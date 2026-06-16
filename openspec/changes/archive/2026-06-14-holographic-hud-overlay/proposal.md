# Proposal: Holographic HUD Overlay

## Intent

Replace Mambru's traditional desktop UI (sidebar + header + chat) with a fullscreen holographic HUD overlay. The app becomes a transparent overlay window — no chrome, no window borders — with a female digital human head at center, surrounded by orbiting holographic data panels. Clicking a panel expands it with fluid animation for full interaction.

## Scope

### In Scope
- Transparent overlay window (Tauri, no chrome, no click-through)
- Female digital human head as central hologram (Three.js, particle-based, reference image style)
- 4 orbital holographic panels: Chat, Settings, System Info, Comandos
- Panel expansion animation (click → expand center → fluid transition)
- Navigation back to orbital view (back button or click outside)
- Monochromatic blue/cyan holographic aesthetic
- Neural network geometry lines + node particles connecting the composition

### Out of Scope
- Alternative traditional UI mode — the overlay IS the app
- Layer-style overlay (option 2, deferred)
- Automatic continuous animations (idle particle motion only)
- Voice reactivity, music detection, emotion expressions (from current spec — may be re-added later)
- Audio reactivity, dance mode

## Capabilities

### Modified Capabilities
- `hologram-avatar`: Changes from a floating widget overlay ON the chat to being the CENTERPIECE of the fullscreen HUD. The particle-based female head is the focal point. Emotion reactivity, dance, voice reactivity are removed/simplified. New geometry: neural network nodes + connection lines orbiting the head.

### New Capabilities
- `holographic-hud`: The fullscreen HUD container — transparent window, orbital panel system, panel expansion/navigation, background neural network geometry.
- `system-info-panel`: System info + AI model status panel.
- `comandos-panel`: Quick commands/actions panel.

## Approach

1. **Tauri window**: Configure transparent, frameless, always-on-top window. No click-through.
2. **Three.js scene**: Fullscreen WebGL canvas as app background. Central female head (particle-based, ref: reference image). Neural network geometry (nodes + connection lines) in background. Orbital panel positions calculated in 3D space.
3. **Svelte overlay panels**: HTML/CSS panels positioned via Three.js projection (3D → screen coords) or fixed CSS positions matching the 3D layout. Each panel is a Svelte component.
4. **Panel expansion**: On click, CSS transform + transition scales the panel to center, dims others, shows close button.
5. **Existing code**: Repurpose HologramEngine particles; remove emotion/dance/audio reactivity. App.svelte becomes the HUD shell instead of header+sidebar+chat.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src-tauri/tauri.conf.json` | Modified | Transparent, frameless window config |
| `src/App.svelte` | Rewritten | HUD shell replaces traditional layout |
| `src/lib/hologram/HologramEngine.ts` | Modified | Simplified: female head only, neural network geometry |
| `src/lib/components/HologramWidget.svelte` | Rewritten | Becomes the main HUD container |
| `src/lib/components/Chat.svelte` | Modified | Adapt to panel expansion pattern |
| `src/lib/components/Settings.svelte` | Modified | Adapt to panel expansion pattern |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Transparent window issues on Windows | Medium | Test early with minimal Tauri config |
| Three.js perf on fullscreen WebGL | Medium | Particle count auto-quality, lazy load |
| Keyboard/click interference with desktop | Low | No click-through, capture all input |
| Existing tests break | High | Run `npm test` after each change |

## Rollback Plan

Revert `tauri.conf.json` window config. Restore `App.svelte`, `HologramWidget.svelte` from git. Drop `openspec/changes/holographic-hud-overlay/`.

## Dependencies

- Tauri v2 transparent window support (Windows)

## Success Criteria

- [ ] App launches as transparent overlay — no window chrome visible
- [ ] Female digital human head renders as central 3D hologram
- [ ] 4 orbital panels visible (Chat, Settings, System Info, Comandos)
- [ ] Click panel → expands center with animation
- [ ] Click outside/back → returns to orbital view
- [ ] All existing functionality accessible (chat, settings, etc.)
- [ ] `npm test` passes
