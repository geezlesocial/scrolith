# Phase 21.1.2R — MediaRecorder Compatibility

Probe `MediaRecorder.isTypeSupported` order: webm/opus, webm, ogg, mp4, aac, mpeg. Persist actual `recorder.mimeType`. Extension derived from MIME. Never hard-code webm filename for mp4 blobs.
