# Delta: user-settings

## Change Type

Modified — the settings panel moves from a slideover to an expandable orbital holographic panel.

## Modified Requirements

### Requirement: Settings Panel in Orbital Panel

Settings MUST now render inside a holographic panel that expands from orbit.

#### Scenario: Open settings from HUD

- GIVEN the user is viewing the orbital HUD
- WHEN they click the Settings panel
- THEN the Settings panel SHALL expand to center with fluid animation
- AND all settings sections (Provider, Voice, Commands, Personality, Appearance, Avatar) SHALL be available

#### Scenario: Settings close

- GIVEN the Settings panel is expanded
- WHEN the user clicks close or presses Escape
- THEN the panel SHALL collapse back to orbital position
- AND all changed settings SHALL persist to disk

### Removed Requirements

| ID | Reason |
|----|--------|
| Avatar: Style selection | Removed — only one style (female head) exists |
| Avatar: Position selector | Removed — the head is always at HUD center |
| Avatar: Size adjustment | Changed — size is now relative to screen/window dimensions, not a fixed pixel slider |

### Modified Requirements

#### Avatar Settings: Size adjustment

- GIVEN the Avatar section is visible in Settings
- WHEN the user adjusts the hologram size
- THEN the hologram SHALL scale relative to the window height (default: 40% of viewport height)
- AND the minimum SHALL be 20% and maximum 70% of viewport height
