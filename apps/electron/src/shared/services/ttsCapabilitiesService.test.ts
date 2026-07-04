import assert from "node:assert/strict";
import { mapTTSCapabilitiesToModeOptions } from "./ttsCapabilitiesService.ts";

const options = mapTTSCapabilitiesToModeOptions({
  provider: "piper",
  playbackModes: {
    standard: { supported: true, recommended: true },
    stream: {
      supported: true,
      recommended: false,
      experimental: true,
      kind: "post_synthesis_chunked",
    },
  },
});

assert.equal(options.length, 2);
assert.equal(options[0]?.value, "standard");
assert.equal(options[1]?.label, "Streaming (Experimental)");

console.log("tts capabilities frontend runtime checks passed");
