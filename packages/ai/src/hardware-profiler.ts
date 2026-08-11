import { execSync } from 'node:child_process';
import { totalmem, freemem, cpus, arch, platform } from 'node:os';
import type { HardwareProfile } from '@metroforge/schemas';

export class HardwareProfiler {
  profile(): HardwareProfile {
    const totalRamMb = Math.floor(totalmem() / (1024 * 1024));
    const freeRamMb = Math.floor(freemem() / (1024 * 1024));
    const cpuCores = cpus().length;

    let gpuVendor: string | undefined;
    let gpuModel: string | undefined;
    let vramMb: number | undefined;
    let cudaAvailable = false;

    if (platform() === 'win32') {
      try {
        const output = execSync(
          'wmic path win32_VideoController get name,AdapterRAM /format:csv',
          { encoding: 'utf-8', timeout: 5000, windowsHide: true },
        );
        const lines = output.trim().split('\n').slice(1);
        for (const line of lines) {
          const parts = line.split(',');
          const name = parts[2]?.trim();
          const ram = parseInt(parts[1] ?? '0', 10);
          if (name && !name.toLowerCase().includes('microsoft')) {
            gpuModel = name;
            if (name.toLowerCase().includes('nvidia')) gpuVendor = 'nvidia';
            else if (name.toLowerCase().includes('amd')) gpuVendor = 'amd';
            else if (name.toLowerCase().includes('intel')) gpuVendor = 'intel';
            if (ram > 0) vramMb = Math.floor(ram / (1024 * 1024));
            break;
          }
        }
      } catch {
        // GPU detection optional
      }

      try {
        execSync('nvidia-smi --version', { timeout: 3000, windowsHide: true });
        cudaAvailable = true;
      } catch {
        cudaAvailable = false;
      }
    }

    const hwProfile =
      totalRamMb < 12288 ? 'LOW_RESOURCE' : totalRamMb < 32768 ? 'BALANCED' : 'HIGH_QUALITY';

    return {
      os: platform(),
      cpuArch: arch(),
      cpuCores,
      totalRamMb,
      freeRamMb,
      gpuVendor,
      gpuModel,
      vramMb,
      cudaAvailable,
      rocmAvailable: false,
      directMlAvailable: platform() === 'win32',
      metalAvailable: platform() === 'darwin',
      profile: hwProfile,
    };
  }

  canRunModel(model: {
    minRamMb?: number;
    recommendedRamMb?: number;
    minVramMb?: number;
    recommendedVramMb?: number;
  }): boolean {
    const hw = this.profile();
    const requiredRam = model.minRamMb ?? model.recommendedRamMb ?? 0;
    if (requiredRam > 0 && hw.totalRamMb < requiredRam * 0.85) return false;

    if (model.minVramMb && model.minVramMb > 0) {
      if (!hw.vramMb || hw.vramMb < model.minVramMb * 0.85) return false;
    }
    return true;
  }

  getLowResourcePoolMaxParams(): string {
    const hw = this.profile();
    if (hw.totalRamMb < 6144) return '4B';
    if (hw.totalRamMb < 12288) return '9B';
    if (hw.totalRamMb < 24576) return '14B';
    return '30B';
  }
}

export function getStarterPack(profile: HardwareProfile): string[] {
  if (profile.profile === 'LOW_RESOURCE') {
    return ['llama3.2:3b', 'qwen2.5-coder:7b', 'procedural-sfx', 'nomic-embed-text'];
  }
  if (profile.profile === 'BALANCED') {
    return [
      'qwen3:8b',
      'qwen2.5-coder:7b',
      'qwen2.5-vl:7b',
      'sd-1.5',
      'procedural-sfx',
      'bge-small-en',
    ];
  }
  return [
    'qwen3-coder-next',
    'deepseek-r1:8b',
    'qwen2.5-vl:7b',
    'flux.1-schnell',
    'stable-audio-open',
    'bge-small-en',
  ];
}
