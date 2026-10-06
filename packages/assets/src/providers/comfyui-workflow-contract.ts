export interface ComfyUIWorkflowContract {
  workflowId: string;
  version: string;
  capabilities: string[];
  requiredModels: string[];
  requiredAdapters: string[];
  requiredCustomNodes: string[];
  inputMappings: Record<string, string>;
  outputMappings: Record<string, string>;
  licenseRequirements: string[];
  vramProfile: string;
}

export interface ComfyUIWorkflowValidation {
  valid: boolean;
  missing: string[];
}

export function validateComfyUIWorkflowContract(
  contract: Partial<ComfyUIWorkflowContract>,
  available: { models?: Set<string>; adapters?: Set<string>; customNodes?: Set<string> } = {},
): ComfyUIWorkflowValidation {
  const missing: string[] = [];
  if (!contract.workflowId) missing.push('workflowId');
  if (!contract.version) missing.push('version');
  if (!contract.capabilities?.length) missing.push('capabilities');
  if (!contract.inputMappings || Object.keys(contract.inputMappings).length === 0) missing.push('inputMappings');
  if (!contract.outputMappings || Object.keys(contract.outputMappings).length === 0) missing.push('outputMappings');
  for (const model of contract.requiredModels ?? []) if (available.models && !available.models.has(model)) missing.push(`model:${model}`);
  for (const adapter of contract.requiredAdapters ?? []) if (available.adapters && !available.adapters.has(adapter)) missing.push(`adapter:${adapter}`);
  for (const node of contract.requiredCustomNodes ?? []) if (available.customNodes && !available.customNodes.has(node)) missing.push(`customNode:${node}`);
  return { valid: missing.length === 0, missing };
}
