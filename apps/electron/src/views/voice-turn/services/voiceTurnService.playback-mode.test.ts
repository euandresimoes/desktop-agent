import assert from "node:assert/strict";
import { resolveTTSPlaybackMode } from "./voiceTurnPlaybackMode.ts";

const standard = resolveTTSPlaybackMode("standard", {
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

assert.equal(standard, "standard");

const streamed = resolveTTSPlaybackMode("stream", {
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

assert.equal(streamed, "stream");

console.log("voice turn playback mode runtime checks passed");
