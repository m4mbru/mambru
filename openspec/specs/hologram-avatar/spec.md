# Hologram Avatar Specification

## Purpose

Particle-based female digital human head that serves as Mambru's visual identity at the center of the fullscreen holographic HUD.

## Requirements

### R1: WebGL Female Head

The particle system now renders a female digital human head instead of generic face shapes.

#### Scenario: Female head is default

- GIVEN the HUD is active
- WHEN the WebGL scene initialises
- THEN the central particle system SHALL form a recognisable female face silhouette
- AND the face SHALL be constructed from glowing cyan/white data points
- AND SHALL match the reference image style (digitalised, luminous, data-point construction)

#### Scenario: Styles removed

- GIVEN the HUD is active
- WHEN style selection was available in the old spec
- THEN the system SHALL only offer one style (female head)
- AND the style selector SHALL be removed from Settings

### R3: Silhouette Rendering

The system MUST render a recognizable human face silhouette as part of the central HUD.

#### Scenario: Profile view

- GIVEN default settings
- WHEN the HUD loads
- THEN a female face silhouette SHALL be visible from the particle cloud
- AND the silhouette SHALL match the female head reference style

### R4: Performance

The system MUST maintain 60 FPS on modern hardware.

#### Scenario: Performance budget

- GIVEN the avatar is active
- WHEN rendering
- THEN the particle system MUST use WebGL via Three.js
- AND the render loop SHOULD use requestAnimationFrame
- AND particle auto-quality adjustment is handled by the holographic-hud spec

#### Scenario: Disabling

- GIVEN the user prefers performance
- WHEN they toggle the avatar off
- THEN the WebGL scene MUST continue rendering (HUD remains active)
- BUT the avatar opacity SHALL reduce to minimum

## Technical Approach

- WebGL via Three.js, rendered as part of the fullscreen HUD scene
- Particle positions calculated from sampled female head reference geometry
- Perlin noise library for organic floating movement
- Audio reactivity, emotion expressions, and dance features removed in this change
- Settings: avatar enable/disable, size relative to viewport (managed by user-settings)
- The avatar is the fixed centerpiece of the HUD, not a floating overlay
