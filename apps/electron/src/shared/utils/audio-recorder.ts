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

export class AudioRecorder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private samples: Float32Array[] = [];
  private totalLength = 0;
  private isRecording = false;

  constructor(
    private options: {
      silenceThreshold?: number;
      silenceDurationMs?: number;
      selectedDeviceId?: string;
      inputGain?: number;
      onVolume?: (volume: number) => void;
      onSilenceDetected?: () => void;
    } = {}
  ) {}

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

    this.samples = [];
    this.totalLength = 0;
    this.isRecording = true;

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this.options.inputGain ?? 1;
    // 4096 bytes buffer, mono input, mono output
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

    let silenceStart = 0;

    this.processorNode.onaudioprocess = (e) => {
      if (!this.isRecording) return;

      const inputData = e.inputBuffer.getChannelData(0);
      this.samples.push(new Float32Array(inputData));
      this.totalLength += inputData.length;

      // Calculate RMS
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);

      if (this.options.onVolume) {
        this.options.onVolume(rms);
      }

      if (rms < threshold) {
        if (silenceStart === 0) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart >= duration) {
          if (this.options.onSilenceDetected) {
            this.options.onSilenceDetected();
          }
        }
      } else {
        silenceStart = 0;
      }
    };

    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);
  }

  stop(): Blob {
    if (!this.isRecording) {
      return new Blob([], { type: 'audio/wav' });
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

    const mergedSamples = new Float32Array(this.totalLength);
    let offset = 0;
    for (const chunk of this.samples) {
      mergedSamples.set(chunk, offset);
      offset += chunk.length;
    }

    return encodeWAV(mergedSamples, sampleRate);
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

    this.samples = [];
    this.totalLength = 0;
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
