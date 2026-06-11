# Hologram Avatar Specification

## Purpose

Futuristic particle-based hologram avatar that reacts to voice and serves as Mambru's visual identity in the chat interface.

## Requirements

### R1: Particle System

The system MUST render a dynamic particle cloud that forms a human face silhouette.

#### Scenario: Default state

- GIVEN Mambru is idle
- WHEN the app starts
- THEN ~2000 particles form a stable face silhouette
- AND particles exhibit subtle floating motion (Perlin noise)

#### Scenario: Particle count

- GIVEN the system is running
- WHEN the user changes settings
- THEN the particle count SHOULD be configurable (1000–5000)

### R2: Voice Reactivity

The particle system MUST react to voice input and output.

#### Scenario: User speaking

- GIVEN the user is recording via PTT
- WHEN audio levels change
- THEN particles SHOULD disperse outward proportionally to volume
- AND return to silhouette when silence resumes

#### Scenario: Mambru speaking (TTS)

- GIVEN Mambru is generating TTS audio
- WHEN audio plays
- THEN particles SHOULD pulse/ripple in sync with speech
- AND the "mouth" area SHOULD emit more particles during speech

### R3: Silhouette Rendering

The system MUST render a recognizable human face silhouette.

#### Scenario: Profile view

- GIVEN default settings
- WHEN the avatar loads
- THEN a side-profile silhouette SHOULD be visible from the particle cloud
- AND the silhouette SHOULD be gender-neutral and abstract

#### Scenario: Alternative silhouettes

- GIVEN the user opens settings
- WHEN they select a different avatar style
- THEN the system SHOULD support multiple silhouette presets
- AND the user MAY load a custom silhouette image

### R4: Performance

The system MUST maintain 60 FPS on modern hardware.

#### Scenario: Performance budget

- GIVEN the avatar is active
- WHEN rendering
- THEN the particle system MUST use Canvas 2D (not WebGL for broad compatibility)
- AND the render loop SHOULD use requestAnimationFrame
- AND particle count SHOULD auto-adjust if FPS drops below 30

#### Scenario: Disabling

- GIVEN the user prefers performance
- WHEN they toggle the avatar off
- THEN the canvas MUST be hidden
- AND zero CPU/GPU resources consumed

## Technical Approach

- Canvas 2D overlay in the chat area (right side, semi-transparent)
- Particle positions calculated from sampled silhouette image pixels
- Perlin noise library for organic movement
- Audio analyser node from microphone/playback stream for reactivity
- Settings: enable/disable, particle count, silhouette preset
- The canvas replaces/hovers behind the right side of the chat area when visible
