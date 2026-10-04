import { describe, it, expect } from 'vitest';
import { textConnectionValue, validateTextConnectionSetting, isProviderEnabledSettingKey } from './provider-toggles.js';
describe('non-secret provider connection preferences',()=>{
  it('uses saved settings before environment and restores defaults when blank',()=>{
    expect(textConnectionValue('app.together.model',{'app.together.model':' saved '},{TOGETHER_DEFAULT_MODEL:'environment'})).toBe('saved');
    expect(textConnectionValue('app.together.model',{'app.together.model':''},{TOGETHER_DEFAULT_MODEL:'environment'})).toBe('environment');
    expect(textConnectionValue('app.lmstudio.baseUrl')).toBe('http://127.0.0.1:1234/v1');
  });
  it('accepts loopback servers including IPv6 and rejects remote or secret-bearing endpoints',()=>{
    for(const value of ['http://localhost:1234/v1','http://127.0.0.1:1234/v1','http://[::1]:1234/v1','']) expect(()=>validateTextConnectionSetting('app.lmstudio.baseUrl',value)).not.toThrow();
    for(const value of ['https://example.com/v1','http://localhost@evil.com','http://localhost:1234/v1?token=secret','file:///E:/models']) expect(()=>validateTextConnectionSetting('app.lmstudio.baseUrl',value)).toThrow();
  });
  it('validates persisted input and enables only known provider toggle ids',()=>{
    expect(()=>validateTextConnectionSetting('app.mistral.model','a\nb')).toThrow();
    for(const id of ['lmstudio','mistral','cerebras','together']) expect(isProviderEnabledSettingKey('app.provider.'+id+'.enabled')).toBe(true);
    expect(isProviderEnabledSettingKey('app.provider.unregistered.enabled')).toBe(false);
  });
});
