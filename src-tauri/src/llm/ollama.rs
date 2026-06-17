use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use serde_json::Value;

use super::provider::{ChatRequest, ChatStream, LLMProvider, LlmError};

// ---------------------------------------------------------------------------
// Ollama provider — talks to a local Ollama instance via its
// OpenAI-compatible HTTP API.
// ---------------------------------------------------------------------------

pub struct OllamaProvider {
    client: Client,
    base_url: String,
    model: String,
}

impl OllamaProvider {
    pub fn new(base_url: String, model: String) -> Self {
        Self {
            client: Client::new(),
            base_url,
            model,
        }
    }

    /// Build the request body shared by streaming and non-streaming paths.
    fn build_body(&self, request: &ChatRequest) -> Value {
        serde_json::json!({
            "model": request.model.as_deref().unwrap_or(&self.model),
            "messages": request.messages.iter().map(|m| {
                serde_json::json!({ "role": m.role, "content": m.content })
            }).collect::<Vec<_>>(),
            "stream": request.stream,
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
        })
    }

    /// The endpoint URL — uses Ollama's native `/api/chat` with NDJSON.
    fn url(&self) -> String {
        format!(
            "{}/api/chat",
            self.base_url.trim_end_matches('/')
        )
    }
}

#[async_trait]
impl LLMProvider for OllamaProvider {
    fn name(&self) -> &'static str {
        "ollama"
    }

    async fn chat(&self, request: ChatRequest) -> Result<ChatStream, LlmError> {
        let url = self.url();
        let body = self.build_body(&request);
        let client = self.client.clone();

        if request.stream {
            Self::streaming_chat(client, url, body).await
        } else {
            Self::non_streaming_chat(client, url, body).await
        }
    }
}

// ---------------------------------------------------------------------------
// Private helpers (behind the trait impl so they can return ChatStream)
// ---------------------------------------------------------------------------

impl OllamaProvider {
    /// Non-streaming path: collect the full response and yield it as a single
    /// item stream so callers don't need to branch.
    async fn non_streaming_chat(
        client: Client,
        url: String,
        body: Value,
    ) -> Result<ChatStream, LlmError> {
        let resp = client.post(&url).json(&body).send().await?;
        let status = resp.status();
        let text = resp.text().await?;

        log::debug!("non_streaming_chat: status={status}, text.len()={}", text.len());
        log::debug!("non_streaming_chat: raw body: {}", &text[..text.len().min(1000)]);

        let content = extract_content(&text).unwrap_or_default();
        log::debug!("non_streaming_chat: extracted content: len={}, empty={}", content.len(), content.is_empty());

        let stream = async_stream::stream! {
            yield Ok(content);
        };
        Ok(Box::pin(stream))
    }

    /// Streaming path: parse NDJSON lines from Ollama `/api/chat` and yield
    /// each content delta.
    async fn streaming_chat(
        client: Client,
        url: String,
        body: Value,
    ) -> Result<ChatStream, LlmError> {
        let resp = client.post(&url).json(&body).send().await?;

        let stream = async_stream::stream! {
            let mut byte_stream = resp.bytes_stream();
            let mut buf = String::new();
            let mut token_count: u64 = 0;

            while let Some(chunk) = byte_stream.next().await {
                let chunk = match chunk {
                    Ok(c) => c,
                    Err(e) => {
                        yield Err(LlmError::Request(e));
                        return;
                    }
                };

                // Accumulate bytes and parse NDJSON lines
                let chunk_str = String::from_utf8_lossy(&chunk);
                buf.push_str(&chunk_str);

                // Process complete NDJSON lines (delimited by single newline)
                while let Some(pos) = buf.find('\n') {
                    let line = buf[..pos].to_string();
                    buf = buf[pos + 1..].to_string();

                    match parse_ndjson_line(&line) {
                        Ok(Some(content)) => {
                            token_count += 1;
                            log::debug!("ollama token {}: {}", token_count, content);
                            yield Ok(content);
                        }
                        Ok(None) => {
                            // Skip empty, done:true, or missing-content lines
                            continue;
                        }
                        Err(e) => {
                            log::debug!("ollama parse error: {e}");
                            yield Err(LlmError::Api(format!("NDJSON parse error: {e}")));
                            return;
                        }
                    }
                }
            }

            // Process any remaining data in the buffer
            if !buf.is_empty() {
                match parse_ndjson_line(&buf) {
                    Ok(Some(content)) => {
                        token_count += 1;
                        log::debug!("ollama token {}: {}", token_count, content);
                        yield Ok(content);
                    }
                    Ok(None) => {}
                    Err(e) => {
                        log::debug!("ollama trailing parse error: {e}");
                        yield Err(LlmError::Api(format!("NDJSON parse error: {e}")));
                        return;
                    }
                }
            }

            log::debug!("ollama stream complete — {token_count} tokens yielded");
        };

        Ok(Box::pin(stream))
    }
}

