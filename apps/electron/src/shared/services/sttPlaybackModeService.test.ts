import assert from "node:assert/strict";
import {
  mapSTTCapabilitiesToModeOptions,
  normalizeSTTPlaybackModeAgainstCapabilities,
} from "./sttPlaybackModeService.ts";

assert.deepEqual(mapSTTCapabilitiesToModeOptions(null), [
  { value: "standard", label: "Standard" },
]);

assert.deepEqual(
  mapSTTCapabilitiesToModeOptions({
    provider: "faster-whisper",
    modelId: "small",
    streaming: {
      supported: true,
      mode: "realtime_partial_commit",
    },
  }),
  [
    { value: "standard", label: "Standard" },
    { value: "stream", label: "Streaming (Experimental)" },
  ],
);

assert.equal(
  normalizeSTTPlaybackModeAgainstCapabilities("stream", {
    provider: "transformers",
    modelId: "base",
    streaming: {
      supported: false,
      mode: "unsupported",
    },
  }),
  "standard",
);

console.log("stt playback mode runtime checks passed");
