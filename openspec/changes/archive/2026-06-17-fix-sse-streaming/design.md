# Design: Fix SSE Streaming — Switch to Ollama `/api/chat` NDJSON

## Technical Approach

Replace the broken SSE endpoint `/v1/chat/completions` with Ollama's native `/api/chat` NDJSON endpoint. The data format on the wire changes from SSE (`data: {...}\n\n`) to newline-delimited JSON (`{...}\n`), but the provider contract (`ChatStream` of `Result<String, LlmError>`) stays identical — no changes to `provider.rs` or the frontend.

The `stream: true` field in the request body is **mandatory**. Omitting it causes Ollama to return a single JSON object instead of NDJSON lines. The field is already present in `build_body()` — no change needed there.

The root cause (`bytes_stream()` + SSE on Windows) is avoided entirely by using a simpler line-delimited protocol that `reqwest` handles correctly cross-platform.

## Architecture Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Endpoint | `/api/chat` instead of `/v1/chat/completions` | Ollama native NDJSON avoids SSE framing issues on Windows |
| 2 | Stream field | Keep `"stream": true` in body | MANDATORY — without it, Ollama returns a single JSON, not NDJSON lines |
| 3 | Parser signature | `parse_ndjson_line(line) -> Result<Option<String>, ParseError>` | Same shape as `parse_sse_line()` but returns errors; callers unchanged |
| 4 | Buffer delimiter | `\n` instead of `\n\n` | NDJSON is newline-delimited, not event-stream delimited with blank-line separators |
| 5 | Error type | `ParseError` enum with `InvalidJson` variant | Wraps `serde_json::Error`; allows future variants (truncated lines, protocol) |
| 6 | Streaming mechanism | Keep `bytes_stream()` + line buffer (change parsing only) | SSE framing was the problem, not `bytes_stream()`; minimal diff |
| 7 | Diagnostics | Replace file-based `log_ollama()` with `log::debug!()` | Removes hardcoded Windows path; works with `RUST_LOG=debug` |
| 8 | Log dependency | Add `log` + `env_logger` crates | Standard Rust logging; `env_logger` sends output to stderr (visible in debug, configurable in release) |
| 9 | HTTP/2 | Add `http2` to reqwest features | Ollama uses HTTP/2 — avoids potential keep-alive or framing edge cases between SSE and NDJSON |
| 10 | Non-streaming path | Keep `non_streaming_chat()` with updated URL | Satisfies trait contract for callers passing `stream: false`; defensive fallback |

## Data Flow

```
Svelte frontend
  │  invoke("send_message", {content, conversation_id})
  ▼
chat.rs::send_message()
  │  ChatRequest { stream: true }
  ▼
ollama.rs::chat()
  │  POST /api/chat  {"messages":..., "stream": true}
  ▼
reqwest HTTP response (200)
  │  resp.bytes_stream() → chunks of u8
  ▼
NDJSON accumulator
  │  buf.push_str(chunk)
  │  while let Some(pos) = buf.find('\n')
  │      line = buf[..pos]
  │      buf = buf[pos+1..]
  ▼
parse_ndjson_line(line)
  │  Ok(Some(content))  → yield Ok(content)   → emit("chat-token", content)
  │  Ok(None)           → continue (skip line)
  │  Err(ParseError)    → yield Err(LlmError::Api(...)) → emit("chat-error", msg)
  ▼
Stream complete → emit("chat-done", full_response)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src-tauri/src/llm/ollama.rs` | Modify | URL → `/api/chat`; replace SSE parser with NDJSON parser; add `ParseError` type; add `log::debug!()` calls; rewrite tests |
| `src-tauri/src/commands/chat.rs` | Modify | Set `stream: true`; remove FIXME comment |
| `src-tauri/Cargo.toml` | Modify | Add `log`, `env_logger` deps; add `http2` to reqwest features |
| `src-tauri/src/llm/provider.rs` | No change | Types and trait remain identical |

## Interfaces / Contracts

```rust
// ── New type in ollama.rs ──

#[derive(Debug, thiserror::Error)]
pub enum ParseError {
    #[error("invalid NDJSON line: {0}")]
    InvalidJson(#[from] serde_json::Error),
}

// ── Parser ──

/// Parse a single NDJSON line from Ollama `/api/chat`.
///
/// # Returns
/// - `Ok(Some(content))` — line with non-empty `message.content`
/// - `Ok(None)` — empty line, `done:true` line, or missing content
/// - `Err(ParseError)` — malformed JSON
fn parse_ndjson_line(line: &str) -> Result<Option<String>, ParseError> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let value: Value = serde_json::from_str(trimmed)?;
    match value
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
    {
        Some(c) if !c.is_empty() => Ok(Some(c.to_string())),
        _ => Ok(None),
    }
}
```

NDJSON line from `/api/chat`:
```json
{"model":"llama3.2","message":{"role":"assistant","content":"Hello"},"done":false}
{"model":"llama3.2","message":{"role":"assistant","content":""},"done":true,"total_duration":...}
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `parse_ndjson_line()` — 6 cases | Content line, empty line, `done:true` line, malformed JSON, missing `message.content`, trailing whitespace |
| Unit | `streaming_chat()` error handling | Simulate HTTP error (4xx/5xx) and verify `Err(LlmError::Api)` |
| Build | Compilation | `cargo check --target x86_64-pc-windows-msvc` — 0 warnings |
| Smoke | Full streaming | Run app on Windows with Ollama running; verify `chat-token` events arrive incrementally |

Existing `parse_sse_line` tests and `extract_content` tests remain until all SSE code is confirmed removed.

## Implementation Order

1. **Cargo.toml** — Add `log`, `env_logger`; add `http2` to reqwest
2. **ollama.rs** — Add `ParseError`, `parse_ndjson_line()` + tests; rewrite `streaming_chat()` parsing loop; update URL; replace `log_ollama()` with `log::debug!()`
3. **chat.rs** — Change `stream: false` → `true`, remove FIXME
4. **`cargo check`** — Verify compilation on `x86_64-pc-windows-msvc`
5. **Smoke test** — Run app with Ollama running; confirm streaming works

## Open Questions

None. All decisions are resolved by the spec and codebase analysis.
