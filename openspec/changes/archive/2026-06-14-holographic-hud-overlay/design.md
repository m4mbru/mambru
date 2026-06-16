# Design: Holographic HUD Overlay

## Architecture Overview

```
┌──────────────────────────────────────────────────┐
│                 Tauri Window                      │
│  transparent · frameless · always-on-top          │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │         Three.js WebGL Canvas (fullscreen)    │ │
│  │  ┌────────────────────────────────────────┐  │ │
│  │  │  Background: dark navy (#1A1D31)       │  │ │
│  │  │  ┌──────┐  Neural network geometry     │  │ │
│  │  │  │ Head │  (nodes + lines, orbiting)   │  │ │
│  │  │  │(3D)  │                             │  │ │
│  │  │  └──────┘                             │  │ │
│  │  │  ┌──┐ ┌──┐ ┌──┐ ┌──┐  Orbital panels │  │ │
│  │  │  │C │ │S │ │SI│ │Cm│  (3D positions)  │  │ │
│  │  │  └──┘ └──┘ └──┘ └──┘                 │  │ │
│  │  └────────────────────────────────────────┘  │ │
│  │                                                │ │
│  │  ┌────────────────────────────────────────┐  │ │
│  │  │    Svelte Panel Overlay (positioned)    │  │ │
│  │  │  ┌──────────┐ ┌──────────┐            │  │ │
│  │  │  │ Chat     │ │ Settings │  ...        │  │ │
│  │  │  │ component│ │ component│            │  │ │
│  │  │  └──────────┘ └──────────┘            │  │ │
│  │  └────────────────────────────────────────┘  │ │
│  └──────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

### Layer Separation

| Layer | Tech | Responsibility |
|-------|------|----------------|
| Window | Tauri (rust) | Transparent, frameless, always-on-top |
| 3D Scene | Three.js | Head particle system, neural geometry, orbital markers |
| Panel Shell | Svelte | Orbital panel positioning, expansion/collapse |
| Panel Content | Svelte | Chat, Settings, System Info, Comandos components |
| State | Svelte stores | conversation, settings, hologram — unchanged |

### Key Design Decision: 3D positions → 2D panel mapping

The orbital panels exist conceptually in 3D space around the head, but the actual HTML/Svelte panels are positioned using CSS transforms projected from 3D coordinates via Three.js `Vector3.project()`. This gives us:
- Panels stay aligned with the 3D scene
- When the camera rotates (subtle), panels move accordingly
- We can use CSS transitions for smooth expansion/collapse

## Component Tree

```
App.svelte                         ← HUD shell (replaces current App)
├── HologramHud.svelte             ← Main HUD container (new)
│   ├── <canvas> (Three.js)        ← Fullscreen WebGL
│   ├── NeuralNetwork.ts           ← Nodes + connection lines (Three.js)
│   ├── FemaleHead.ts             ← Particle-based female head (Three.js)
│   ├── OrbitalPanel.svelte       ← Reusable orbital panel wrapper
│   │   ├── ChatPanel.svelte      ← Chat (expands Chat.svelte)
│   │   ├── SettingsPanel.svelte  ← Settings (expands Settings.svelte)
│   │   ├── SystemInfoPanel.svelte ← System info (new)
│   │   └── ComandosPanel.svelte  ← Commands (new)
│   └── HudControls.svelte        ← Close/nav controls
├── Chat.svelte                   ← Existing (adapted)
├── Settings.svelte               ← Existing (adapted)
├── DownloadDialog.svelte         ← Existing (unchanged)
```

### File Changes Summary

| File | Action |
|------|--------|
| `src-tauri/tauri.conf.json` | Modify: transparent, decorations: false, alwaysOnTop |
| `src/App.svelte` | Rewrite: becomes thin HUD shell |
| `src/lib/components/HologramWidget.svelte` | Rewrite: becomes HologramHud.svelte |
| `src/lib/hologram/HologramEngine.ts` | Modify: female head only, add neural network, remove emotions/dance/audio |
| `src/lib/hologram/NeuralNetwork.ts` | New: nodes + connection lines |
| `src/lib/hologram/FemaleHead.ts` | New: female particle head geometry |
| `src/lib/components/OrbitalPanel.svelte` | New: reusable orbital panel shell |
| `src/lib/components/ChatPanel.svelte` | New: wraps Chat.svelte for HUD |
| `src/lib/components/SettingsPanel.svelte` | New: wraps Settings.svelte for HUD |
| `src/lib/components/SystemInfoPanel.svelte` | New: system info + AI status |
| `src/lib/components/ComandosPanel.svelte` | New: command list/execution |
| `src/lib/components/HudControls.svelte` | New: close, nav buttons |
| `src/lib/components/Chat.svelte` | Modify: remove sidebar toggle, add panel-aware mode |
| `src/lib/components/Settings.svelte` | Modify: remove slideover mode, add panel-aware mode |

## Three.js Scene Layout

```
              ┌────── Panel 4 ──────┐
             ╱                       ╲
            ╱                         ╲
    ┌── Panel 1 ──┐             ┌── Panel 3 ──┐
    │  (Chat)      │  ┌──────┐  │  (Settings)  │
    │              │  │ HEAD │  │              │
    └──────────────┘  │      │  └──────────────┘
                      │  ♀   │
                     ╱│      │╲
                    ╱ └──────┘ ╲
                   ╱             ╲
              ┌── Panel 2 ──┐ ┌── Panel 4 ──┐
              │ (SysInfo)   │ │ (Comandos)   │
              └──────────────┘ └──────────────┘
