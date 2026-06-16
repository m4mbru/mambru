# System Info Panel Specification

## Purpose

The system info panel displays real-time information about the host machine and Mambru's AI model status within the holographic HUD.

## Requirements

### Requirement: System Information Display

The panel MUST show relevant system information about the host machine.

#### Scenario: Panel shows system details

- GIVEN the HUD is in orbital view
- WHEN the user sees the System Info panel
- THEN the panel SHALL display:
  - OS name and version
  - CPU model and usage (if available)
  - RAM total and usage (if available)
  - Mambru version

#### Scenario: Data refreshes

- GIVEN the System Info panel is visible
- WHEN the panel is in orbital view (not expanded)
- THEN the displayed values SHALL update periodically (every 5 seconds)
- AND the panel SHALL not consume significant CPU for data collection

### Requirement: AI Model Status

The panel MUST show the status of the configured AI model provider.

#### Scenario: Model status display

- GIVEN the user has configured an LLM provider
- WHEN the System Info panel is visible
- THEN it SHALL display:
  - Active provider name (Ollama / OpenAI / Anthropic)
  - Active model name
  - Connection status (connected / disconnected / error)
  - If Ollama: whether the model is loaded in memory

#### Scenario: Provider not configured

- GIVEN no provider is configured
- WHEN the System Info panel is visible
- THEN it SHALL show "No provider configured" with a link/button to open Settings
