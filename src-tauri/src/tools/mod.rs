//! Tool and command execution system.
//!
//! Defines the [`ToolCall`] enum (search, exec, weather, …) and the
//! subsystems that execute them: a shell executor, a web search client,
//! and a user-defined custom command registry.
//!
//! # Submodules
//!
//! * `commands` — user-defined custom commands (TOML-based registry,
//!   regex matcher, AI-assisted builder)
//! * `executor` — shell command execution via `tauri-plugin-shell`
//! * `search` — Tavily / SerpAPI web search client

pub mod commands;
pub mod executor;
pub mod search;

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::security::RiskTier;

pub use commands::*;
pub use executor::CommandExecutor;
pub use search::SearchClient;
pub use search::SearchResult;

// ---------------------------------------------------------------------------
// ToolCall enum
// ---------------------------------------------------------------------------

/// Represents a tool invocation — either triggered by a matched custom
/// command or requested by the LLM during a conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ToolCall {
    /// Perform a web search.
    Search {
        query: String,
    },
    /// Execute a shell action with parameters.
    Execute {
        action: CommandAction,
        params: HashMap<String, String>,
        risk: RiskTier,
    },
    /// Get weather for a location (placeholder for future integration).
    GetWeather {
        location: String,
    },
    /// Read a file from the filesystem (future).
    ReadFile {
        path: String,
    },
}

/// The result of executing a [`ToolCall`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    /// Which tool was called.
    pub tool: String,
    /// Whether execution succeeded.
    pub success: bool,
    /// Human-readable output (stdout, summary, etc.).
    pub output: String,
    /// Structured data for use by the LLM (e.g. search results as JSON).
    pub data: Option<serde_json::Value>,
}

impl ToolCall {
    /// Execute this tool call and return a [`ToolResult`].
    pub async fn execute(&self, app: Option<&AppHandle>) -> ToolResult {
        match self {
            ToolCall::Search { query: _ } => {
                // Search requires a configured client; this will be wired
                // through AppState at the call site. The standalone execute
                // returns a placeholder message.
                ToolResult {
                    tool: "search".into(),
                    success: false,
                    output: "Search client not available — use SearchClient directly with AppState".into(),
                    data: None,
                }
            }
            ToolCall::Execute { action, params, risk } => {
                match CommandExecutor::execute(app, action, params, risk).await {
                    Ok(result) => ToolResult {
                        tool: "execute".into(),
                        success: result.exit_code == 0,
                        output: result.output,
                        data: Some(serde_json::json!({
                            "exit_code": result.exit_code,
                        })),
                    },
                    Err(e) => ToolResult {
                        tool: "execute".into(),
                        success: false,
                        output: e,
                        data: None,
                    },
                }
            }
            ToolCall::GetWeather { location } => {
                // Placeholder — returns a stub response
                ToolResult {
                    tool: "get_weather".into(),
                    success: true,
                    output: format!(
                        "Weather for {location}: 22°C, partly cloudy (mock data)"
                    ),
                    data: Some(serde_json::json!({
                        "location": location,
                        "temperature": 22,
                        "conditions": "partly cloudy",
                    })),
                }
            }
            ToolCall::ReadFile { path } => {
                match tokio::fs::read_to_string(path).await {
                    Ok(content) => {
                        let preview: String = content.chars().take(500).collect();
                        ToolResult {
                            tool: "read_file".into(),
                            success: true,
                            output: preview,
                            data: Some(serde_json::json!({
                                "path": path,
                                "size": content.len(),
                            })),
                        }
                    }
                    Err(e) => ToolResult {
                        tool: "read_file".into(),
                        success: false,
                        output: format!("Failed to read `{path}`: {e}"),
                        data: None,
                    },
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_execute_tool_call_exec() {
        let call = ToolCall::Execute {
            action: CommandAction::Exec {
                command: "echo".into(),
                args: vec!["hello".into()],
            },
            params: HashMap::new(),
            risk: RiskTier::Safe,
        };
        let result = call.execute(None).await;
        assert!(result.success, "echo hello should succeed");
        assert_eq!(result.tool, "execute");
    }

    #[tokio::test]
    async fn test_execute_tool_call_weather() {
        let call = ToolCall::GetWeather {
            location: "Buenos Aires".into(),
        };
        let result = call.execute(None).await;
        assert!(result.success);
        assert!(result.output.contains("Buenos Aires"));
    }

    #[tokio::test]
    async fn test_execute_tool_call_search_no_client() {
        let call = ToolCall::Search {
            query: "test".into(),
        };
        let result = call.execute(None).await;
        assert!(!result.success);
        assert!(result.output.contains("not available"));
    }
}
