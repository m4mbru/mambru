# Proposal: fix-sse-streaming

## Intent

`reqwest::bytes_stream()` yields 0 tokens on Windows when talking to Ollama's `/v1/chat/completions` SSE endpoint. Switching to Ollama's native `/api/chat` NDJSON endpoint avoids the issue entirely and restores real-time token streaming.

## Scope

### In Scope
- Rewrite `streaming_chat()` to use `/api/chat` with NDJSON parsing
- Remove `stream: false` hardcode in `chat.rs`
- Replace SSE parser tests with NDJSON parser tests
- Add reqwest `http2` feature
- Add provider/chat logging
- Document minimum Ollama ≥ 0.1.x

### Out of Scope
- Fixing SSE for other providers
- Changing `provider.rs` types
- Frontend changes
- Performance tuning beyond restoring streaming

## Capabilities

### New Capabilities
None — bugfix only.

### Modified Capabilities
- `llm-provider`: Ollama endpoint changes from `/v1/chat/completions` SSE to `/api/chat` NDJSON. Streaming contract (deltas via `chat()`) stays the same.

## Approach

1. **ollama.rs** — Point to `/api/chat`, drop `"stream":true`, parse NDJSON lines → extract `message.content`
2. **chat.rs** — Set `stream: true`, add per-token logging
3. **Cargo.toml** — Add `http2` to reqwest features
4. **Tests** — Remove `parse_sse_line()`, add `parse_ndjson_line()` with tests
5. **Toolchain** — Install `x86_64-pc-windows-msvc` target

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src-tauri/src/llm/ollama.rs` | Modified | `/api/chat` NDJSON streaming |
| `src-tauri/src/commands/chat.rs` | Modified | Remove stream hardcode; add logging |
| `src-tauri/Cargo.toml` | Modified | Add `http2` feature |
| `src-tauri/src/llm/provider.rs` | Unchanged | No change needed |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Ollama pre-0.1.x lacks `/api/chat` | Low | Document min version |
| NDJSON format change | Low | Hard error on parse fail |
| Toolchain install fails | Med | Document manual `rustup target add` steps |
| http2 regresses TLS | Low | `cargo check` + smoke test |

## Rollback Plan

1. Revert `chat.rs` — restore `stream: false` + FIXME
2. Revert `ollama.rs` — restore SSE endpoint + parser
3. Revert `Cargo.toml` — drop `http2` feature
4. Keep NDJSON tests under `#[cfg(test)]`

## Dependencies

- Rust target `x86_64-pc-windows-msvc` (`rustup target add`)
- Ollama ≥ 0.1.x on `localhost:11434`

## Success Criteria

- [ ] `cargo check` — 0 warnings on `x86_64-pc-windows-msvc`
- [ ] `npm test` — all frontend tests pass
- [ ] Ollama streaming yields > 0 tokens on Windows
- [ ] Tokens arrive incrementally via `chat-token` events
- [ ] NDJSON parser tests pass (normal, empty, malformed)
- [ ] Non-200 / invalid NDJSON propagates as error
