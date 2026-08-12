import type { Command } from 'commander';
import { loadConfig } from '@metroforge/shared';
import { bootstrapProviders, listProviderStatus } from '@metroforge/ai';

export function registerProvidersCommand(program: Command): void {
  program
    .command('providers')
    .description('List AI providers and their status')
    .action(async () => {
      const config = loadConfig();
      const { registry } = await bootstrapProviders({
        mode: 'HYBRID_FREE',
        ollamaBaseUrl: config.ollamaBaseUrl,
        ollamaDefaultModel: process.env.OLLAMA_DEFAULT_MODEL,
        geminiApiKey: process.env.GEMINI_API_KEY,
        groqApiKey: process.env.GROQ_API_KEY,
        openrouterApiKey: process.env.OPENROUTER_API_KEY,
        huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
        nvidiaApiKey: process.env.NVIDIA_API_KEY,
        nvidiaApiBaseUrl: process.env.NVIDIA_API_BASE_URL,
      });

      const providers = listProviderStatus(registry);

      console.log('AI Providers:\n');
      console.log(
        '  ' +
          ['ID'.padEnd(14), 'Name'.padEnd(20), 'Type'.padEnd(8), 'Enabled'.padEnd(8), 'Health'].join(
            ' ',
          ),
      );
      console.log('  ' + '-'.repeat(62));

      for (const p of providers) {
        const loc = p.local ? 'local' : 'cloud';
        const en = p.enabled ? 'yes' : 'no';
        console.log(
          `  ${p.id.padEnd(14)} ${p.name.padEnd(20)} ${loc.padEnd(8)} ${en.padEnd(8)} ${p.health}`,
        );
      }

      console.log('\nConfigure API keys in .env to enable hosted providers.');
    });
}
