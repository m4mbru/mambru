//! Tools IPC command handlers (UI ↔ backend bridge for commands & search).
//!
//! # Commands
//!
//! * `get_commands` — list all user-defined commands
//! * `save_command` — add / update a command
//! * `delete_command` — remove a command by name
//! * `build_command` — AI-assisted command creation from natural language
//! * `confirm_execution` — approve or reject a pending medium/dangerous command
//! * `search_web` — perform a web search via configured provider

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::security::{AuditLog, RiskClassifier, RiskTier};
use crate::tools::commands::builder::CommandBuilder;
use crate::tools::commands::registry::CommandRegistry;
use crate::tools::commands::{Command, CommandAction, ExecResult};
use crate::tools::{CommandExecutor, SearchClient, ToolCall, ToolResult};
use crate::AppState;

// ---------------------------------------------------------------------------
// Pending execution tracking
// ---------------------------------------------------------------------------

/// A command execution awaiting user approval (Medium / Dangerous only).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingExecution {
    /// Unique ID for this pending execution.
    pub id: String,
    /// The matched command.
    pub command: Command,
    /// Extracted parameters.
    pub params: HashMap<String, String>,
    /// The raw user input that triggered the match.
    pub raw_input: String,
    /// The effective risk tier.
    pub risk: RiskTier,
}

// ---------------------------------------------------------------------------
// List commands
// ---------------------------------------------------------------------------

/// Return all user-defined commands (from the in-memory registry).
#[tauri::command]
pub fn get_commands(
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<Command>, String> {
    let state_lock = state.lock().map_err(|e| e.to_string())?;
    Ok(state_lock.command_list.clone())
}

// ---------------------------------------------------------------------------
// Save command
// ---------------------------------------------------------------------------

/// Add a new command or update an existing one.
///
/// If a command with the same name already exists, it is replaced.
#[tauri::command]
pub fn save_command(
    state: State<'_, Mutex<AppState>>,
    cmd: Command,
) -> Result<(), String> {
    let mut state_lock = state.lock().map_err(|e| e.to_string())?;

    // Validate the trigger regex compiles
    regex::Regex::new(&cmd.trigger)
        .map_err(|e| format!("Invalid trigger regex: {e}"))?;

    // Remove existing command with same name, then add new one
    let _ = CommandRegistry::remove(&mut state_lock.command_list, &cmd.name);
    state_lock.command_list.push(cmd.clone());
    CommandRegistry::save(&state_lock.command_list).map_err(|e| e.to_string())?;

    // Rebuild the matcher with updated commands
    state_lock.rebuild_matcher();

    Ok(())
}

// ---------------------------------------------------------------------------
// Delete command
// ---------------------------------------------------------------------------

/// Delete a command by name.
#[tauri::command]
pub fn delete_command(
    state: State<'_, Mutex<AppState>>,
    name: String,
) -> Result<(), String> {
    let mut state_lock = state.lock().map_err(|e| e.to_string())?;

    let removed = CommandRegistry::remove(&mut state_lock.command_list, &name)
        .map_err(|e| e.to_string())?;

    if removed {
        state_lock.rebuild_matcher();
        Ok(())
    } else {
        Err(format!("Command `{name}` not found"))
    }
}

// ---------------------------------------------------------------------------
// Build command from natural language
// ---------------------------------------------------------------------------

/// Use the [`CommandBuilder`] to create a command from a NL description.
///
/// The returned command is a best-effort suggestion — the user should
/// review and adjust it before saving.
#[tauri::command]
pub fn build_command(nl: String) -> Result<Command, String> {
    CommandBuilder::build_from_nl(&nl)
}

// ---------------------------------------------------------------------------
// Confirm / reject a pending execution
// ---------------------------------------------------------------------------

/// Approve or reject a pending medium/dangerous command execution.
///
/// This is called from the frontend after the user interacts with a
/// confirmation or preview dialog.
#[tauri::command]
pub async fn confirm_execution(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    id: String,
    approved: bool,
) -> Result<ExecResult, String> {
    let pending = {
        let mut state_lock = state.lock().map_err(|e| e.to_string())?;
        state_lock.pending_executions.remove(&id)
    };

    let pending = match pending {
        Some(p) => p,
        None => return Err(format!("No pending execution with id `{id}`")),
    };

    if !approved {
        // Log the rejection
        let entry = crate::security::AuditEntry {
            timestamp: chrono::Utc::now(),
            command: pending.command.name.clone(),
            risk: pending.risk.clone(),
            params: pending.params.clone(),
            approved: false,
            result: "rejected".into(),
        };
        let _ = AuditLog::append(&entry);

        // Emit rejection event
        let _ = app.emit("cmd:rejected", &serde_json::json!({
            "id": id,
            "command": pending.command.name,
        }));

        return Ok(ExecResult {
            output: "Command execution was cancelled.".into(),
            exit_code: -1,
        });
    }

    // Execute
    let result = CommandExecutor::execute(
        &pending.command.action,
        &pending.params,
        &pending.risk,
    )
    .await?;

    // Log to audit
    let entry = crate::security::AuditEntry {
        timestamp: chrono::Utc::now(),
        command: pending.command.name.clone(),
        risk: pending.risk,
        params: pending.params,
        approved: true,
        result: format!("exit: {}", result.exit_code),
    };
    let _ = AuditLog::append(&entry);

    // Emit approved event
    let _ = app.emit("cmd:approved", &serde_json::json!({
        "id": id,
        "command": pending.command.name,
        "result": result,
    }));

    Ok(result)
}

// ---------------------------------------------------------------------------
// Web search
// ---------------------------------------------------------------------------

/// Perform a web search using the configured provider (Tavily / SerpAPI).
#[tauri::command]
pub async fn search_web(
    state: State<'_, Mutex<AppState>>,
    query: String,
) -> Result<Vec<crate::tools::SearchResult>, String> {
    let settings = {
        let state_lock = state.lock().map_err(|e| e.to_string())?;
        state_lock.settings.search.clone()
    };

    let client = SearchClient::new(&settings.provider, &settings.api_key, None);
    client.search(&query).await
}

// ---------------------------------------------------------------------------
// Execute a ToolCall (for LLM-initiated tool usage)
// ---------------------------------------------------------------------------

/// Execute a [`ToolCall`] — used when the LLM decides to invoke a tool
/// (e.g. web search during a conversation).
#[tauri::command]
pub async fn execute_tool_call(
    state: State<'_, Mutex<AppState>>,
    tool_call: String, // JSON-serialised ToolCall
) -> Result<ToolResult, String> {
    let call: ToolCall = serde_json::from_str(&tool_call)
        .map_err(|e| format!("Invalid ToolCall JSON: {e}"))?;

    let result = match call {
        ToolCall::Search { ref query } => {
            let settings = {
                let state_lock = state.lock().map_err(|e| e.to_string())?;
                state_lock.settings.search.clone()
            };
            let client = SearchClient::new(&settings.provider, &settings.api_key, None);
            match client.search(query).await {
                Ok(results) => ToolResult {
                    tool: "search".into(),
                    success: true,
                    output: format!("Found {} results", results.len()),
                    data: Some(serde_json::to_value(&results).unwrap_or_default()),
                },
                Err(e) => ToolResult {
                    tool: "search".into(),
                    success: false,
                    output: e,
                    data: None,
                },
            }
        }
        _ => call.execute().await,
    };

    Ok(result)
}
