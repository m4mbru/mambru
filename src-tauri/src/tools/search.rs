//! Web search client supporting Tavily (primary) and SerpAPI (fallback).
//!
//! Results are returned as structured [`SearchResult`] items that the LLM
//! can summarise inline in the conversation.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// SearchResult
// ---------------------------------------------------------------------------

/// A single search result entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

// ---------------------------------------------------------------------------
// SearchClient
// ---------------------------------------------------------------------------

/// Client for web search APIs.
///
/// # Providers
///
/// * **Tavily** (primary) — `provider = "tavily"`, API key from settings
/// * **SerpAPI** (fallback) — `provider = "serpapi"`, API key from settings
pub struct SearchClient {
    provider: String,
    api_key: String,
    max_results: usize,
}

impl SearchClient {
    /// Create a new search client.
    ///
    /// * `provider` — `"tavily"` or `"serpapi"`
    /// * `api_key` — the API key for the chosen provider
    /// * `max_results` — max results per query (default 5)
    pub fn new(provider: &str, api_key: &str, max_results: Option<usize>) -> Self {
        Self {
            provider: provider.to_lowercase(),
            api_key: api_key.to_string(),
            max_results: max_results.unwrap_or(5),
        }
    }

    /// Perform a web search and return structured results.
    pub async fn search(&self, query: &str) -> Result<Vec<SearchResult>, String> {
        if self.api_key.is_empty() {
            return Err("Search API key is not configured. Please add your API key in Settings.".into());
        }

        match self.provider.as_str() {
            "tavily" => self.search_tavily(query).await,
            "serpapi" => self.search_serpapi(query).await,
            other => Err(format!("Unknown search provider: `{other}`. Use 'tavily' or 'serpapi'.")),
        }
    }

    /// Search via Tavily API.
    async fn search_tavily(&self, query: &str) -> Result<Vec<SearchResult>, String> {
        let url = "https://api.tavily.com/search";

        let mut body = HashMap::new();
        body.insert("api_key", &self.api_key);
        body.insert("query", query);
        body.insert("max_results", &self.max_results.to_string());
        body.insert("search_depth", "basic");

        let client = reqwest::Client::new();
        let response = client
            .post(url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Tavily request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Tavily returned HTTP {status}: {text}"));
        }

        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Tavily response: {e}"))?;

        let results = data["results"]
            .as_array()
            .ok_or_else(|| "Tavily response missing `results` array".to_string())?;

        let search_results: Vec<SearchResult> = results
            .iter()
            .map(|item| SearchResult {
                title: item["title"].as_str().unwrap_or("").to_string(),
                url: item["url"].as_str().unwrap_or("").to_string(),
                snippet: item["content"].as_str().unwrap_or("").to_string(),
            })
            .collect();

        Ok(search_results)
    }

    /// Search via SerpAPI.
    async fn search_serpapi(&self, query: &str) -> Result<Vec<SearchResult>, String> {
        let url = "https://serpapi.com/search";

        let params = [
            ("q", query),
            ("api_key", &self.api_key),
            ("num", &self.max_results.to_string()),
            ("engine", "google"),
        ];

        let client = reqwest::Client::new();
        let response = client
            .get(url)
            .query(&params)
            .send()
            .await
            .map_err(|e| format!("SerpAPI request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("SerpAPI returned HTTP {status}: {text}"));
        }

        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse SerpAPI response: {e}"))?;

        let results = data["organic_results"]
            .as_array()
            .ok_or_else(|| "SerpAPI response missing `organic_results` array".to_string())?;

        let search_results: Vec<SearchResult> = results
            .iter()
            .map(|item| SearchResult {
                title: item["title"].as_str().unwrap_or("").to_string(),
                url: item["link"].as_str().unwrap_or("").to_string(),
                snippet: item["snippet"].as_str().unwrap_or("").to_string(),
            })
            .collect();

        Ok(search_results)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_api_key_returns_error() {
        let client = SearchClient::new("tavily", "", None);
        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(client.search("test query"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("API key is not configured"));
    }

    #[test]
    fn test_unknown_provider_returns_error() {
        let client = SearchClient::new("unknown_provider", "key", None);
        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(client.search("test"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown search provider"));
    }

    #[test]
    fn test_new_sets_default_max_results() {
        let client = SearchClient::new("tavily", "key", None);
        assert_eq!(client.max_results, 5);
    }

    #[test]
    fn test_new_sets_custom_max_results() {
        let client = SearchClient::new("serpapi", "key", Some(10));
        assert_eq!(client.max_results, 10);
    }

    #[test]
    fn test_search_provider_case_insensitive() {
        let client = SearchClient::new("TAVILY", "key", None);
        assert_eq!(client.provider, "tavily");
    }
}
