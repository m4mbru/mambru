# Hologram Avatar Specification

## Purpose

Real-time 3D particle-based hologram rendered via WebGL (Three.js). Serves as Mambru's visual identity — a floating widget composed of cyan glowing particles that reacts to voice, displays emotions, and dances to music.

## Requirements

### R1: WebGL Particle System

The system MUST render a 3D particle cloud using Three.js (or raw WebGL) that forms a recognizable face or shape.

#### Scenario: Styles available

- GIVEN the hologram is enabled
- WHEN the user selects a style
- THEN the system MUST offer at least three presets: woman face, man face, ethereal sphere
- AND particles SHALL reconfigure via smooth morphing (lerp to target positions)

#### Scenario: Morphing transition

- GIVEN the current style is active
- WHEN the user switches to a different style
- THEN each particle SHALL interpolate its position over 800–1200ms
- AND no sudden jumps SHALL occur during the transition

### R2: Floating Widget Positioning

The hologram MUST render as a floating overlay widget NOT inside the chat layout flow.

#### Scenario: Widget show/hide

- GIVEN the chat interface is visible
- WHEN the user opens the chat
- THEN the widget SHALL appear with a fluid CSS transition (opacity + scale)
- AND when closing, it SHALL fade out smoothly

#### Scenario: Adjustable size

- GIVEN the settings panel is open
- WHEN the user changes the size slider
- THEN the canvas dimensions SHALL update immediately
- AND the widget SHALL maintain aspect ratio

### R3: Voice Reactivity

The particle system MUST react to real-time audio levels from the microphone.

#### Scenario: User speaking

- GIVEN the user is speaking (via PTT or continuous mode)
- WHEN audio level increases
- THEN particles SHALL increase brightness and dispersion proportionally to volume
- AND return to idle state when silence resumes

#### Scenario: Mambru speaking (TTS)

- GIVEN Mambru is generating speech via TTS
- WHEN audio plays
- THEN particles SHALL pulse/ripple in sync with speech cadence

### R4: Emotion Reactivity

The avatar MUST display emotions based on LLM-extracted emotion tags.

#### Scenario: Emotion display

- GIVEN Mambru detects an emotion in the conversation
- WHEN the backend emits a `holo:emotion` event
- THEN the avatar SHALL display the corresponding expression: smile, serious, thinking, or neutral
- AND emotions SHALL be shown both while Mambru speaks AND while the user speaks

#### Scenario: Low confidence

- GIVEN the emotion confidence is below 0.6
- WHEN the emotion tag arrives
- THEN the avatar SHALL remain neutral
- AND no emotion animation SHALL play

### R5: Music Detection

The system MUST detect when the microphone picks up music and trigger a dance animation.

#### Scenario: Music triggers dancing

- GIVEN the mic is active in continuous mode and no speech is detected
- WHEN sustained rhythmic non-speech patterns are detected for 3+ seconds
- THEN the avatar SHALL begin a loose dance animation (Pragmata-style)
- AND SHALL stop dancing 2 seconds after music stops

### R6: Three.js Lazy Loading

Three.js MUST be lazy-loaded and never block the initial render.

#### Scenario: Lazy import

- GIVEN the app starts
- WHEN the user enables the hologram for the first time
- THEN Three.js SHALL be loaded via dynamic `import()`
- AND the hologram SHALL initialize after the import completes
- AND the initial chat UI render SHALL NOT be delayed

### R7: Performance

#### Scenario: Auto-quality adjustment

- GIVEN the hologram is rendering
- WHEN FPS drops below 30 for 2+ seconds
- THEN the system SHALL reduce particle count by 25%
- AND may disable glow/bloom effects

#### Scenario: Disabled state

- GIVEN the user toggles the hologram off
- THEN the canvas MUST be removed from the DOM
- AND zero GPU/CPU resources SHALL be consumed
