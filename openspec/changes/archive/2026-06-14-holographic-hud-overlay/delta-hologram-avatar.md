# Delta: hologram-avatar

## Change Type

Modified — the hologram avatar changes from a floating widget overlay to the centerpiece of the fullscreen HUD.

## Removed Requirements

| ID | Reason |
|----|--------|
| R2 (Floating Widget Positioning) | No longer a floating widget — now a fixed centerpiece of the HUD |
| R3 (Voice Reactivity) | Deferred; the HUD does not include audio reactivity in this change |
| R4 (Emotion Reactivity) | Deferred; emotion expressions removed in this change |
| R5 (Music Detection) | Deferred; dance/music reactivity removed in this change |
| R7 (Auto-quality) | Moved to `holographic-hud` spec |

## Modified Requirements

### R1: WebGL Particle System → WebGL Female Head

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

### R6: Three.js Lazy Loading → Moved to holographic-hud spec

Lazy loading behaviour unchanged but now specified in `holographic-hud` spec.
