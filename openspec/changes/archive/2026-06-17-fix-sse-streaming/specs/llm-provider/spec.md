# Delta for llm-provider

## ADDED Requirements

### Requirement: NDJSON Parser

The system MUST parse newline-delimited JSON (NDJSON) from Ollama's `/api/chat` endpoint, extracting `message.content` from each valid line.

#### Scenario: Normal NDJSON line

- GIVEN a valid NDJSON line containing `{"message":{"content":"Hello"}}`
- WHEN the parser processes it
- THEN it returns `Some("Hello")`
- AND the stream yields that text as the next delta

#### Scenario: Empty line

- GIVEN an empty line in the NDJSON stream
- WHEN the parser encounters it
- THEN it returns `None` (skips the line)
- AND continues to the next line without error

#### Scenario: Malformed NDJSON

- GIVEN a line that is not valid JSON
- WHEN the parser encounters it
- THEN it returns an error
- AND the stream propagates the error to the caller

#### Scenario: Line missing `message.content`

- GIVEN a valid JSON line without `message.content` (e.g., `{"done":true}`)
- WHEN the parser processes it
- THEN it returns `None`
- AND the stream does not yield a delta

### Requirement: Streaming Diagnostics

The system SHOULD log each received token and token count during Ollama streaming, using the `log` crate at `debug` level.

#### Scenario: Token logging during stream

- GIVEN an active streaming response from Ollama
- WHEN each token arrives after NDJSON parsing
- THEN the token text is logged at `debug` level
- AND the cumulative token count is incremented and logged

### Requirement: Windows Build Target

The development environment MUST include the `x86_64-pc-windows-msvc` Rust target for Windows compilation.

#### Scenario: Toolchain verification

- GIVEN a Windows development environment
- WHEN `rustup target list --installed` is run
- THEN `x86_64-pc-windows-msvc` appears in the output

## MODIFIED Requirements

### Requirement: Ollama Provider

The system MUST implement an `OllamaProvider` that communicates with a local Ollama instance (≥ 0.1.x) via its native HTTP API.
(Previously: "OpenAI-compatible HTTP API using SSE at `/v1/chat/completions`")

#### Scenario: Successful local inference

- GIVEN Ollama ≥ 0.1.x is running on localhost:11434
- WHEN the Ollama provider's `chat()` is invoked
- THEN it sends a POST request to `/api/chat` with `"stream":true`
- AND streams response tokens back via NDJSON parsing
- AND the stream yields `DeltaRequest` values as before

#### Scenario: Ollama unavailable

- GIVEN Ollama is not running or unreachable
- WHEN the Ollama provider's `chat()` is invoked
- THEN the stream returns a connection error
- AND the UI shows a clear "Ollama not running" message

#### Scenario: Non-200 HTTP response

- GIVEN Ollama returns a non-200 status (e.g., 404, 500)
- WHEN the Ollama provider's `chat()` is invoked
- THEN the stream returns an HTTP error
- AND no tokens are yielded

#### Scenario: Empty NDJSON response

- GIVEN Ollama returns a response with no NDJSON lines
- WHEN the provider processes the response
- THEN the stream completes with zero tokens
- AND no error is propagated

## Contracts

### Parser Function

```
fn parse_ndjson_line(line: &str) -> Result<Option<String>, ParseError>
```

- Input: a single line (without trailing newline) from the HTTP response body
- Output: `Ok(Some(content))` on a valid line with `message.content`, `Ok(None)` on empty/done lines, `Err(ParseError)` on malformed JSON
- ParseError: new error type implementing `std::error::Error` with `Display`

### Ollama Request Body

```json
{
  "model": "<model-name>",
  "messages": [{"role": "user", "content": "..."}],
  "stream": true
}
```

Posted to `POST /api/chat`. `"stream": true` is MANDATORY — omitting it returns a single JSON object instead of NDJSON lines.

### Event Contract (unchanged)

The `chat()` method still returns `Stream<DeltaRequest>`. The `DeltaRequest` type and `chat-token` Tauri events are unchanged — the NDJSON change is backend-only.
