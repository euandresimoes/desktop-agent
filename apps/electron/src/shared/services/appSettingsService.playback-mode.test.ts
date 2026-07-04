import assert from "node:assert/strict";
import {
  DEFAULT_APP_SETTINGS,
  APP_TTS_PLAYBACK_MODES,
  isAppTtsPlaybackMode,
} from "../types/app-settings.ts";

assert.deepEqual(APP_TTS_PLAYBACK_MODES, ["standard", "stream"]);
assert.equal(DEFAULT_APP_SETTINGS.ttsPlaybackMode, "standard");
assert.equal(isAppTtsPlaybackMode("standard"), true);
assert.equal(isAppTtsPlaybackMode("stream"), true);
assert.equal(isAppTtsPlaybackMode("invalid"), false);

console.log("app settings playback mode runtime checks passed");
