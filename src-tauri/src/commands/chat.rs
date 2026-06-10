use std::sync::Mutex;

use futures::StreamExt;
use tauri::{AppHandle, Emitter, State};

use crate::conversation::history::ConversationSummary;
use crate::llm::provider::{ChatRequest, Message};
use crate::security::{AuditLog, RiskClassifier, RiskTier};
use crate::tools::commands::ExecResult;
use crate::tools::CommandExecutor;
use crate::AppState;

use super::tools::PendingExecution;

// ---------------------------------------------------------------------------
// Chat IPC commands
// ---------------------------------------------------------------------------

/// Send a message and stream the response token-by-token via Tauri events.
///
/// # Command auto-execution
///
/// Before sending to the LLM, the message is checked against the active
/// command registry. If a command matches:
///
/// - **Safe** → auto-executes immediately and emits `cmd:auto-result`
/// - **Medium** → emits `cmd:confirm` with pending execution details
/// - **Dangerous** → emits `cmd:preview` with full command preview
///
/// If no command matches, the message is sent to the LLM as normal.
///
/// # Arguments
/// * `content` — the user's message text.
/// * `conversation_id` — the conversation to append to. If it doesn't exist
///   yet, a new conversation is created with this ID.
///
/// # Returns
/// The conversation ID (useful when a new one was auto-created) or a pending
/// execution ID when a Medium/Dangerous command matched.
///
/// # Events emitted
/// - `chat-token` — each content delta (`String`)
/// - `chat-done` — full response text (`String`) when streaming completes
/// - `chat-error` — error message (`String`) on failure
/// - `cmd:auto-result` — `{ result: ExecResult, command: String }` for Safe auto-exec
/// - `cmd:confirm` — `{ id, command, params, risk }` for Medium commands
/// - `cmd:preview` — `{ id, command, params, risk, preview }` for Dangerous commands
#[tauri::command]
pub async fn send_message(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    content: String,
    conversation_id: Option<String>,
) -> Result<String, String> {
    // ===================================================================
    // STEP 1: Check if the message matches a custom command
    // ===================================================================
    {
        let state_lock = state.lock().map_err(|e| e.to_string())?;
        if let Some(command_match) = state_lock.command_matcher.match_text(&content) {
            let effective_risk = command_match.command.risk.clone();

            // Validate args before proceeding
            RiskClassifier::validate_args(&command_match.command, &command_match.params)
                .map_err(|e| {
                    format!("Command `{}` blocked: {e}", command_match.command.name)
                })?;

            match effective_risk {
                RiskTier::Safe => {
                    // Auto-execute immediately
                    drop(state_lock);
                    let result = CommandExecutor::execute(
                        &command_match.command.action,
                        &command_match.params,
                        &effective_risk,
                    )
                    .await?;

                    // Log to audit
                    let entry = crate::security::AuditEntry {
                        timestamp: chrono::Utc::now(),
                        command: command_match.command.name.clone(),
                        risk: RiskTier::Safe,
                        params: command_match.params,
                        approved: true,
                        result: format!("exit: {}", result.exit_code),
                    };
                    let _ = AuditLog::append(&entry);

                    // Emit auto-result event
                    let _ = app.emit(
                        "cmd:auto-result",
                        &serde_json::json!({
                            "command": command_match.command.name,
                            "result": result,
                        }),
                    );

                    // Also emit chat-done with the output so the frontend
                    // can display it in the conversation
                    let output = if result.output.is_empty() {
                        format!("✅ `{}` — completed (exit code: {})", command_match.command.name, result.exit_code)
                    } else {
                        format!("✅ `{}`:\n{}", command_match.command.name, result.output)
                    };
                    let _ = app.emit("chat-done", &output);

                    // Return a generated conversation ID (or empty for command-only flows)
                    return Ok(String::new());
                }
                RiskTier::Medium | RiskTier::Dangerous => {
                    // Store pending execution and emit confirmation/preview event
                    let pending_id = uuid::Uuid::new_v4().to_string();
                    let pending = PendingExecution {
                        id: pending_id.clone(),
                        command: command_match.command.clone(),
                        params: command_match.params.clone(),
                        raw_input: command_match.raw_input.clone(),
                        risk: effective_risk.clone(),
                    };

                    // Build a preview of what will be executed
                    let preview = build_command_preview(&command_match.command.action, &command_match.params);

                    // Insert into pending executions (requires mutable access)
                    // We need to re-lock — since we already have a lock, we must
                    // drop it first and re-acquire
                    // Actually, we can add to a temporary holder
                    drop(state_lock);
                    let mut sl = state.lock().map_err(|e| e.to_string())?;
                    sl.pending_executions.insert(pending_id.clone(), pending);

                    let event_name = match effective_risk {
                        RiskTier::Medium => "cmd:confirm",
                        RiskTier::Dangerous => "cmd:preview",
                        _ => unreachable!(),
                    };

                    let _ = app.emit(
                        event_name,
                        &serde_json::json!({
                            "id": pending_id,
                            "command": command_match.command.name,
                            "trigger": command_match.command.trigger,
                            "params": command_match.params,
                            "risk": effective_risk,
                            "preview": preview,
                            "confirm_message": command_match.command.confirm,
                        }),
                    );

                    // Return the pending ID so the frontend can connect
                    // the confirmation dialog to this execution
                    return Ok(pending_id);
                }
            }
        }
    }

    // ===================================================================
    // STEP 2: No command matched — proceed with LLM chat as normal
    // ===================================================================

    // Resolve the conversation ID — use existing or create new
    let conv_id = {
        let state_lock = state.lock().map_err(|e| e.to_string())?;
        match conversation_id {
            Some(id) if state_lock.has_conversation(&id) => id,
            Some(id) => {
                // ID provided but not found — create it
                drop(state_lock);
                let mut s = state.lock().map_err(|e| e.to_string())?;
                let new_id = s.new_conversation(None);
                // Update the caller's ID so history is consistent
                new_id
            }
            None => {
                let mut s = state.lock().map_err(|e| e.to_string())?;
                s.new_conversation(None)
            }
        }
    };

    // Build the message list: system prompt + history + new message
    let messages = {
        let state_lock = state.lock().map_err(|e| e.to_string())?;
        let config = state_lock.settings();
        let system_prompt = crate::conversation::resolve_system_prompt(
            &config.personality.preset,
            &config.personality.custom_prompt,
        );

        let history_msgs = state_lock
            .get_conversation_messages(&conv_id)
            .unwrap_or_default();

        let mut msgs = Vec::with_capacity(history_msgs.len() + 2);
        msgs.push(Message {
            role: "system".into(),
            content: system_prompt,
        });
        msgs.extend(history_msgs);
        msgs.push(Message {
            role: "user".into(),
            content: content.clone(),
        });

        msgs
    };

    // Save user message to history
    {
        let mut state_lock = state.lock().map_err(|e| e.to_string())?;
        state_lock.append_message(
            &conv_id,
            Message {
                role: "user".into(),
                content: content.clone(),
            },
        );
    }

    // Build the chat request
    let request = ChatRequest {
        messages,
        model: None,
        temperature: None,
        max_tokens: None,
        stream: true,
    };

    // Get the provider and call chat
    let mut stream = {
        let state_lock = state.lock().map_err(|e| e.to_string())?;
        let provider = state_lock.provider();
        provider
            .chat(request)
            .await
            .map_err(|e| e.to_string())?
    };

    // Stream tokens via events
    let mut full_response = String::new();
    while let Some(result) = stream.next().await {
        match result {
            Ok(token) => {
                full_response += &token;
                app.emit("chat-token", &token).map_err(|e| e.to_string())?;
            }
            Err(e) => {
                let err_msg = e.to_string();
                let _ = app.emit("chat-error", &err_msg);
                return Err(err_msg);
            }
        }
    }

    // Save assistant response to history
    {
        let mut state_lock = state.lock().map_err(|e| e.to_string())?;
        state_lock.append_message(
            &conv_id,
            Message {
                role: "assistant".into(),
                content: full_response.clone(),
            },
        );
    }

    // Signal completion
    app.emit("chat-done", &full_response)
        .map_err(|e| e.to_string())?;

    Ok(conv_id)
}

