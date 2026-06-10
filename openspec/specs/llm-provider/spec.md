# LLM Provider Specification

## Purpose

The LLM provider layer abstracts access to language model backends behind a unified trait, supporting local inference via Ollama and cloud inference via OpenAI and Anthropic.

## Requirements

### Requirement: Provider Trait

The system MUST define an `LLMProvider` trait with a `chat()` method that returns `Stream<DeltaRequest>`, where `DeltaRequest` contains incremental text deltas from the model.

#### Scenario: Trait defines the contract

- GIVEN any LLM provider implementation
- WHEN the `chat()` method is called with a message history
- THEN it returns a stream of `DeltaRequest` values
- AND the stream completes when the model finishes responding

#### Scenario: Error propagation

- GIVEN the underlying model returns an error (timeout, auth failure, unavailable)
- WHEN the `chat()` stream is consumed
- THEN the error is propagated through the stream
- AND the UI displays the error message

### Requirement: Ollama Provider

The system MUST implement an `OllamaProvider` that communicates with a local Ollama instance via its OpenAI-compatible HTTP API.

#### Scenario: Successful local inference

- GIVEN Ollama is running on localhost:11434
- WHEN the Ollama provider's `chat()` is invoked
- THEN it sends a request to `/v1/chat/completions`
- AND streams the response tokens back

#### Scenario: Ollama unavailable

- GIVEN Ollama is not running or unreachable
- WHEN the Ollama provider's `chat()` is invoked
- THEN the stream returns a connection error
- AND the UI shows a clear "Ollama not running" message

### Requirement: Cloud Provider

The system MUST implement a `CloudProvider` that uses the `llm` crate for OpenAI and Anthropic unified access.

#### Scenario: Cloud inference with valid key

- GIVEN a valid API key and base URL are configured
- WHEN the Cloud provider's `chat()` is invoked
- THEN it connects to the configured API endpoint
- AND streams the response tokens back

#### Scenario: Invalid API key

- GIVEN an invalid or expired API key
- WHEN the Cloud provider's `chat()` is invoked
- THEN the stream returns an authentication error
- AND the UI prompts the user to update their API key

### Requirement: Provider Selection

The system MUST allow the user to select the active provider through the Settings UI.

#### Scenario: Switching providers mid-session

- GIVEN the user changes the active provider in Settings
- WHEN a new message is sent
- THEN the selected provider handles the request
- AND the previous provider is no longer used

### Requirement: Request Cancellation

The system MUST support cancellation of in-flight LLM requests via a cancellation token.

#### Scenario: Cancel mid-stream

- GIVEN an active streaming response
- WHEN the user triggers cancellation
- THEN the provider stops generating
- AND the stream is terminated cleanly
- AND no partial response is persisted as complete

### Requirement: Config Isolation

The system MUST store API keys and base URLs in the user settings file (`~/.config/mambru/settings.toml`), never in the repository.

#### Scenario: Keys outside repo

- GIVEN the project is cloned
- WHEN a search for API keys is performed in the repo
- THEN no keys are found in any tracked file
- AND keys are only present in `~/.config/mambru/settings.toml`
