import { execFileSync } from 'node:child_process';
import { existsSync, statfsSync } from 'node:fs';
import { totalmem, freemem, cpus, arch, platform } from 'node:os';
import type { HardwareProfile } from '@metroforge/schemas';

export interface NvidiaSmiGpuRow {
  name: string;
  memoryTotalMb: number;
  memoryFreeMb: number;
  driverVersion?: string;
}

export interface HardwareProfilerOptions {
  /** Injected for tests. Default shells out to nvidia-smi / similar. */
  runCommand?: (file: string, args?: string[]) => string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  cwd?: string;
}

const NVIDIA_QUERY_ARGS = [
  '--query-gpu=name,memory.total,memory.free,driver_version',
  '--format=csv,noheader,nounits',
];

function defaultRunCommand(file: string, args: string[] = []): string {
  return execFileSync(file, args, {
    encoding: 'utf-8',
    timeout: 5000,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function parseNvidiaSmiQueryCsv(output: string): NvidiaSmiGpuRow[] {
  const rows: NvidiaSmiGpuRow[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^name\s*,/i.test(trimmed)) continue;
    const parts = trimmed.split(',').map((part) => part.trim());
    if (parts.length < 3 || !parts[0]) continue;
    const memoryTotalMb = Number.parseFloat(parts[1] ?? '');
    const memoryFreeMb = Number.parseFloat(parts[2] ?? '');
    if (!Number.isFinite(memoryTotalMb) || memoryTotalMb <= 0) continue;
    rows.push({
      name: parts[0],
      memoryTotalMb: Math.round(memoryTotalMb),
      memoryFreeMb: Number.isFinite(memoryFreeMb) ? Math.max(0, Math.round(memoryFreeMb)) : 0,
      driverVersion: parts[3] || undefined,
    });
  }
  return rows;
}

export function parseCudaVersionFromNvidiaSmi(output: string): string | undefined {
  const match = output.match(/CUDA Version:\s*([\d.]+)/i);
  return match?.[1];
}

export function pickPrimaryGpu(rows: NvidiaSmiGpuRow[]): NvidiaSmiGpuRow | undefined {
  if (rows.length === 0) return undefined;
  return [...rows].sort((a, b) => b.memoryTotalMb - a.memoryTotalMb)[0];
}

function classifyRamProfile(totalRamMb: number): HardwareProfile['profile'] {
  if (totalRamMb < 12288) return 'LOW_RESOURCE';
  if (totalRamMb < 32768) return 'BALANCED';
  return 'HIGH_QUALITY';
}

function vendorFromGpuName(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (lower.includes('nvidia') || lower.includes('geforce') || lower.includes('rtx') || lower.includes('quadro')) {
    return 'nvidia';
  }
  if (lower.includes('amd') || lower.includes('radeon')) return 'amd';
  if (lower.includes('intel')) return 'intel';
  if (lower.includes('apple') || lower.includes('metal')) return 'apple';
  return undefined;
}

export class HardwareProfiler {
  private readonly runCommand: (file: string, args?: string[]) => string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly platformName: NodeJS.Platform;
  private readonly cwd: string;

  constructor(options: HardwareProfilerOptions = {}) {
    this.runCommand = options.runCommand ?? defaultRunCommand;
    this.env = options.env ?? process.env;
    this.platformName = options.platform ?? platform();
    this.cwd = options.cwd ?? process.cwd();
  }

  profile(): HardwareProfile {
    const totalRamMb = Math.floor(totalmem() / (1024 * 1024));
    const freeRamMb = Math.floor(freemem() / (1024 * 1024));
    const cpuList = cpus();
    const cpuCores = cpuList.length;
    const cpuModel = cpuList[0]?.model?.trim() || undefined;

    const nvidia = this.readNvidiaSmi();
    let gpuVendor = nvidia.gpuVendor;
    let gpuModel = nvidia.gpuModel;
    let vramMb = nvidia.vramMb;
    const freeVramMb = nvidia.freeVramMb;
    const cudaAvailable = nvidia.cudaAvailable;
    const cudaVersion = nvidia.cudaVersion;
    const gpuDriverVersion = nvidia.gpuDriverVersion;

    if (!gpuModel && this.platformName === 'win32') {
      const fallback = this.readWindowsGpuFallback();
      gpuVendor = gpuVendor ?? fallback.gpuVendor;
      gpuModel = gpuModel ?? fallback.gpuModel;
      vramMb = vramMb ?? fallback.vramMb;
    }

    const comfyuiUrl = this.env.COMFYUI_BASE_URL?.trim() || undefined;
    const automatic1111Url = this.env.AUTOMATIC1111_BASE_URL?.trim() || undefined;
    const diffusersPython = this.env.DIFFUSERS_PYTHON?.trim() || undefined;

    return {
      os: this.platformName,
      cpuArch: arch(),
      cpuCores,
      cpuModel,
      totalRamMb,
      freeRamMb,
      gpuVendor,
      gpuModel,
      vramMb,
      freeVramMb,
      cudaAvailable,
      cudaVersion,
      gpuDriverVersion,
      rocmAvailable: false,
      directMlAvailable: this.platformName === 'win32',
      metalAvailable: this.platformName === 'darwin',
      diskFreeMb: this.readDiskFreeMb(),
      comfyuiConfigured: Boolean(comfyuiUrl),
      comfyuiUrl,
      localEndpoints: {
        comfyui: Boolean(comfyuiUrl),
        automatic1111: Boolean(automatic1111Url),
        diffusersPython: Boolean(diffusersPython && existsSync(diffusersPython)),
      },
      profile: classifyRamProfile(totalRamMb),
    };
  }

  /**
   * Optional live probe of local generation HTTP endpoints. GPU tests and doctor should call this;
   * the sync `profile()` path never blocks on network.
   */
  async probeLocalServices(base: HardwareProfile = this.profile()): Promise<HardwareProfile> {
    const url = base.comfyuiUrl;
    if (!url) return base;
    let available = false;
    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/system_stats`, {
        signal: AbortSignal.timeout(3000),
      });
      available = res.ok;
    } catch {
      available = false;
    }
    return {
      ...base,
      localEndpoints: {
        ...base.localEndpoints,
        comfyui: available,
      },
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

  private readNvidiaSmi(): {
    gpuVendor?: string;
    gpuModel?: string;
    vramMb?: number;
    freeVramMb?: number;
    cudaAvailable: boolean;
    cudaVersion?: string;
    gpuDriverVersion?: string;
  } {
    try {
      const query = this.runCommand('nvidia-smi', NVIDIA_QUERY_ARGS);
      const primary = pickPrimaryGpu(parseNvidiaSmiQueryCsv(query));
      if (!primary) {
        return { cudaAvailable: false };
      }
      let cudaVersion: string | undefined;
      try {
        cudaVersion = parseCudaVersionFromNvidiaSmi(this.runCommand('nvidia-smi', []));
      } catch {
        cudaVersion = undefined;
      }
      return {
        gpuVendor: vendorFromGpuName(primary.name) ?? 'nvidia',
        gpuModel: primary.name,
        vramMb: primary.memoryTotalMb,
        freeVramMb: primary.memoryFreeMb,
        cudaAvailable: true,
        cudaVersion,
        gpuDriverVersion: primary.driverVersion,
      };
    } catch {
      return { cudaAvailable: false };
    }
  }

  private readWindowsGpuFallback(): {
    gpuVendor?: string;
    gpuModel?: string;
    vramMb?: number;
  } {
    try {
      const output = this.runCommand('powershell', [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name + "|" + $_.AdapterRAM }',
      ]);
      for (const line of output.split(/\r?\n/)) {
        const [name, ramRaw] = line.split('|').map((part) => part.trim());
        if (!name || name.toLowerCase().includes('microsoft')) continue;
        const ram = Number.parseInt(ramRaw ?? '0', 10);
        return {
          gpuModel: name,
          gpuVendor: vendorFromGpuName(name),
          vramMb: ram > 0 ? Math.floor(ram / (1024 * 1024)) : undefined,
        };
      }
    } catch {
      // optional
    }
    return {};
  }

  private readDiskFreeMb(): number | undefined {
    try {
      const stats = statfsSync(this.cwd);
      const bavail = Number(stats.bavail);
      const bsize = Number(stats.bsize);
      if (!Number.isFinite(bavail) || !Number.isFinite(bsize) || bsize <= 0) return undefined;
      return Math.floor((bavail * bsize) / (1024 * 1024));
    } catch {
      return undefined;
    }
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
