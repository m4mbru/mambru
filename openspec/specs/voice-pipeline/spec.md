# Voice Pipeline Specification

## Purpose

The voice pipeline enables speech input and optional speech output. A push-to-talk interaction captures audio on key hold, transcribes it via local whisper.cpp, feeds the text to the LLM, and optionally reads the response aloud via Piper TTS.

## Requirements

### Requirement: Push-to-Talk Capture

The system MUST capture microphone audio while a configurable key is held and stop capture when released.

#### Scenario: Hold to record, release to transcribe

- GIVEN the user presses and holds the push-to-talk key
- WHEN audio capture begins
- THEN the UI shows a recording indicator
- AND when the key is released, capture stops and transcription begins

#### Scenario: No audio device

- GIVEN no microphone is available on the system
- WHEN the user presses the push-to-talk key
- THEN capture fails gracefully
- AND the UI shows a "no microphone detected" message

### Requirement: Audio Chunking

The system MUST capture audio via the `cpal` crate in 100ms chunks for real-time processing.

#### Scenario: Chunks stream continuously

- GIVEN push-to-talk is active
- WHEN 100ms of audio is captured
- THEN the chunk is buffered for VAD processing
- AND capture continues until key release

### Requirement: Voice Activity Detection

The system MUST use WebRTC VAD (via the `webrtc-vad` crate) to detect speech segments and filter silence.

#### Scenario: Silence is trimmed

- GIVEN the user holds the key but does not speak
- WHEN audio chunks are processed by VAD
- THEN no speech segments are detected
- AND transcription is not initiated

#### Scenario: Speech is detected

- GIVEN the user speaks during recording
- WHEN VAD processes the audio chunks
- THEN speech segments are identified
- AND non-speech segments are trimmed from the input

#### Scenario: VAD configured for silence trimming

- GIVEN the push-to-talk key is held
- WHEN the VAD engine is initialized
- THEN the VAD mode is set to aggressive for maximum silence suppression
- AND the sample rate is configured at 16 kHz
- AND the frame duration is set to 30 ms

### Requirement: Speech-to-Text

The system MUST transcribe recorded audio to text using whisper.cpp via the `whisper-rs` crate.

#### Scenario: Successful transcription

- GIVEN audio was captured with clear speech
- WHEN transcription completes
- THEN the transcribed text is sent to the chat as a user message
- AND the LLM processes it like any text message

#### Scenario: Unclear audio

- GIVEN the captured audio contains noise or unclear speech
- WHEN transcription completes
- THEN the best-guess transcription is sent to chat
- AND the user can edit the text before sending

### Requirement: Text-to-Speech

The system SHOULD generate audio from LLM response text using Piper TTS, if TTS models are available.

#### Scenario: TTS playback with models present

- GIVEN Piper TTS model files are available
- WHEN the LLM finishes a response
- THEN audio is generated from the response text
- AND played back via `rodio`

#### Scenario: TTS unavailable

- GIVEN Piper TTS models are not found
- WHEN the LLM finishes a response
- THEN no audio is generated
- AND the response is displayed as text only
- AND the user is notified once that TTS is unavailable

#### Scenario: Piper binary not found at startup

- GIVEN the Piper binary is not on the system PATH and not found at configured install paths
- WHEN the application initializes the TTS backend
- THEN TTS is disabled
- AND the user is notified that TTS requires the Piper binary
- AND the model download dialog offers a Piper download option

### Requirement: Audio Playback

The system MUST play generated audio via the `rodio` crate.

#### Scenario: Audio plays without interrupting input

- GIVEN TTS audio is ready
- WHEN playback starts via rodio
- THEN the user can continue typing or speaking
- AND playback does not block the UI

### Requirement: Voice Fallback

The system MUST operate in text-only mode when voice models or audio devices are unavailable, without crashing.

#### Scenario: No voice models at startup

- GIVEN whisper or Piper models are missing at launch
- WHEN the application starts
- THEN the voice features are disabled
- AND the chat functions normally in text-only mode
- AND the Settings show which voice dependencies are missing

#### Scenario: Download dialog shown instead of silent disable

- GIVEN whisper or Piper models are not found at startup
- WHEN the application initializes voice features
- THEN a download dialog is displayed listing the missing models
- AND the user can download them or dismiss to proceed in text-only mode
