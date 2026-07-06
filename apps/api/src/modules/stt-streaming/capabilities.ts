import type { STTProvider } from '../stt/types.ts';
import type { STTStreamingCapabilitiesResponse } from './types.ts';

export function getSTTStreamingCapabilities(input: {
  provider: STTProvider;
  modelId: string | null;
}): STTStreamingCapabilitiesResponse {
  const supported = input.provider === 'faster-whisper';

  return {
    provider: input.provider,
    modelId: input.modelId,
    streaming: {
      supported,
      mode: supported ? 'realtime_partial_commit' : 'unsupported',
    },
  };
}
