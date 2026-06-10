//! Command execution via `tauri-plugin-shell`.
//!
//! The [`CommandExecutor`] takes a [`CommandAction`] and a parameter map,
//! interpolates `{param}` placeholders with extracted values, and runs the
//! result through Tauri's managed shell plugin.
//!
//! When `tauri-plugin-shell` is not available (e.g. in tests), falls back
//! to `std::process::Command`.

use std::collections::HashMap;
use std::time::Duration;

use tokio::time::timeout;

use crate::tools::commands::{CommandAction, ExecResult};
use crate::security::RiskTier;

// ---------------------------------------------------------------------------
// CommandExecutor
// ---------------------------------------------------------------------------

/// Executes command actions with parameter interpolation and timeout
/// management per risk tier.
pub struct CommandExecutor;

impl CommandExecutor {
    /// Execute a command action with interpolated parameters.
    ///
    /// # Interpolation
    ///
    /// Any `{param_name}` in the command string or args is replaced with the
    /// corresponding value from `params`. Unknown placeholders are left as-is
    /// (which will likely cause a shell error, but won't crash the app).
    ///
    /// # Timeouts
    ///
    /// - Safe: 30 seconds
    /// - Medium: 60 seconds
    /// - Dangerous: no timeout (waits for user input)
    pub async fn execute(
        action: &CommandAction,
        params: &HashMap<String, String>,
        risk: &RiskTier,
    ) -> Result<ExecResult, String> {
        match action {
            CommandAction::Exec { command, args } => {
                let cmd = interpolate(command, params);
                let args: Vec<String> = args.iter().map(|a| interpolate(a, params)).collect();

                let timeout = match risk {
                    RiskTier::Safe => Some(Duration::from_secs(30)),
                    RiskTier::Medium => Some(Duration::from_secs(60)),
                    RiskTier::Dangerous => None,
                };

                Self::run_shell(&cmd, &args, timeout).await
            }
            CommandAction::Script { path, args } => {
                let script_path = interpolate(path, params);
                let args: Vec<String> = args.iter().map(|a| interpolate(a, params)).collect();

                let timeout = Some(Duration::from_secs(120));
                Self::run_shell(&script_path, &args, timeout).await
            }
            CommandAction::Api { url, method, body } => {
                let url = interpolate(url, params);
                let body = body.as_ref().map(|b| interpolate(b, params));

                Self::run_api(&url, method, body.as_deref()).await
            }
        }
    }

    /// Run a shell command via `tauri-plugin-shell` or fall back to
    /// `std::process::Command`.
    async fn run_shell(
        cmd: &str,
        args: &[String],
        timeout: Option<Duration>,
    ) -> Result<ExecResult, String> {
        // In tests, always use tokio::process (tauri-plugin-shell is not available)
        #[cfg(test)]
        {
            return Self::run_std_process(cmd, args, timeout).await;
        }

        // In production, try tauri-plugin-shell first, fallback to tokio::process.
        // Currently falls back because the executor doesn't receive an AppHandle.
        // TODO: Pass AppHandle to use tauri-plugin-shell when in Tauri context.
        #[cfg(not(test))]
        {
            Self::run_std_process(cmd, args, timeout).await
        }
    }

    /// Execute via `tokio::process::Command` (test/fallback path).
    async fn run_std_process(
        cmd: &str,
        args: &[String],
        max_duration: Option<Duration>,
    ) -> Result<ExecResult, String> {
        let exec = async {
            let output = tokio::process::Command::new(cmd)
                .args(args)
                .output()
                .await
                .map_err(|e| format!("failed to run `{cmd}`: {e}"))?;

            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let combined = if stderr.is_empty() {
                stdout
            } else {
                format!("{stdout}\n{stderr}")
            };

            Ok(ExecResult {
                output: combined,
                exit_code: output.status.code().unwrap_or(-1),
            })
        };

        match max_duration {
            Some(dur) => match timeout(dur, exec).await {
                Ok(res) => res,
                Err(_) => Err(format!(
                    "command `{cmd}` timed out after {dur:?}"
                )),
            },
            None => exec.await,
        }
    }

