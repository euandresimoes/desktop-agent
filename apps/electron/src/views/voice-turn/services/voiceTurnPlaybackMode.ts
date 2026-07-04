import {
  normalizePlaybackModeAgainstCapabilities,
  type TTSCapabilitiesResponse,
} from "../../../shared/services/ttsCapabilitiesService.ts";

export function resolveTTSPlaybackMode(
  preferredMode: "standard" | "stream",
  capabilities: TTSCapabilitiesResponse | null,
) {
  return normalizePlaybackModeAgainstCapabilities(preferredMode, capabilities);
}