```

- Head at origin (0, 0, 0), scale ~40% of viewport height
- Panels at radius ~1.2 units from center, equiangular distribution
- Neural network nodes at radius 0.6-0.8 units (closer than panels)
- Camera: perspective, distance ~2.2 units, slight angle down

### Neural Network Geometry

- 100-150 nodes distributed in a spherical shell
- Connection lines between nodes within a distance threshold
- Nodes pulse with subtle sine wave opacity/scale
- Additive blending, cyan (#00BCD4), opacity 0.3-0.6

### Female Head Particle System

- ~8000-12000 particles forming a female face silhouette
- Colours: white at center → cyan at edges
- Gentle ambient rotation (Y axis, very slow)
- Slight floating motion (sine wave, amplitude 0.01-0.02)

## Panel Expansion Animation

### Orbital → Expanded

```
State: ORBITAL
  Panel: small card floating in 3D position
  Other panels: full opacity
  Head: full brightness

User clicks panel → TRANSITION (300-400ms, cubic-bezier)
  1. Panel scales from orbital size → centerscreen (~90% vh/vw)
  2. Other panels: opacity → 0.15, pointer-events: none
  3. Head: opacity → 0.3, rotation pause
  4. Close button fades in (top-right of expanded panel)

State: EXPANDED
  Panel: full center, interactive
  Other panels: dimmed, non-interactive
  Head: dimmed
```

### Expanded → Orbital

```
User clicks close/Escape → TRANSITION (250ms, ease-in-out)
  1. Panel scales centerscreen → orbital position
  2. Other panels: opacity → 1.0
  3. Head: opacity → 1.0, rotation resumes
  4. Close button fades out
```

Implementation: CSS `transform` + `opacity` transitions on the orbital panel elements. No Three.js involvement in the transition itself.

## Tauri Window Configuration

```json
{
  "windows": [
    {
      "label": "main",
      "fullscreen": true,
      "decorations": false,
      "transparent": true,
      "alwaysOnTop": true,
      "focus": true,
      "skipTaskbar": false
    }
  ]
}
```

### Platform Notes (Windows)
- `decorations: false` + `transparent: true` removes all chrome
- Tauri v2 supports per-monitor DPI awareness for transparent windows
- No `click-through` — overlay captures all input
- Alt+F4 should close; add a `Ctrl+Q` shortcut as fallback

## Data Flow

```
                    ┌──────────────────┐
                    │  Svelte Stores   │
                    │  conversation    │
                    │  settings        │
                    │  models          │
                    │  hologram        │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ChatPanel │  │Settings  │  │SystemInfo│
        │component │  │component │  │component │
        └──────────┘  └──────────┘  └──────────┘
```

- All existing stores remain unchanged
- SystemInfoPanel gets a new store or reads from Tauri IPC (Rust commands)
- ComandosPanel reads from existing `custom-commands` registry
- Three.js engine reads `hologram` store for size/visibility settings only

## State Machine

```
ORBITAL → (click panel) → EXPANDING → EXPANDED → (close) → COLLAPSING → ORBITAL
```

- `ORBITAL`: all panels visible at orbital positions, head full
- `EXPANDING`: animation in progress (300-400ms)
- `EXPANDED`: one panel is full-center, interactive
- `COLLAPSING`: animation in progress (250ms)

Managed by a Svelte store `hudState`:

```ts
interface HudState {
  mode: 'orbital' | 'expanding' | 'expanded' | 'collapsing';
  activePanel: 'chat' | 'settings' | 'system-info' | 'comandos' | null;
}
```

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Transparent window shows desktop artifacts | Test with solid background first, add fallback non-transparent mode |
| Three.js WebGL perf on integrated GPUs | Particle budget auto-reduce, skip post-processing |
| Panel content (Chat) needs repositioning | Chat component receives a `panelMode` prop; adapts layout internally |
| Keyboard shortcuts conflict with desktop | Use `Ctrl+` prefix for all Mambru shortcuts, document them |

## Rollback

Restore `App.svelte`, `HologramWidget.svelte`, `src-tauri/tauri.conf.json` from git. Delete new files. `npm test` must pass before merge.
