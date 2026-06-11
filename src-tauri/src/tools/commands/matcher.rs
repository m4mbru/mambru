//! Regex trigger matching and named-parameter extraction.
//!
//! When the user sends a message, the [`CommandMatcher`] checks it against
//! every enabled command's trigger pattern. If a match is found, the
//! named capture groups (`(?P<name>…)`) are extracted as parameters and
//! returned alongside the matched command.

use std::collections::HashMap;

use regex::Regex;

use super::{Command, CommandMatch};

// ---------------------------------------------------------------------------
// CommandMatcher
// ---------------------------------------------------------------------------

/// Compiles command triggers into regexes and provides fast matching.
///
/// # Performance
///
/// Triggers are compiled once on construction. For v1 we iterate through
/// compiled regexes linearly — acceptable for typical command counts
/// (dozens, not hundreds). A future optimisation could use
/// `regex::RegexSet` for pre-filtering.
pub struct CommandMatcher {
    /// Compiled regex for each enabled command, paired with the command
    /// definition (so we know which command a match belongs to).
    entries: Vec<CompiledEntry>,
}

/// Internal pairing of a command with its compiled trigger regex.
struct CompiledEntry {
    command: Command,
    regex: Regex,
}

impl CommandMatcher {
    /// Build a new matcher from a slice of commands.
    ///
    /// Only enabled commands with valid triggers are included. Invalid
    /// triggers are silently skipped with a warning.
    pub fn new(commands: &[Command]) -> Self {
        let entries: Vec<CompiledEntry> = commands
            .iter()
            .filter(|c| c.enabled)
            .filter_map(|cmd| {
                match Regex::new(&cmd.trigger) {
                    Ok(re) => Some(CompiledEntry {
                        command: cmd.clone(),
                        regex: re,
                    }),
                    Err(e) => {
                        eprintln!(
                            "[mambru] WARNING: command `{}` has invalid trigger regex: {e}",
                            cmd.name
                        );
                        None
                    }
                }
            })
            .collect();

        Self { entries }
    }

    /// Check a user message against all registered triggers.
    ///
    /// Returns the **first** matching command, along with any named
    /// parameters extracted from capture groups. Returns `None` if no
    /// trigger matches.
    pub fn match_text(&self, text: &str) -> Option<CommandMatch> {
        for entry in &self.entries {
            if let Some(caps) = entry.regex.captures(text) {
                let params = Self::captures_to_map(&entry.regex, &caps);

                return Some(CommandMatch {
                    command: entry.command.clone(),
                    params,
                    raw_input: text.to_string(),
                });
            }
        }
        None
    }

    /// Extract named capture groups from a regex match into a `HashMap`.
    ///
    /// Only named groups (defined with `(?P<name>…)`) are included.
    /// Unnamed groups and the full match are skipped.
    fn captures_to_map(re: &Regex, caps: &regex::Captures) -> HashMap<String, String> {
        let mut map = HashMap::new();
        for name in re.capture_names().flatten() {
            if let Some(value) = caps.name(name) {
                map.insert(name.to_string(), value.as_str().to_string());
            }
        }
        map
    }

    /// Extract named parameters from a pattern string and an input string
    /// (standalone helper, useful for testing).
    ///
    /// This is equivalent to compiling the pattern, matching against input,
    /// and returning the named captures.
    pub fn extract_params(pattern: &str, input: &str) -> HashMap<String, String> {
        let re = match Regex::new(pattern) {
            Ok(r) => r,
            Err(_) => return HashMap::new(),
        };
        let caps = match re.captures(input) {
            Some(c) => c,
            None => return HashMap::new(),
        };
        Self::captures_to_map(&re, &caps)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::security::RiskTier;
    use crate::tools::commands::CommandAction;

    fn make_cmd(name: &str, trigger: &str) -> Command {
        Command {
            name: name.into(),
            trigger: trigger.into(),
            action: CommandAction::Exec {
                command: "echo".into(),
                args: vec!["{app}".into()],
            },
            risk: RiskTier::Safe,
            confirm: None,
            enabled: true,
        }
    }

    #[test]
    fn test_simple_match() {
        let cmd = make_cmd("abrir app", r"abrí (?P<app>\w+)");
        let matcher = CommandMatcher::new(&[cmd]);

        let result = matcher.match_text("abrí Firefox");
        assert!(result.is_some());
        let m = result.unwrap();
        assert_eq!(m.params.get("app").unwrap(), "Firefox");
    }

    #[test]
    fn test_no_match() {
        let cmd = make_cmd("abrir app", r"abrí (?P<app>\w+)");
        let matcher = CommandMatcher::new(&[cmd]);

        let result = matcher.match_text("cerrá todo");
        assert!(result.is_none());
    }

    #[test]
    fn test_disabled_command_ignored() {
        let mut cmd = make_cmd("disabled", r"hola");
        cmd.enabled = false;
        let matcher = CommandMatcher::new(&[cmd]);

        let result = matcher.match_text("hola");
        assert!(result.is_none());
    }

    #[test]
    fn test_first_match_wins() {
        let cmd1 = make_cmd("first", r"abrir");
        let cmd2 = make_cmd("second", r"abrir (?P<app>\w+)");
        let matcher = CommandMatcher::new(&[cmd1, cmd2]);

        let result = matcher.match_text("abrir Firefox");
        assert!(result.is_some());
        // First registered command matches
        assert_eq!(result.unwrap().command.name, "first");
    }

    #[test]
    fn test_multiple_params() {
        let cmd = make_cmd(
            "multi",
            r"buscá (?P<query>.+) en (?P<site>\w+)",
        );
        let matcher = CommandMatcher::new(&[cmd]);

        let result = matcher.match_text("buscá gatos en wikipedia");
        assert!(result.is_some());
        let m = result.unwrap();
        assert_eq!(m.params.get("query").unwrap(), "gatos");
        assert_eq!(m.params.get("site").unwrap(), "wikipedia");
    }

    #[test]
    fn test_raw_input_preserved() {
        let cmd = make_cmd("echo", r"echo (?P<msg>.+)");
        let matcher = CommandMatcher::new(&[cmd]);

        let result = matcher.match_text("echo hello world");
        assert_eq!(result.unwrap().raw_input, "echo hello world");
    }

    #[test]
    fn test_extract_params_standalone() {
        let params = CommandMatcher::extract_params(
            r"abrí (?P<app>\w+)",
            "abrí Firefox",
        );
        assert_eq!(params.get("app").unwrap(), "Firefox");
    }

    #[test]
    fn test_extract_params_no_match() {
        let params = CommandMatcher::extract_params(
            r"abrí (?P<app>\w+)",
            "cerrá todo",
        );
        assert!(params.is_empty());
    }

    #[test]
    fn test_extract_params_empty_on_bad_pattern() {
        let params = CommandMatcher::extract_params(
            r"[invalid",
            "anything",
        );
        assert!(params.is_empty());
    }

    // ── Table-driven tests ─────────────────────────────────────────────

    /// Test case for table-driven pattern matching.
    struct MatchCase {
        name: &'static str,
        trigger: &'static str,
        inputs: &'static [&'static str],
        expected_match: bool,
        expected_params: Option<Vec<(&'static str, &'static str)>>,
    }

