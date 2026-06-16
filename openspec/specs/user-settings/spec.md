# User Settings Specification

## Purpose

User settings provide a graphical panel for configuring all aspects of Mambru — LLM provider selection, voice settings, API keys, custom commands, personality, and theme. Settings are persisted to `~/.config/mambru/settings.toml`.

## Requirements

### Requirement: Settings Panel

The system MUST provide a settings panel that renders inside a holographic panel expanding from the orbital HUD.

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

#### Scenario: Avatar size adjustment

- GIVEN the Avatar section is visible in Settings
- WHEN the user adjusts the hologram size
- THEN the hologram SHALL scale relative to the window height (default: 40% of viewport height)
- AND the minimum SHALL be 20% and maximum 70% of viewport height

### Requirement: Provider Configuration

The system MUST allow the user to select the active LLM provider (Ollama, OpenAI, Anthropic) and configure provider-specific fields including API keys and base URLs.

#### Scenario: Switch provider

- GIVEN the settings panel is open on the Provider section
- WHEN the user selects a different provider from the dropdown
- THEN the provider-specific fields (API key, base URL) are shown
- AND the active provider changes immediately on save

#### Scenario: API key visibility toggle

- GIVEN an API key field is displayed
- WHEN the user clicks the visibility toggle
- THEN the key text is revealed or obscured
- AND the key is never shown in plain text by default

### Requirement: Voice Configuration

The system MUST allow the user to toggle voice input on or off and configure the push-to-talk key binding.

#### Scenario: Toggle voice off

- GIVEN voice is currently enabled
- WHEN the user toggles voice off in settings
- THEN push-to-talk is disabled
- AND the voice indicator is removed from the UI

#### Scenario: Change push-to-talk key

- GIVEN the user wants to rebind the push-to-talk key
- WHEN they click the key binding field and press a new key
- THEN the new binding is saved and takes effect immediately

### Requirement: Command Manager

The system MUST provide a sub-panel within Settings for managing custom commands (list, search, create, edit, delete).

#### Scenario: Edit existing command

- GIVEN the Command Manager is open
- WHEN the user selects a command and edits its trigger or action
- THEN the updated command is saved to `commands.toml`
- AND the registry is refreshed

### Requirement: Personality Editor

The system MUST allow the user to edit the system prompt and select a personality preset.

#### Scenario: Edit system prompt

- GIVEN the Personality section is open
- WHEN the user edits the system prompt text
- THEN the new prompt is saved
- AND subsequent LLM responses use the updated system prompt

### Requirement: Theme Toggle

The system MUST support switching between light and dark themes.

#### Scenario: Switch to dark theme

- GIVEN the settings panel is open on the Appearance section
- WHEN the user selects dark theme
- THEN the UI switches to dark mode immediately
- AND the preference is persisted

### Requirement: Settings Persistence

The system MUST store all settings in `~/.config/mambru/settings.toml` and load them on startup.

#### Scenario: Settings loaded on startup

- GIVEN a valid `settings.toml` file exists
- WHEN the application starts
- THEN all settings are loaded and applied
- AND the UI reflects the saved configuration

#### Scenario: Settings file corruption

- GIVEN the `settings.toml` file is corrupted or unparseable
- WHEN the application starts
- THEN the system falls back to default settings
- AND a warning is logged
- AND the user is notified that settings were reset to defaults
