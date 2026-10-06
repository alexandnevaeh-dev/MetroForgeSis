import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  HardwareProfiler,
  parseCudaVersionFromNvidiaSmi,
  parseNvidiaSmiQueryCsv,
  pickPrimaryGpu,
} from './hardware-profiler.js';

describe('nvidia-smi parsers', () => {
  it('parses query CSV into GPU rows', () => {
    const rows = parseNvidiaSmiQueryCsv(
      'NVIDIA GeForce RTX 5060 Laptop GPU, 8151, 7800, 573.22\n',
    );
    expect(rows).toEqual([
      {
        name: 'NVIDIA GeForce RTX 5060 Laptop GPU',
        memoryTotalMb: 8151,
        memoryFreeMb: 7800,
        driverVersion: '573.22',
      },
    ]);
  });

  it('skips the header row and empty lines', () => {
    const rows = parseNvidiaSmiQueryCsv(
      'name, memory.total [MiB], memory.free [MiB], driver_version\n\nNVIDIA GeForce RTX 4070, 12282, 11000, 560.70\n',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.memoryTotalMb).toBe(12282);
  });

  it('picks the GPU with the largest VRAM, not the first adapter', () => {
    const primary = pickPrimaryGpu(
      parseNvidiaSmiQueryCsv(
        'NVIDIA GeForce RTX 3050 Laptop GPU, 4096, 3000, 551.0\nNVIDIA GeForce RTX 4090, 24564, 24000, 551.0\n',
      ),
    );
    expect(primary?.name).toContain('4090');
    expect(primary?.memoryTotalMb).toBe(24564);
  });

  it('extracts CUDA version from the nvidia-smi banner', () => {
    expect(
      parseCudaVersionFromNvidiaSmi(
        '| NVIDIA-SMI 573.22                 Driver Version: 573.22         CUDA Version: 12.8     |',
      ),
    ).toBe('12.8');
  });
});

describe('HardwareProfiler', () => {
  it('uses nvidia-smi VRAM instead of AdapterRAM and records free VRAM', () => {
    const profiler = new HardwareProfiler({
      env: { COMFYUI_BASE_URL: 'http://127.0.0.1:8188' },
      runCommand: (file, args = []) => {
        if (file === 'nvidia-smi' && args.some((arg) => arg.startsWith('--query-gpu'))) {
          return 'NVIDIA GeForce RTX 5060 Laptop GPU, 8151, 7420, 573.22\n';
        }
        if (file === 'nvidia-smi') {
          return 'CUDA Version: 12.8';
        }
        throw new Error(`unexpected command ${file}`);
      },
    });
    const hw = profiler.profile();
    expect(hw.gpuModel).toBe('NVIDIA GeForce RTX 5060 Laptop GPU');
    expect(hw.gpuVendor).toBe('nvidia');
    expect(hw.vramMb).toBe(8151);
    expect(hw.freeVramMb).toBe(7420);
    expect(hw.cudaAvailable).toBe(true);
    expect(hw.cudaVersion).toBe('12.8');
    expect(hw.comfyuiConfigured).toBe(true);
    expect(hw.localEndpoints?.comfyui).toBe(true);
    expect(hw.diskFreeMb).toBeGreaterThan(0);
    expect(hw.cpuCores).toBeGreaterThan(0);
  });

  it('does not claim CUDA when nvidia-smi is missing', () => {
    const profiler = new HardwareProfiler({
      platform: 'linux',
      env: {},
      runCommand: () => {
        throw new Error('not found');
      },
    });
    const hw = profiler.profile();
    expect(hw.cudaAvailable).toBe(false);
    expect(hw.vramMb).toBeUndefined();
    expect(hw.comfyuiConfigured).toBe(false);
  });

  it('canRunModel uses detected VRAM with the 0.85 soft floor', () => {
    const profiler = new HardwareProfiler({
      env: {},
      runCommand: (file, args = []) => {
        if (file === 'nvidia-smi' && args.some((arg) => arg.startsWith('--query-gpu'))) {
          return 'NVIDIA GeForce RTX 5060 Laptop GPU, 8151, 7000, 573.22\n';
        }
        return 'CUDA Version: 12.8';
      },
    });
    expect(profiler.canRunModel({ minVramMb: 6144 })).toBe(true);
    expect(profiler.canRunModel({ minVramMb: 24000 })).toBe(false);
  });
});

const nvidiaSmiAvailable = (() => {
  try {
    execFileSync('nvidia-smi', ['--version'], { timeout: 3000, windowsHide: true, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!nvidiaSmiAvailable)('HardwareProfiler live NVIDIA GPU', () => {
  it('reads real VRAM from nvidia-smi without hardcoding a GPU SKU', () => {
    const hw = new HardwareProfiler().profile();
    expect(hw.cudaAvailable).toBe(true);
    expect(hw.vramMb).toBeGreaterThan(1024);
    expect(hw.gpuModel).toBeTruthy();
    expect(hw.gpuVendor).toBe('nvidia');
  });
});
