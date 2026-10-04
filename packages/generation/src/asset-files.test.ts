import { describe, expect, it } from 'vitest';
import { assetFile } from './asset-files.js';

describe('Windows asset paths', () => {
  it('rejects traversal, alternate streams, trailing-dot aliases and absolute paths', () => {
    for (const path of ['../escape.png', 'assets/../escape.png', 'E:/escape.png', 'assets/test.png:stream', 'assets/.. /escape.png', 'assets/dir./test.png', 'assets\\test.png']) {
      expect(() => assetFile('E:/MetroForgeData/Temp/project', path)).toThrow();
    }
  });
});
