# Delta for User Settings

## ADDED Requirements

### Requirement: Avatar Settings Tab

The system MUST provide a dedicated "Avatar" tab in the settings panel for configuring the hologram.

#### Scenario: Avatar tab visible

- GIVEN the settings panel is open
- WHEN the user sees the tab navigation
- THEN an "Avatar" tab SHALL be present alongside Provider, Voice, Commands, Personality, and Appearance
- AND clicking it SHALL show the avatar configuration section

#### Scenario: Toggle hologram on/off

- GIVEN the avatar settings section is visible
- WHEN the user toggles the hologram enable switch
- THEN the hologram SHALL appear or disappear immediately
- AND the setting SHALL be persisted

#### Scenario: Style selection

- GIVEN the avatar settings are visible
- WHEN the user selects a style (woman / man / ethereal sphere)
- THEN the active style SHALL change immediately with morphing animation
- AND the preference SHALL be persisted

#### Scenario: Size adjustment

- GIVEN the avatar settings are visible
- WHEN the user adjusts the size slider
- THEN the canvas dimensions SHALL update in real time
- AND the minimum size SHALL be 100px and maximum 400px

#### Scenario: Position selector

- GIVEN the avatar settings are visible
- WHEN the user selects a position (floating / minimal / panel)
- THEN the widget position SHALL update immediately

### Requirement: Voice Mode Toggle

The system MUST allow switching between continuous capture and push-to-talk modes.

#### Scenario: Continuous/PTT selector

- GIVEN the voice settings section is open
- WHEN the user toggles between "Continuous" and "Push-to-Talk"
- THEN the microphone behavior SHALL switch immediately
- AND the setting SHALL be persisted
