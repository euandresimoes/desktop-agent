import assert from "node:assert/strict";
import { getTTSCapabilities } from "../modules/piper-tts/capabilities.ts";

const capabilities = getTTSCapabilities({
  provider: "piper",
  supportsChunkedPostSynthesis: true,
});

assert.equal(capabilities.provider, "piper");
assert.equal(capabilities.playbackModes.standard.supported, true);
assert.equal(capabilities.playbackModes.standard.recommended, true);
assert.equal(capabilities.playbackModes.stream.supported, true);
assert.equal(capabilities.playbackModes.stream.experimental, true);
assert.equal(
  capabilities.playbackModes.stream.kind,
  "post_synthesis_chunked",
);

console.log("tts capabilities runtime checks passed");
