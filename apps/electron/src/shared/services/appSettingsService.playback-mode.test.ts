import assert from "node:assert/strict";
import {
  DEFAULT_APP_SETTINGS,
  APP_STT_PLAYBACK_MODES,
  APP_TTS_PLAYBACK_MODES,
  isAppSttPlaybackMode,
  isAppTtsPlaybackMode,
} from "../types/app-settings.ts";

assert.deepEqual(APP_STT_PLAYBACK_MODES, ["standard", "stream"]);
assert.deepEqual(APP_TTS_PLAYBACK_MODES, ["standard", "stream"]);
assert.equal(DEFAULT_APP_SETTINGS.sttPlaybackMode, "standard");
assert.equal(DEFAULT_APP_SETTINGS.ttsPlaybackMode, "standard");
assert.equal(isAppSttPlaybackMode("standard"), true);
assert.equal(isAppSttPlaybackMode("stream"), true);
assert.equal(isAppSttPlaybackMode("invalid"), false);
assert.equal(isAppTtsPlaybackMode("standard"), true);
assert.equal(isAppTtsPlaybackMode("stream"), true);
assert.equal(isAppTtsPlaybackMode("invalid"), false);

console.log("app settings playback mode runtime checks passed");
