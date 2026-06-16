# Tasks: holographic-hud-overlay

## Review Workload Forecast

- **Estimated changed lines**: ~870
- **800-line budget risk**: High — exceeds the 800-line limit
- **Decision**: Use `force-chained` with `feature-branch-chain` strategy (already selected)
- **PR split**: 3 chained PRs targeting a tracker branch

## PR Split Plan

```
feature/holographic-hud (tracker branch — merges to main)
├── PR #1: Foundation  (~290 lines)  → targets tracker
├── PR #2: Panel System (~280 lines)  → targets previous PR
└── PR #3: Panel Content (~300 lines) → targets previous PR
```

Each PR is independently reviewable and under 400 lines.

---

## PR #1: Foundation — Tauri Window + Three.js Scene  ✅ (COMPLETE)

### 1.1 Tauri Window Configuration

- [x] Modify `src-tauri/tauri.conf.json` for transparent frameless overlay

**Files:**
- `src-tauri/tauri.conf.json`

**Acceptance:**
- Window is transparent, frameless, always-on-top
- App launches without chrome
- No click-through

### 1.2 Simplify HologramEngine

- [x] Modify `src/lib/hologram/HologramEngine.ts`

**Files:**
- `src/lib/hologram/HologramEngine.ts`

**Acceptance:**
- Engine initialises without emotion/dance/audio features
- Particle system renders a face shape
- No console errors on load

### 1.3 FemaleHead.ts — Female Particle Geometry

- [x] Create `src/lib/hologram/FemaleHead.ts`

**Files:**
- `src/lib/hologram/FemaleHead.ts` (new)

**Acceptance:**
- Particles form recognisable female head shape
- Colours transition white → cyan
- Compatible with existing PointsMaterial

### 1.4 NeuralNetwork.ts — Network Geometry

- [x] Create `src/lib/hologram/NeuralNetwork.ts`

**Files:**
- `src/lib/hologram/NeuralNetwork.ts` (new)
- `src/lib/hologram/index.ts` (update exports)

**Acceptance:**
- Nodes and lines render in scene
- Pulse animation visible
- No performance degradation

### 1.5 App.svelte — HUD Shell

- [x] Rewrite `src/App.svelte`

**Files:**
- `src/App.svelte`

**Acceptance:**
- App renders HUD shell instead of traditional UI
- Error boundary still works
- Keyboard shortcuts still functional
- `npm test` passes

---

## PR #2: Panel System — Orbital Panels + Navigation  ✅ (COMPLETE)

### 2.1 HologramHud.svelte — Main HUD Container

- [x] Rewrite from existing `HologramWidget.svelte`
- [x] Fullscreen canvas for Three.js scene
- [x] Panel zone management (4 orbital positions)
- [x] Import and initialise: HologramEngine, NeuralNetwork, FemaleHead
- [x] State machine for orbital/expanded/collapsing

**Files:**
- Rename `src/lib/components/HologramWidget.svelte` → `src/lib/components/HologramHud.svelte`
- Update imports in App.svelte

**Acceptance:**
- Fullscreen WebGL canvas renders
- Neural network + female head visible
- Panel zone placeholders visible

### 2.2 HudState Store

- [x] Create or extend a store for HUD navigation state

**Files:**
- `src/lib/stores/hud.ts` (new)

**Acceptance:**
- Store initialises in 'orbital' mode
- `expandPanel` transitions state correctly
- `collapsePanel` returns to orbital

### 2.3 OrbitalPanel.svelte — Reusable Panel Shell

- [x] Create reusable orbital panel wrapper

**Files:**
- `src/lib/components/OrbitalPanel.svelte` (new)

**Acceptance:**
- Panel renders at correct orbital position
- Click triggers expansion animation
- Shows close button when expanded
- Collapse animation works smoothly

### 2.4 HudControls.svelte — Navigation Controls

- [x] Create HUD control overlay

**Files:**
- `src/lib/components/HudControls.svelte` (new)

**Acceptance:**
- Close button appears on expanded panels
- Escape key collapses expanded panel

---

## PR #3: Panel Content — Chat, Settings, System Info, Comandos

### 3.1 ChatPanel.svelte — Chat in HUD

- [x] Create wrapper that renders Chat.svelte inside an expanded OrbitalPanel

**Files:**
- `src/lib/components/ChatPanel.svelte` (new)
- `src/lib/components/Chat.svelte` (modify: add `panelMode` prop, remove sidebar toggle)

**Acceptance:**
- Chat works in expanded panel
- Streaming, Markdown, conversation switching all functional
- No visual regressions

### 3.2 SettingsPanel.svelte — Settings in HUD

- [x] Create wrapper that renders Settings.svelte inside an expanded OrbitalPanel

**Files:**
- `src/lib/components/SettingsPanel.svelte` (new)
- `src/lib/components/Settings.svelte` (modify: add `panelMode` prop)

**Acceptance:**
- All settings sections available in panel
- Settings persist on close
- Avatar section shows size slider (relative to viewport)

### 3.3 SystemInfoPanel.svelte — New System Info

- [x] Create system info panel content

**Files:**
- `src/lib/components/SystemInfoPanel.svelte` (new)
- `src-tauri/src/commands/system_info.rs` (new, optional — can start with static/hardcoded data)

**Acceptance:**
- Shows system and model info
- Data refreshes periodically
- Links to Settings if no provider configured

### 3.4 ComandosPanel.svelte — Commands Panel

- [x] Create commands panel content

**Files:**
- `src/lib/components/ComandosPanel.svelte` (new)

**Acceptance:**
- Shows available commands
- Search filters in real time
- Clicking a command executes it
- Integrates with existing command system

### 3.5 DownloadDialog — Keep Unchanged

- [x] The existing DownloadDialog.svelte stays as-is

---

## Dependencies Between PRs

```
PR #1 (Foundation) → no dependencies
PR #2 (Panel System) → depends on PR #1 (needs HUD shell + 3D scene)
PR #3 (Panel Content) → depends on PR #2 (needs panel system to render into)
```

## Testing

- `npm test` must pass after each PR
- New components should have basic smoke tests
- Three.js components are visually tested (manual review)
