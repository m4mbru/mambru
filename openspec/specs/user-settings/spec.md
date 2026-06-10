# User Settings Specification

## Purpose

User settings provide a graphical panel for configuring all aspects of Mambru — LLM provider selection, voice settings, API keys, custom commands, personality, and theme. Settings are persisted to `~/.config/mambru/settings.toml`.

## Requirements

### Requirement: Settings Panel

The system MUST provide a Svelte-based settings panel accessible from the chat UI.

#### Scenario: Open settings from chat

- GIVEN the user is viewing the chat interface
- WHEN they click the settings icon or press a keyboard shortcut
- THEN the settings panel opens as an overlay or side panel
- AND the chat remains accessible behind it

#### Scenario: Settings persist on close

- GIVEN the user modifies settings
- WHEN they close the settings panel
- THEN all changes are persisted to disk
- AND the new settings take effect immediately

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
