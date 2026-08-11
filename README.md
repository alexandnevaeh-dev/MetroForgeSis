# MetroForge AI

AI-powered Metroidvania game generation platform. Describe a game in natural language and receive a complete, playable Godot 4.x project.

## Quick Start

```bash
pnpm install
pnpm build
pnpm test
pnpm metroforge doctor
```

## CLI

```bash
# Check environment
pnpm metroforge doctor

# Create and generate a game
pnpm metroforge create --prompt "Create a ruined mechanical-temple Metroidvania" --profile TINY_TEST --mode LOCAL_ONLY

# Validate a generated project
pnpm metroforge validate <slug>

# List AI providers (live health)
pnpm metroforge providers

# Model catalog and routing
pnpm metroforge models list
pnpm metroforge models list --installed --capability JSON_GENERATION
pnpm metroforge models rank JSON_GENERATION
pnpm metroforge models starter-pack
pnpm metroforge scout
```

## Hosted AI Providers

Optional free-tier providers — enable by setting keys in `.env`:

| Provider | Env Variable |
|----------|-------------|
| Google Gemini | `GEMINI_API_KEY` |
| Groq | `GROQ_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Hugging Face | `HUGGINGFACE_API_KEY` |

Generation modes:
- **LOCAL_ONLY** — Ollama only
- **HYBRID_FREE** — Ollama first, fallback to configured free hosted APIs
- **FREE_ONLY** — Free providers only
- **CUSTOM** — All enabled providers by priority

## Desktop App

```bash
pnpm dev:desktop
```

## Project Structure

```
apps/
  cli/          Command-line interface
  desktop/      Electron + React desktop app
packages/
  shared/       Constants, config, logging
  schemas/      Zod data contracts
  core/         Core business logic
templates/
  godot-metroidvania/   Reusable Godot 4 runtime (Pass 10)
GeneratedGames/         Output directory for generated projects
docs/                   Architecture and build status
```

## Configuration

Copy `.env.example` to `.env`. Product name is configurable via `METROFORGE_APP_NAME`.

## Generation Modes

- **FREE_ONLY** — Only free providers
- **LOCAL_ONLY** — Local models only (Ollama)
- **HYBRID_FREE** — Local first, fallback to free hosted APIs
- **CUSTOM** — User-configured provider priority

## Requirements

- Node.js 22.5+ (uses built-in `node:sqlite` for CLI; desktop uses sql.js)
- pnpm 9+
- Godot 4.x (for validation and play)
- Ollama (recommended for local AI generation)

## License

See individual provider and asset licenses in generated `generation_manifest.json`.