/// Return all conversations (summaries).
#[tauri::command]
pub async fn get_history(
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<ConversationSummary>, String> {
    let state_lock = state.lock().map_err(|e| e.to_string())?;
    Ok(state_lock.list_conversations())
}

/// Create a new blank conversation and return its ID.
#[tauri::command]
pub async fn new_conversation(
    state: State<'_, Mutex<AppState>>,
) -> Result<String, String> {
    let mut state_lock = state.lock().map_err(|e| e.to_string())?;
    Ok(state_lock.new_conversation(None))
}

/// Delete a conversation by ID.
#[tauri::command]
pub async fn delete_conversation(
    state: State<'_, Mutex<AppState>>,
    id: String,
) -> Result<(), String> {
    let mut state_lock = state.lock().map_err(|e| e.to_string())?;
    if state_lock.delete_conversation(&id) {
        Ok(())
    } else {
        Err(format!("Conversation `{id}` not found"))
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build a human-readable preview of what a command action will do with
/// interpolated parameters.
fn build_command_preview(
    action: &crate::tools::commands::CommandAction,
    params: &std::collections::HashMap<String, String>,
) -> String {
    match action {
        crate::tools::commands::CommandAction::Exec { command, args } => {
            let cmd = interpolate(command, params);
            let args: Vec<String> = args.iter().map(|a| interpolate(a, params)).collect();
            let full = if args.is_empty() {
                cmd
            } else {
                format!("{} {}", cmd, args.join(" "))
            };
            format!("```sh\n{full}\n```")
        }
        crate::tools::commands::CommandAction::Script { path, args } => {
            let path = interpolate(path, params);
            let args: Vec<String> = args.iter().map(|a| interpolate(a, params)).collect();
            let full = if args.is_empty() {
                path
            } else {
                format!("{} {}", path, args.join(" "))
            };
            format!("```sh\n{full}\n```")
        }
        crate::tools::commands::CommandAction::Api { url, method, body } => {
            let url = interpolate(url, params);
            let body_preview = body
                .as_ref()
                .map(|b| format!("\nBody: {}", interpolate(b, params)))
                .unwrap_or_default();
            format!("`{method} {url}`{body_preview}")
        }
    }
}

/// Simple placeholder interpolation — replaces `{key}` with values.
fn interpolate(template: &str, params: &std::collections::HashMap<String, String>) -> String {
    let mut result = template.to_string();
    for (key, value) in params {
        result = result.replace(&format!("{{{key}}}"), value);
    }
    result
}
