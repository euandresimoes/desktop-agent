export type AudioDeviceOption = {
  id: string;
  label: string;
};

const createFallbackLabel = (
  kind: MediaDeviceInfo["kind"],
  index: number,
) => {
  if (kind === "audioinput") {
    return `Microphone ${index}`;
  }

  return `Speaker ${index}`;
};

const normalizeDeviceLabel = (
  device: MediaDeviceInfo,
  index: number,
) => {
  const label = device.label.trim();

  if (label) {
    return label;
  }

  return createFallbackLabel(device.kind, index);
};

export async function ensureAudioDevicePermissions() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    // Keep silent here so the settings screen still opens even if permission is denied.
  }
}

export async function listAudioDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return {
      inputs: [] as AudioDeviceOption[],
      outputs: [] as AudioDeviceOption[],
    };
  }

  await ensureAudioDevicePermissions();

  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices
    .filter((device) => device.kind === "audioinput")
    .map((device, index) => ({
      id: device.deviceId,
      label: normalizeDeviceLabel(device, index + 1),
    }));

  const outputs = devices
    .filter((device) => device.kind === "audiooutput")
    .map((device, index) => ({
      id: device.deviceId,
      label: normalizeDeviceLabel(device, index + 1),
    }));

  return {
    inputs,
    outputs,
  };
}
