# Holographic HUD Specification

## Purpose

The holographic HUD is Mambru's fullscreen interface — a transparent overlay window containing a Three.js WebGL scene with a female digital human head at center, neural network geometry, and orbiting holographic panels. Replaces the traditional desktop UI entirely.

## Requirements

### Requirement: Transparent Overlay Window

The system MUST launch as a transparent, frameless, always-on-top window with no window chrome or borders.

#### Scenario: Window loads as overlay

- GIVEN the application starts
- WHEN the Tauri window initialises
- THEN the window MUST be transparent (alpha channel enabled)
- AND frameless (no title bar, no borders)
- AND always-on-top
- AND covering the full screen or a custom size

#### Scenario: No click-through

- GIVEN the transparent overlay is visible
- WHEN the user clicks anywhere on the overlay
- THEN the click MUST be captured by the app
- AND NOT pass through to the desktop or underlying windows

### Requirement: WebGL HUD Scene

The system MUST render a fullscreen Three.js scene as the HUD background, with particles, neural network geometry, and orbital panel zones.

#### Scenario: Scene initialises on launch

- GIVEN the application starts
- WHEN the window is ready
- THEN a Three.js WebGL canvas MUST fill the entire window
- AND render a dark navy background (`#1A1D31`)
- AND display a particle-based female head at screen center
- AND display neural network geometry (nodes + connection lines) surrounding the head
- AND display empty orbital panel zones (placeholders for Svelte panels)

#### Scenario: Three.js lazy-loaded

- GIVEN the app starts
- WHEN WebGL initialises
- THEN Three.js MUST be loaded via dynamic `import()`
- AND the initial window show MUST NOT be delayed by the import

### Requirement: Neural Network Geometry

The HUD MUST display a network of interconnected nodes and lines orbiting the central head.

#### Scenario: Geometry renders

- GIVEN the WebGL scene is active
- WHEN the scene renders
- THEN nodes SHALL be small glowing points distributed in a spherical shell around the head
- AND connection lines SHALL connect nearby nodes (additive blending, cyan colour `#00BCD4`)
- AND nodes SHALL have a subtle slow pulsing animation

### Requirement: Panel Navigation

The system MUST support expanding an orbital panel to full interaction mode and returning to orbital view.

#### Scenario: Click panel to expand

- GIVEN the user is viewing the orbital HUD
- WHEN they click on a holographic panel
- THEN the panel SHALL expand to the center with a fluid CSS/animation transition
- AND the other panels SHALL dim or fade to the background
- AND the central head SHALL remain visible but dimmed

#### Scenario: Return to orbital view

- GIVEN a panel is expanded
- WHEN the user clicks a close/back button or clicks outside the panel
- THEN the panel SHALL collapse back to its orbital position
- AND the other panels SHALL return to full visibility
- AND the central head SHALL return to full brightness

### Requirement: Keyboard Shortcuts

The system SHOULD support keyboard navigation as an alternative to clicking panels.

#### Scenario: Cycle panels

- GIVEN the HUD is in orbital view
- WHEN the user presses a configurable key (e.g., Tab)
- THEN the focus cycles through available panels
- AND the focused panel highlights briefly

### Requirement: Performance

#### Scenario: Auto-quality adjustment

- GIVEN the WebGL scene is rendering
- WHEN FPS drops below 30 for 2+ seconds
- THEN particle count SHALL reduce by 25%
- AND glow/post-processing effects SHALL be disabled
