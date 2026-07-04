import assert from "node:assert/strict";
import { normalizePlaybackModeAgainstCapabilities } from "./ttsCapabilitiesService.ts";

const normalized = normalizePlaybackModeAgainstCapabilities("stream", {
  provider: "future-provider",
  playbackModes: {
    standard: { supported: true, recommended: true },
    stream: {
      supported: false,
      recommended: false,
      experimental: false,
      kind: "unsupported",
    },
  },
});

assert.equal(normalized, "standard");
console.log("tts playback normalization runtime checks passed");
