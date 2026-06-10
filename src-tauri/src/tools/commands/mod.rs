//! User-defined custom commands.
//!
//! Commands are defined in `~/.config/mambru/commands.toml` and allow the
//! user to extend Mambru with natural-language-triggered actions. Each
//! command has a regex trigger, an action (shell exec, script, …),
//! named parameters extracted from the trigger, and a risk level.
//!
//! # Submodules
//!
//! - `registry` — load / save / reload `commands.toml` with file watching
//! - `matcher` — regex trigger matching + named-parameter extraction
//! - `builder` — AI-assisted command creation from natural language

pub mod builder;
pub mod matcher;
pub mod registry;

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::security::RiskTier;

// ---------------------------------------------------------------------------
// Command model
// ---------------------------------------------------------------------------

/// A user-defined custom command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Command {
    /// Human-readable name (used as the primary key for CRUD).
    pub name: String,
    /// Regex pattern that triggers this command (e.g. `abrí (?P<app>\\w+)`).
    pub trigger: String,
    /// What to execute when the trigger matches.
    pub action: CommandAction,
    /// Risk tier override. When `Safe` the command auto-executes; when
    /// `Medium` a confirmation dialog is shown; `Dangerous` requires
    /// explicit approval with a preview.
    pub risk: RiskTier,
    /// Optional custom confirmation message shown in the dialog.
    pub confirm: Option<String>,
    /// Whether the command is currently active.
    pub enabled: bool,
}

/// The action a command performs.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CommandAction {
    /// Execute a shell command with optional arguments.
    #[serde(rename = "exec")]
    Exec {
        /// The command to run (e.g. `start`, `ping`, `python`).
        command: String,
        /// Arguments. Supports `{param}` interpolation from the trigger's
        /// named capture groups.
        args: Vec<String>,
    },
    /// Run a script file with optional arguments.
    #[serde(rename = "script")]
    Script {
        /// Path to the script file.
        path: String,
        /// Arguments passed to the script.
        args: Vec<String>,
    },
    /// Make an HTTP request to an API endpoint.
    #[serde(rename = "api")]
    Api {
        /// Target URL. Supports `{param}` interpolation.
        url: String,
        /// HTTP method: `GET`, `POST`, `PUT`, `DELETE`, etc.
        method: String,
        /// Optional JSON body (only for POST/PUT/PATCH).
        body: Option<String>,
    },
}

/// The result of matching a user message against the command registry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandMatch {
    /// The matched command definition.
    pub command: Command,
    /// Named parameters extracted from the trigger's capture groups.
    pub params: HashMap<String, String>,
    /// The raw user input that triggered the match.
    pub raw_input: String,
}

/// The result of executing an action.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecResult {
    /// Standard output (merged stdout + stderr for simplicity).
    pub output: String,
    /// Exit code. `0` indicates success.
    pub exit_code: i32,
}
