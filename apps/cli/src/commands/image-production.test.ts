import { describe, expect, it } from 'vitest';
import { classifyProviderResult } from './image-production.js';

describe('image provider production eligibility', () => {
  it('distinguishes reachable health from production generation success', () => {
    expect(classifyProviderResult({ health: 'HEALTHY', commercial: 'allowed', generation: 'not-run' })).toBe('ELIGIBLE_NOT_SELECTED');
    expect(classifyProviderResult({ health: 'HEALTHY', commercial: 'allowed', generation: 'failed' })).toBe('GENERATION_FAILED');
    expect(classifyProviderResult({ health: 'HEALTHY', commercial: 'allowed', generation: 'success' })).toBe('SELECTED');
  });

  it('blocks unknown or restricted commercial status', () => {
    expect(classifyProviderResult({ health: 'HEALTHY', commercial: 'unknown', generation: 'success' })).toBe('INELIGIBLE_LICENSE');
    expect(classifyProviderResult({ health: 'UNAVAILABLE', commercial: 'allowed', generation: 'not-run' })).toBe('INELIGIBLE_HEALTH');
  });
});
