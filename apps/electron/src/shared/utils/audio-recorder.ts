export function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const floatTo16BitPCM = (output: DataView, offset: number, input: Float32Array) => {
    for (let i = 0; i < input.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
  };

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw pcm) */
  view.setUint16(20, 1, true);
  /* channel count (mono) */
  view.setUint16(22, 1, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);

  floatTo16BitPCM(view, 44, samples);

  return new Blob([view], { type: 'audio/wav' });
}

export type AudioRecorderStopResult = {
  audioBlob: Blob;
  totalDurationMs: number;
  speechDurationMs: number;
  peakRms: number;
  hasMeaningfulSpeech: boolean;
};

type AudioRecorderOptions = {
  silenceThreshold?: number;
  silenceDurationMs?: number;
  selectedDeviceId?: string;
  inputGain?: number;
  waitForSpeechActivation?: boolean;
  activationThreshold?: number;
  activationMinDurationMs?: number;
  preRollMs?: number;
  onVolume?: (volume: number) => void;
  onPcmChunk?: (chunk: {
    samples: Float32Array;
    sampleRate: number;
  }) => void;
  onSpeechActivation?: () => void;
  onSilenceDetected?: () => void;
};

export class AudioRecorder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private samples: Float32Array[] = [];
  private totalLength = 0;
  private isRecording = false;
  private startedAtMs = 0;
  private speechDurationMs = 0;
  private peakRms = 0;
  private hasDetectedSpeech = false;
  private isSpeechActivated = false;
  private activationDurationMs = 0;
  private preRollChunks: Float32Array[] = [];
  private preRollLength = 0;

  constructor(private options: AudioRecorderOptions = {}) {}

  private resetBuffers() {
    this.samples = [];
    this.totalLength = 0;
    this.speechDurationMs = 0;
    this.peakRms = 0;
    this.hasDetectedSpeech = false;
    this.isSpeechActivated = !this.options.waitForSpeechActivation;
    this.activationDurationMs = 0;
    this.preRollChunks = [];
    this.preRollLength = 0;
  }

  private pushPreRollChunk(chunk: Float32Array, sampleRate: number) {
    const maxPreRollMs = this.options.preRollMs ?? 500;

    if (maxPreRollMs <= 0) {
      return;
    }

    const maxPreRollSamples = Math.max(
      1,
      Math.round((sampleRate * maxPreRollMs) / 1000),
    );

    this.preRollChunks.push(chunk);
    this.preRollLength += chunk.length;

    while (this.preRollLength > maxPreRollSamples && this.preRollChunks.length > 0) {
      const removed = this.preRollChunks.shift();
      this.preRollLength -= removed?.length ?? 0;
    }
  }

  private appendCommittedChunk(
    chunk: Float32Array,
    sampleRate: number,
    shouldEmitChunk = true,
  ) {
    this.samples.push(chunk);
    this.totalLength += chunk.length;

    if (shouldEmitChunk) {
      this.options.onPcmChunk?.({
        samples: chunk,
        sampleRate,
      });
    }
  }

  private commitPreRoll(sampleRate: number) {
    for (const chunk of this.preRollChunks) {
      this.appendCommittedChunk(chunk, sampleRate);
    }

    this.preRollChunks = [];
    this.preRollLength = 0;
  }

  async start() {
    if (this.isRecording) return;

    const threshold = this.options.silenceThreshold ?? 0.015;
    const duration = this.options.silenceDurationMs ?? 2000;

    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: this.options.selectedDeviceId
          ? { exact: this.options.selectedDeviceId }
          : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.isRecording = true;
    this.startedAtMs = Date.now();
    this.resetBuffers();

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this.options.inputGain ?? 1;
    // Smaller buffer improves chunk cadence for streaming captions.
    this.processorNode = this.audioContext.createScriptProcessor(2048, 1, 1);

    let silenceStart = 0;
    let silenceTriggered = false;

    this.processorNode.onaudioprocess = (e) => {
      if (!this.isRecording) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const samples = new Float32Array(inputData);
      const sampleRate = this.audioContext?.sampleRate ?? 44100;

      // Calculate RMS
      let sum = 0;
      for (let i = 0; i < samples.length; i++) {
        sum += samples[i] * samples[i];
      }
      const rms = Math.sqrt(sum / samples.length);
      const chunkDurationMs =
        ((samples.length / (this.audioContext?.sampleRate ?? 44100)) * 1000);

      this.peakRms = Math.max(this.peakRms, rms);

      if (this.options.onVolume) {
        this.options.onVolume(rms);
      }

      if (!this.isSpeechActivated) {
        const activationThreshold = Math.max(
          threshold * 2.2,
          this.options.activationThreshold ?? 0.028,
        );
        const activationMinDurationMs =
          this.options.activationMinDurationMs ?? 130;

        this.pushPreRollChunk(samples, sampleRate);

        if (rms >= activationThreshold) {
          this.activationDurationMs += chunkDurationMs;
        } else {
          this.activationDurationMs = 0;
        }

        if (this.activationDurationMs >= activationMinDurationMs) {
          this.isSpeechActivated = true;
          this.hasDetectedSpeech = true;
          this.speechDurationMs = Math.max(
            this.speechDurationMs,
            this.activationDurationMs,
          );
          this.commitPreRoll(sampleRate);
          this.options.onSpeechActivation?.();
          silenceStart = 0;
          silenceTriggered = false;
        }

        return;
      }

      this.appendCommittedChunk(samples, sampleRate, true);

      if (rms >= threshold) {
        this.hasDetectedSpeech = true;
        this.speechDurationMs += chunkDurationMs;
        silenceStart = 0;
        silenceTriggered = false;
        return;
      }

      if (!this.hasDetectedSpeech) {
        return;
      }

      if (rms < threshold) {
        if (silenceStart === 0) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart >= duration) {
          if (!silenceTriggered && this.options.onSilenceDetected) {
            silenceTriggered = true;
            this.options.onSilenceDetected();
          }
        }
      }
    };

    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);
  }

  stop(): AudioRecorderStopResult {
    if (!this.isRecording) {
      return {
        audioBlob: new Blob([], { type: 'audio/wav' }),
        totalDurationMs: 0,
        speechDurationMs: 0,
        peakRms: 0,
        hasMeaningfulSpeech: false,
      };
    }

    this.isRecording = false;

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }

    const sampleRate = this.audioContext?.sampleRate ?? 44100;
    if (this.audioContext) {
      this.audioContext.close();
    }

    if (!this.isSpeechActivated && this.options.waitForSpeechActivation) {
      const totalDurationMs = Math.max(0, Date.now() - this.startedAtMs);
      const peakRms = this.peakRms;
      this.startedAtMs = 0;
      this.resetBuffers();

      return {
        audioBlob: new Blob([], { type: "audio/wav" }),
        totalDurationMs,
        speechDurationMs: 0,
        peakRms,
        hasMeaningfulSpeech: false,
      };
    }

    const mergedSamples = new Float32Array(this.totalLength);
    let offset = 0;
    for (const chunk of this.samples) {
      mergedSamples.set(chunk, offset);
      offset += chunk.length;
    }

    const audioBlob = encodeWAV(mergedSamples, sampleRate);
    const totalDurationMs = Math.max(0, Date.now() - this.startedAtMs);
    const threshold = this.options.silenceThreshold ?? 0.015;
    const speechDurationMs = Math.round(this.speechDurationMs);
    const peakRms = this.peakRms;
    const hasMeaningfulSpeech =
      speechDurationMs >= 220 || peakRms >= threshold * 1.8;

    this.startedAtMs = 0;
    this.resetBuffers();

    return {
      audioBlob,
      totalDurationMs,
      speechDurationMs,
      peakRms,
      hasMeaningfulSpeech,
    };
  }

  cancel() {
    if (!this.isRecording) return;

    this.isRecording = false;

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }

    this.startedAtMs = 0;
    this.resetBuffers();
  }
}

export class AudioPlayerVisualizer {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private animationFrameId = 0;

  constructor(
    private audioElement: HTMLAudioElement,
    private onVolume: (rms: number) => void
  ) {}

  setup() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
      this.sourceNode.connect(this.analyserNode);
      this.analyserNode.connect(this.audioContext.destination);
    } catch (e) {
      console.warn('AudioPlayerVisualizer already setup or context error:', e);
    }
  }

  start() {
    if (!this.analyserNode) return;
    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);

    const check = () => {
      this.analyserNode!.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = (dataArray[i] - 128) / 128;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      this.onVolume(rms);
      this.animationFrameId = requestAnimationFrame(check);
    };

    check();
  }

  stop() {
    cancelAnimationFrame(this.animationFrameId);
  }

  close() {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}
