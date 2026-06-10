# Web Search Specification

## Purpose

Web search enables Mambru to retrieve real-time information from the internet via Tavily or SerpAPI, summarizing results inline within the chat conversation.

## Requirements

### Requirement: Search API Integration

The system MUST integrate with at least one search API — Tavily or SerpAPI — to perform web searches.

#### Scenario: Search returns results

- GIVEN a configured search API with a valid API key
- WHEN a search query is submitted
- THEN the API returns search results
- AND the results include title, URL, and snippet for each entry

#### Scenario: API key invalid or missing

- GIVEN no valid search API key is configured
- WHEN a search is attempted
- THEN the system returns a clear error
- AND the user is directed to configure the API key in Settings

### Requirement: LLM-Triggered Search

The system MUST allow the LLM to decide when to perform a web search based on the user's query and conversation context.

#### Scenario: LLM identifies search need

- GIVEN the user asks a question requiring current information (e.g., "qué tiempo hace hoy")
- WHEN the LLM determines a web search would help
- THEN a search query is extracted
- AND the search is executed automatically

#### Scenario: LLM declines search on factual question

- GIVEN the user asks about general knowledge the LLM already knows
- WHEN the LLM determines a search is unnecessary
- THEN no search is performed
- AND the LLM answers from its training data

### Requirement: Inline Results Presentation

The system MUST summarize search results via the LLM and display them inline in the chat as part of the response.

#### Scenario: Results summarized in chat

- GIVEN search results have been retrieved
- WHEN the LLM processes them into a natural language summary
- THEN the summary appears in the chat as part of the LLM response
- AND source URLs are linked for reference

#### Scenario: No results found

- GIVEN the search API returns zero results
- WHEN results are processed
- THEN the LLM responds indicating no results were found
- AND suggests refining the query

### Requirement: API Key Configuration

The system MUST allow the user to configure the search API key and provider selection (Tavily or SerpAPI) through the Settings UI.

#### Scenario: Configure search provider

- GIVEN the user opens Settings
- WHEN they select a search provider and enter an API key
- THEN the configuration is persisted
- AND the new provider is used for subsequent searches
