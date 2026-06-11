# Model Download Specification

## Purpose

On first launch, when Whisper or Piper models are absent, the app shows a download dialog that lets the user download missing models with progress feedback, then degrades gracefully to text-only mode if the user skips or a download fails.

## Requirements

### Requirement: Model Detection at Startup

The system MUST scan well-known model directories for the Whisper base model (`ggml-base.bin`) and Piper voice files (`.tflite` + `.json`) on each launch.

#### Scenario: All models found, skip dialog

- GIVEN both Whisper `ggml-base.bin` and Piper `.tflite` + `.json` files exist in `{app_data_dir}/models/whisper/` and `{app_data_dir}/models/piper/`
- WHEN the application initializes
- THEN no download dialog is shown
- AND voice features are fully enabled

#### Scenario: Some models missing, show download dialog

- GIVEN the Whisper model is absent OR the Piper model is absent
- WHEN the application initializes
- THEN a download dialog is displayed listing the missing models
- AND voice features are disabled until models are downloaded

### Requirement: Download Dialog

The system MUST display a modal dialog listing each missing model with name, size, and status, offering "Download" (primary) and "Skip — text only" (secondary).

#### Scenario: User clicks Download

- GIVEN the download dialog is shown with missing models listed
- WHEN the user clicks "Download"
- THEN models download sequentially with per-model progress feedback

#### Scenario: User clicks Skip

- GIVEN the download dialog is shown
- WHEN the user clicks "Skip — text only"
- THEN the dialog is dismissed
- AND the app proceeds in text-only mode
- AND Settings shows a "Download models" button

#### Scenario: User closes dialog

- GIVEN the download dialog is shown
- WHEN the user closes the dialog window
- THEN it is treated equivalent to Skip
- AND no models are downloaded

### Requirement: Download Progress

The system MUST stream model downloads via `reqwest`, emit progress events via `app_handle.emit("model:progress", {name, bytes, total})`, and on completion verify and register the model.

#### Scenario: Download succeeds

- GIVEN a model download is in progress
- WHEN all bytes are received
- THEN the file hash and size are verified
- AND Piper `.tar.gz` is extracted to reveal `.tflite` + `.json`
- AND the model is registered in app state
- AND the frontend emits a per-model "done" status

#### Scenario: Download fails with retry

- GIVEN a model download encounters a network error
- WHEN the download fails partway
- THEN a retry option is shown per model
- AND partial data is NOT cleaned up until retry is accepted or cancelled

#### Scenario: Download cancelled mid-way

- GIVEN a model download is in progress
- WHEN the user cancels the download
- THEN any partial files are cleaned up
- AND the dialog returns to the initial state

### Requirement: Error Handling

The system MUST surface per-model error states with actionable recovery options.

#### Scenario: Network goes down mid-download

- GIVEN the download is in progress
- WHEN the network connection is lost
- THEN a retry button is shown for the affected model
- AND other models continue unaffected (if sequential, the queue pauses)

#### Scenario: Disk space insufficient

- GIVEN a model download is requested
- WHEN the system reports insufficient disk space
- THEN the download is not started
- AND a user-friendly message is shown with a link to manual download instructions

#### Scenario: Corrupted download detected

- GIVEN a model download completes
- WHEN the file hash or size does not match the expected value
- THEN the cached file is purged
- AND a re-download option is offered

### Requirement: Graceful Fallback

The system MUST function in text-only mode when voice models are absent, with per-feature degradation.

#### Scenario: PTT disabled gracefully

- GIVEN the Whisper model was not downloaded or failed
- WHEN the application runs
- THEN push-to-talk is disabled
- AND the mic icon is hidden from the chat UI

#### Scenario: TTS disabled gracefully

- GIVEN the Piper model was not downloaded or failed
- WHEN the application runs
- THEN TTS is disabled
- AND the TTS toggle is hidden from the chat UI
- AND responses are text-only

#### Scenario: Re-download from Settings

- GIVEN models were previously skipped or failed
- WHEN the user navigates to Settings
- THEN a "Download models" button is displayed next to the missing model status
- AND clicking it opens the download dialog again
