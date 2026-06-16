# Delta for Voice Pipeline

## ADDED Requirements

### Requirement: Continuous Capture Mode

The system MUST support an always-listening continuous capture mode where the microphone stays active and VAD auto-triggers transcription when speech ends.

#### Scenario: Continuous capture enabled by default

- GIVEN the application starts
- WHEN voice models are available
- THEN continuous capture mode SHALL be active by default
- AND the microphone SHALL begin listening without user action

#### Scenario: Speech segment auto-transcribed

- GIVEN continuous capture is active
- WHEN the user speaks and then stops for 800ms (VAD silence threshold)
- THEN the captured audio SHALL be transcribed automatically
- AND the transcription SHALL be sent as a user message
- AND capture SHALL resume immediately for the next segment

#### Scenario: Toggle to PTT

- GIVEN continuous capture is active
- WHEN the user toggles to push-to-talk mode in settings
- THEN the system SHALL revert to PTT behavior (hold key to record, release to transcribe)
- AND the microphone SHALL stop capturing when not in use

#### Scenario: Continuous capture paused during TTS

- GIVEN Mambru is speaking via TTS
- WHEN continuous capture is active
- THEN the system SHOULD pause listening to avoid capturing Mambru's own voice
- AND resume after TTS finishes
