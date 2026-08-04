import { invoke } from "@tauri-apps/api/core";

export type AudioDeviceInfo = {
  id: string;
  name: string;
  isDefault: boolean;
};

export type MicTestResult = {
  level: number;
  peak: number;
  detected: boolean;
  sampleCount: number;
};

export async function listAudioInputDevices(): Promise<AudioDeviceInfo[]> {
  return invoke<AudioDeviceInfo[]>("list_audio_input_devices");
}

export async function testMicrophone(
  deviceId: string | null,
): Promise<MicTestResult> {
  return invoke<MicTestResult>("test_microphone", { deviceId });
}