/// Fallback: extract content from a non-streaming JSON response.
fn extract_content(body: &str) -> Option<String> {
    let value: Value = serde_json::from_str(body).ok()?;

    // Try OpenAI format: choices[0].message.content
    if let Some(content) = value
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|c| c.first())
        .and_then(|c| c.get("message"))
        .and_then(|c| c.get("content"))
        .and_then(|c| c.as_str())
    {
        return Some(content.to_string());
    }

    // Try Ollama native format: message.content
    if let Some(content) = value
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
    {
        return Some(content.to_string());
    }

    // Try response field (some providers use this)
    if let Some(content) = value.get("response").and_then(|c| c.as_str()) {
        return Some(content.to_string());
    }

    None
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// NDJSON parsing for Ollama /api/chat
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum ParseError {
    #[error("invalid NDJSON line: {0}")]
    InvalidJson(#[from] serde_json::Error),
}

impl PartialEq for ParseError {
    fn eq(&self, other: &Self) -> bool {
        matches!(
            (self, other),
            (ParseError::InvalidJson(_), ParseError::InvalidJson(_))
        )
    }
}

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

#[cfg(test)]
mod tests {
    use super::*;

    // ── NDJSON parser tests ──

    #[test]
    fn test_parse_ndjson_normal_content() {
        let line = r#"{"model":"llama3.2","message":{"role":"assistant","content":"Hello"},"done":false}"#;
        assert_eq!(parse_ndjson_line(line), Ok(Some("Hello".into())));
    }

    #[test]
    fn test_parse_ndjson_empty_line() {
        assert_eq!(parse_ndjson_line(""), Ok(None));
        assert_eq!(parse_ndjson_line("\n"), Ok(None));
    }

    #[test]
    fn test_parse_ndjson_done_true_line() {
        // The final line has done:true and empty content — should return None
        let line = r#"{"model":"llama3.2","message":{"role":"assistant","content":""},"done":true}"#;
        assert_eq!(parse_ndjson_line(line), Ok(None));
    }

    #[test]
    fn test_parse_ndjson_malformed_json() {
        let result = parse_ndjson_line("not valid json");
        assert!(result.is_err());
        match result {
            Err(ParseError::InvalidJson(_)) => {} // expected
            _ => panic!("expected InvalidJson error"),
        }
    }

    #[test]
    fn test_parse_ndjson_missing_content() {
        let line = r#"{"done":true}"#;
        assert_eq!(parse_ndjson_line(line), Ok(None));
    }

    #[test]
    fn test_parse_ndjson_trailing_whitespace() {
        let line = "  {\"message\":{\"content\":\"Hi\"}}  ";
        assert_eq!(parse_ndjson_line(line), Ok(Some("Hi".into())));
    }

    #[test]
    fn test_extract_content_openai_format() {
        let body = r#"{"choices":[{"message":{"content":"Hello world"}}]}"#;
        assert_eq!(extract_content(body), Some("Hello world".into()));
    }

    #[test]
    fn test_extract_content_ollama_format() {
        let body = r#"{"message":{"content":"Hello from Ollama"}}"#;
        assert_eq!(extract_content(body), Some("Hello from Ollama".into()));
    }

    #[test]
    fn test_extract_content_empty() {
        assert_eq!(extract_content("{}"), None);
        assert_eq!(extract_content("not json"), None);
    }
}
