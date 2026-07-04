export function decodePcm16ToFloat32(input: Uint8Array) {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const output = new Float32Array(input.byteLength / 2);

  for (let index = 0; index < output.length; index += 1) {
    const value = view.getInt16(index * 2, true);
    output[index] = Math.max(-1, value / 32768);
  }

  return output;
}

export class TTSPcmStreamPlayer {
  private audioContext: AudioContext | null = null;
  private activeGainNode: GainNode | null = null;

  private ensureAudioContext() {
    if (this.audioContext) {
      return this.audioContext;
    }

    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    return this.audioContext;
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
  }
}
