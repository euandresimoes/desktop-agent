export function decodePcm16ToFloat32(input: Uint8Array) {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const output = new Float32Array(input.byteLength / 2);

  for (let index = 0; index < output.length; index += 1) {
    const value = view.getInt16(index * 2, true);
    output[index] = Math.max(-1, value / 32768);
  }

  return output;
}

export function calculateStreamDrainDelayMs(
  nextStartTime: number,
  currentTime: number,
  settleMs = 32,
) {
  return Math.max(0, Math.ceil((nextStartTime - currentTime) * 1000) + settleMs);
}

export class TTSPcmStreamPlayer {
  private audioContext: AudioContext | null = null;
  private activeGainNode: GainNode | null = null;
  private nextStartTime = 0;

  private ensureAudioContext() {
    if (this.audioContext) {
      return this.audioContext;
    }

    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.activeGainNode = this.audioContext.createGain();
    this.activeGainNode.connect(this.audioContext.destination);
    return this.audioContext;
  }

  async enqueueChunk(input: {
    pcmBytes: Uint8Array;
    sampleRate: number;
    channels: number;
    volume?: number;
  }) {
    const audioContext = this.ensureAudioContext();

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    if (!this.activeGainNode) {
      this.activeGainNode = audioContext.createGain();
      this.activeGainNode.connect(audioContext.destination);
    }

    this.activeGainNode.gain.value = input.volume ?? 1;

    const channelCount = Math.max(1, input.channels);
    const decoded = decodePcm16ToFloat32(input.pcmBytes);
    const frameCount = Math.floor(decoded.length / channelCount);
    const audioBuffer = audioContext.createBuffer(
      channelCount,
      frameCount,
      input.sampleRate,
    );

    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const channelData = audioBuffer.getChannelData(channelIndex);

      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        channelData[frameIndex] =
          decoded[frameIndex * channelCount + channelIndex] ?? 0;
      }
    }

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.activeGainNode);

    const startAt = Math.max(audioContext.currentTime + 0.01, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + audioBuffer.duration;
  }

  async waitForDrain(settleMs = 32) {
    if (!this.audioContext) {
      return;
    }

    const delayMs = calculateStreamDrainDelayMs(
      this.nextStartTime,
      this.audioContext.currentTime,
      settleMs,
    );

    if (delayMs <= 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  async fadeOutAndStop(durationMs = 30) {
    if (!this.audioContext || !this.activeGainNode) {
      return;
    }

    const now = this.audioContext.currentTime;
    this.activeGainNode.gain.cancelScheduledValues(now);
    this.activeGainNode.gain.setValueAtTime(this.activeGainNode.gain.value, now);
    this.activeGainNode.gain.linearRampToValueAtTime(0, now + durationMs / 1000);

    await new Promise((resolve) => setTimeout(resolve, durationMs));
    this.close();
  }

  bindGainNode(gainNode: GainNode) {
    this.ensureAudioContext();
    this.activeGainNode = gainNode;
  }

  close() {
    if (this.audioContext) {
      void this.audioContext.close();
    }

    this.audioContext = null;
    this.activeGainNode = null;
    this.nextStartTime = 0;
  }
}
