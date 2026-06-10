use async_trait::async_trait;
use futures::StreamExt;
use reqwest::Client;
use serde_json::Value;

use super::provider::{ChatRequest, ChatStream, LLMProvider, LlmError};

// ---------------------------------------------------------------------------
// Cloud provider — calls any OpenAI-compatible API (OpenAI, Anthropic via
// their respective endpoints) using HTTP + SSE streaming.
// ---------------------------------------------------------------------------

pub struct CloudProvider {
    client: Client,
    api_key: String,
    base_url: String,
    model: String,
}

impl CloudProvider {
    /// Create a new cloud provider.
    ///
    /// * `api_key` — Bearer token sent as `Authorization` header.
    /// * `base_url` — Base URL (e.g. `https://api.openai.com/v1`).
    /// * `model` — Default model name (e.g. `"gpt-4o"`).
    pub fn new(api_key: String, base_url: String, model: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            base_url,
            model,
        }
    }

    /// Build the request body.
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

    /// The chat completions endpoint.
    fn url(&self) -> String {
        format!(
            "{}/chat/completions",
            self.base_url.trim_end_matches('/')
        )
    }
}

#[async_trait]
impl LLMProvider for CloudProvider {
    fn name(&self) -> &'static str {
        "cloud"
    }

    async fn chat(&self, request: ChatRequest) -> Result<ChatStream, LlmError> {
        // Validate that an API key is configured.
        if self.api_key.is_empty() {
            return Err(LlmError::NotConfigured(
                "API key is not set. Please configure it in Settings.".into(),
            ));
        }

        let url = self.url();
        let body = self.build_body(&request);
        let client = self.client.clone();
        let api_key = self.api_key.clone();

        if request.stream {
            Self::streaming_chat(client, api_key, url, body).await
        } else {
            Self::non_streaming_chat(client, api_key, url, body).await
        }
    }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

impl CloudProvider {
    async fn non_streaming_chat(
        client: Client,
        api_key: String,
        url: String,
        body: Value,
    ) -> Result<ChatStream, LlmError> {
        let resp = client
            .post(&url)
            .json(&body)
            .bearer_auth(&api_key)
            .send()
            .await?;

        let status = resp.status();
        let text = resp.text().await?;

        if !status.is_success() {
            let msg = format!("API returned {status}: {text}");
            return Err(LlmError::Api(msg));
        }

        let content = extract_cloud_content(&text).unwrap_or_default();

        let stream = async_stream::stream! {
            yield Ok(content);
        };
        Ok(Box::pin(stream))
    }

    async fn streaming_chat(
        client: Client,
        api_key: String,
        url: String,
        body: Value,
    ) -> Result<ChatStream, LlmError> {
        let resp = client
            .post(&url)
            .json(&body)
            .bearer_auth(&api_key)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await?;
            let msg = format!("API returned {status}: {text}");
            return Err(LlmError::Api(msg));
        }

        let stream = async_stream::stream! {
            let mut byte_stream = resp.bytes_stream();
            let mut buf = String::new();

            while let Some(chunk) = byte_stream.next().await {
                let chunk = match chunk {
                    Ok(c) => c,
                    Err(e) => {
                        yield Err(LlmError::Request(e));
                        return;
                    }
                };

                let chunk_str = String::from_utf8_lossy(&chunk);
                buf.push_str(&chunk_str);

                // Process complete SSE events
                while let Some(pos) = buf.find("\n\n") {
                    let event = buf[..pos].to_string();
                    buf = buf[pos + 2..].to_string();
                    for line in event.lines() {
                        if let Some(delta) = parse_cloud_sse(line) {
                            yield Ok(delta);
                        }
                    }
                }
            }

            // Trailing data
            for line in buf.lines() {
                if let Some(delta) = parse_cloud_sse(line) {
                    yield Ok(delta);
                }
            }
        };

        Ok(Box::pin(stream))
    }
}

// ---------------------------------------------------------------------------
// SSE / content parsing
// ---------------------------------------------------------------------------

/// Same format as Ollama — OpenAI-compatible SSE:
///
/// ```text
/// data: {"id":"...","choices":[{"delta":{"content":"token"}}]}
/// ```
fn parse_cloud_sse(line: &str) -> Option<String> {
    let line = line.trim();
    if !line.starts_with("data: ") || line == "data: [DONE]" {
        return None;
    }

    let json_str = &line[6..];
    let value: Value = serde_json::from_str(json_str).ok()?;

    let content = value
        .get("choices")?
        .as_array()?
        .first()?
        .get("delta")?
        .get("content")?
        .as_str()?
        .to_string();

    if content.is_empty() { None } else { Some(content) }
}

/// Extract content from a non-streaming OpenAI-compatible response.
fn extract_cloud_content(body: &str) -> Option<String> {
    let value: Value = serde_json::from_str(body).ok()?;
    value
        .get("choices")?
        .as_array()?
        .first()?
        .get("message")?
        .get("content")?
        .as_str()
        .map(|s| s.to_string())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_cloud_sse_with_content() {
        let line = r#"data: {"id":"1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}"#;
        assert_eq!(parse_cloud_sse(line), Some("Hi".into()));
    }

    #[test]
    fn test_parse_cloud_sse_no_content() {
        let line = r#"data: {"id":"1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}"#;
        assert_eq!(parse_cloud_sse(line), None);
    }

    #[test]
    fn test_parse_cloud_sse_done() {
        assert_eq!(parse_cloud_sse("data: [DONE]"), None);
    }

    #[test]
    fn test_extract_cloud_content_success() {
        let body = r#"{"choices":[{"message":{"content":"Hello!"}}]}"#;
        assert_eq!(extract_cloud_content(body), Some("Hello!".into()));
    }

    #[test]
    fn test_extract_cloud_content_missing() {
        assert_eq!(extract_cloud_content("{}"), None);
    }

    #[test]
    fn test_provider_not_configured_on_empty_key() {
        let provider = CloudProvider::new("".into(), "https://example.com".into(), "gpt-4o".into());
        let request = ChatRequest {
            messages: vec![],
            model: None,
            temperature: None,
            max_tokens: None,
            stream: false,
        };

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(provider.chat(request));
        assert!(matches!(result, Err(LlmError::NotConfigured(_))));
    }
}