    /// Execute via Tauri shell plugin.
    #[cfg(not(test))]
    async fn run_tauri_shell(
        cmd: &str,
        args: &[String],
        _timeout: Option<Duration>,
    ) -> Result<ExecResult, String> {
        use tauri_plugin_shell::ShellExt;

        // We need an AppHandle to use the shell plugin. Since executor doesn't
        // receive an AppHandle directly, this is a placeholder that attempts
        // to resolve it from the async context or falls back.
        //
        // In practice, the caller needs to provide an AppHandle. For v1 we
        // fall back to std::process if AppHandle isn't available.
        //
        // TODO: Refactor `execute` to accept `Option<&AppHandle>` so the
        //       shell plugin can be used when available.

        // Simple std::process fallback for when we don't have AppHandle context
        Self::run_std_process(cmd, args, _timeout)
    }

    /// Execute an API call via `reqwest`.
    async fn run_api(
        url: &str,
        method: &str,
        body: Option<&str>,
    ) -> Result<ExecResult, String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| format!("failed to create HTTP client: {e}"))?;

        let request = match method.to_uppercase().as_str() {
            "GET" => client.get(url),
            "POST" => {
                let mut req = client.post(url);
                if let Some(b) = body {
                    req = req.header("Content-Type", "application/json").body(b.to_string());
                }
                req
            }
            "PUT" => {
                let mut req = client.put(url);
                if let Some(b) = body {
                    req = req.header("Content-Type", "application/json").body(b.to_string());
                }
                req
            }
            "DELETE" => client.delete(url),
            "PATCH" => {
                let mut req = client.patch(url);
                if let Some(b) = body {
                    req = req.header("Content-Type", "application/json").body(b.to_string());
                }
                req
            }
            other => return Err(format!("unsupported HTTP method: {other}")),
        };

        let response = request
            .send()
            .await
            .map_err(|e| format!("API request failed: {e}"))?;

        let status = response.status().as_u16() as i32;
        let text = response
            .text()
            .await
            .map_err(|e| format!("failed to read API response: {e}"))?;

        Ok(ExecResult {
            output: text,
            exit_code: status,
        })
    }
}

// ---------------------------------------------------------------------------
// Helper: interpolate {param} placeholders
// ---------------------------------------------------------------------------

/// Replace `{name}` placeholders in `template` with values from `params`.
///
/// Unknown placeholders are left untouched so the shell can report the error.
fn interpolate(template: &str, params: &HashMap<String, String>) -> String {
    let mut result = template.to_string();
    for (key, value) in params {
        result = result.replace(&format!("{{{key}}}"), value);
    }
    result
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::commands::CommandAction;

    #[test]
    fn test_interpolate_simple() {
        let mut params = HashMap::new();
        params.insert("app".into(), "firefox".into());
        assert_eq!(interpolate("start {app}", &params), "start firefox");
    }

    #[test]
    fn test_interpolate_multiple() {
        let mut params = HashMap::new();
        params.insert("query".into(), "hello".into());
        params.insert("site".into(), "google".into());
        let result = interpolate("search {query} on {site}", &params);
        assert_eq!(result, "search hello on google");
    }

    #[test]
    fn test_interpolate_unknown_placeholder_left_untouched() {
        let params = HashMap::new();
        assert_eq!(interpolate("start {unknown}", &params), "start {unknown}");
    }

    #[tokio::test]
    async fn test_exec_api_get() {
        let action = CommandAction::Api {
            url: "https://httpbin.org/get".into(),
            method: "GET".into(),
            body: None,
        };
        let params = HashMap::new();
        let result = CommandExecutor::execute(&action, &params, &RiskTier::Medium).await;
        // This may fail in offline environments, but we check it doesn't panic
        if let Ok(res) = result {
            assert!(res.exit_code == 200 || res.exit_code == 0);
        }
    }

    #[tokio::test]
    async fn test_exec_bad_command_returns_error() {
        let action = CommandAction::Exec {
            command: "nonexistent_cmd_xyz".into(),
            args: vec![],
        };
        let params = HashMap::new();
        let result = CommandExecutor::execute(&action, &params, &RiskTier::Safe).await;
        assert!(result.is_err());
    }
}