    #[test]
    fn test_table_drive_match_variants() {
        let cases = vec![
            MatchCase {
                name: "basic app",
                trigger: r"abrí (?P<app>\w+)",
                inputs: &["abrí Firefox", "abrí Chrome", "abrí Terminal"],
                expected_match: true,
                expected_params: Some(vec![
                    ("app", "Firefox"),
                ]),
            },
            MatchCase {
                name: "query with spaces",
                trigger: r"buscá (?P<query>.+)",
                inputs: &["buscá gatos", "buscá el clima hoy", "buscá noticias de tecnología"],
                expected_match: true,
                expected_params: Some(vec![
                    ("query", "gatos"),
                ]),
            },
            MatchCase {
                name: "decimal number",
                trigger: r"^(\d+)$",
                inputs: &["42", "0", "999"],
                expected_match: true,
                expected_params: None,
            },
        ];

        for case in &cases {
            let cmd = make_cmd(case.name, case.trigger);
            for input in case.inputs {
                let matcher = CommandMatcher::new(&[cmd.clone()]);
                let result = matcher.match_text(input);
                assert_eq!(
                    result.is_some(),
                    case.expected_match,
                    "case '{}': input '{}' expected_match={}",
                    case.name, input, case.expected_match
                );
                if let Some(expected) = &case.expected_params {
                    let m = result.expect("expected match");
                    for (key, val) in expected {
                        // Check exact value for the first input only;
                        // subsequent inputs param values depend on the input text
                        if input == &case.inputs[0] {
                            assert_eq!(
                                m.params.get(*key),
                                Some(&val.to_string()),
                                "case '{}': param '{}' mismatch for input '{}'",
                                case.name, key, input
                            );
                        } else {
                            assert!(
                                m.params.contains_key(*key),
                                "case '{}': param '{}' missing for input '{}'",
                                case.name, key, input
                            );
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn test_table_drive_no_match_variants() {
        let cases = vec![
            MatchCase {
                name: "no match wrong lang",
                trigger: r"abrí (?P<app>\w+)",
                inputs: &["cerrá todo", "decime la hora", "qué es esto"],
                expected_match: false,
                expected_params: None,
            },
            MatchCase {
                name: "no match empty input",
                trigger: r"test (?P<val>\w+)",
                inputs: &["", "   "],
                expected_match: false,
                expected_params: None,
            },
        ];

        for case in &cases {
            let cmd = make_cmd(case.name, case.trigger);
            for input in case.inputs {
                let matcher = CommandMatcher::new(&[cmd.clone()]);
                let result = matcher.match_text(input);
                assert!(
                    result.is_none(),
                    "case '{}': input '{}' should not match",
                    case.name, input
                );
            }
        }
    }

    #[test]
    fn test_multiple_params_table_driven() {
        let cases = vec![
            (
                "search site",
                r"buscá (?P<query>.+) en (?P<site>\w+)",
                "buscá gatos en wikipedia",
                Some(vec![("query", "gatos"), ("site", "wikipedia")]),
            ),
            (
                "action item",
                r"(?i)poné (?P<item>.+) en (?P<list>\w+)",
                "poné leche en la lista",
                Some(vec![("item", "leche"), ("list", "la")]),
            ),
            (
                "no match",
                r"abrí (?P<app>\w+)",
                "what's the weather",
                None,
            ),
        ];

        for (name, trigger, input, expected) in &cases {
            let cmd = make_cmd(name, trigger);
            let matcher = CommandMatcher::new(&[cmd]);
            let result = matcher.match_text(input);

            match expected {
                Some(params) => {
                    let m = result.unwrap_or_else(|| panic!("{name}: expected match"));
                    for (key, val) in params {
                        assert_eq!(
                            m.params.get(*key),
                            Some(&val.to_string()),
                            "{name}: param '{key}' mismatch"
                        );
                    }
                }
                None => assert!(result.is_none(), "{name}: expected no match"),
            }
        }
    }
}
