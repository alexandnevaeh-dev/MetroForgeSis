# Local game audio authoring

The Asset workshop has separate Artwork and Audio tabs. Audio creates new WAV alternatives in the selected side-view or top-down project. Saved takes also remain in the Asset Gallery with Needs Review status. Quantum projects are outside this workflow.

## Assign a reviewed take to a game event

Listen to a saved take in the workshop or library, choose an existing sound-effect or music event, and use **Use this take**. The Godot adapter writes the exact WAV bytes to the event's existing `audio/sfx/` or `audio/music/` slot. The previous WAV and take metadata are retained in `.metroforge/audio-binding-history/` and the binding ledger. Other event files remain unchanged. Restart the game preview to load the new sound, then validate its playback and mix.

**Undo audio change** restores changes in project-wide reverse order. It checks the current audio, take metadata and backup hashes first, preserving later user edits instead of overwriting them. Replacing a previous custom take updates both takes' binding provenance, and Undo restores both preimages. Apply and Undo invalidate game validation; restoring a WAV does not automatically restore acceptance. The selected take remains pending audio review and production readiness.

Only existing events of the same audio type are selectable. Source WAV hashes, captured game DNA, selection revisions and safe project paths are checked before mutation. The current binding adapter supports Godot; Unity and Unreal need their own authoring adapters and native evidence. Local generation and audition remain separate from engine-specific game admission.

Sound effects use `stabilityai/stable-audio-3-small-sfx` through Stability AI's official Stable Audio 3 SDK. Instrumental music uses ACE-Step 1.5's `acestep-v15-turbo` through its local API. These require separate Python environments: their Transformers versions differ. Keep the existing image environment separate too.

## Configure a local installation

Set `METROFORGE_LOCAL_AUDIO_CONFIG` to an absolute JSON file outside the repository. Example installation on E:

```json
{
  "aceBaseUrl": "http://127.0.0.1:8001/",
  "acePythonPath": "E:/MetroForgeData/AudioRuntimes/20261011/ace-env/Scripts/python.exe",
  "aceWorkingDirectory": "E:/MetroForgeData/AudioRuntimes/20261011/ACE-Step-1.5",
  "aceWeightsPath": "E:/MetroForgeData/Models/ACE-Step1.5",
  "runtimeCacheRoot": "E:/MetroForgeData/AudioRuntimes/20261011/cache",
  "sfxPythonPath": "E:/MetroForgeData/AudioRuntimes/20261011/stable-env/Scripts/python.exe",
  "sfxModelRoot": "E:/MetroForgeData/Models/stable-audio-3-small-sfx"
}
```

The SFX model directory must contain `model_config.json`, `model.safetensors` and the bundled `t5gemma-b-b-ul2` directory with its weights and tokenizer. Download the authorized model during setup. Generation uses local files with Hugging Face offline mode enabled; it cannot initiate downloads or execute remote model code.

With the owned runtime fields above, the app starts ACE-Step on demand and stops its entire owned process tree after each take, including failed requests. It uses CUDA with CPU offloading and rejects automatic CPU-only music loading, which exceeded this laptop's safe memory budget. Its caches and logs stay under the configured E: directory. An existing external ACE-Step API can also be used; the app does not stop a service it did not start. The description goes directly to the DiT, without a second language model.

The installed ACE-Step SDK is pinned at `ca1e85fe9430179831e6bc6be790c332190a3866`. Its isolated copy needs two reviewed checkpoint fixes: API startup must use `get_checkpoints_dir()` instead of a hard-coded `project_root/checkpoints`; `check_main_model_exists()` must omit LM components only when `ACESTEP_INIT_LLM=false`, while retaining real weight-file checks. Without those fixes this SDK attempts redundant downloads despite the selected DiT-only installation. Preserve vendor preimages and verify these changes against the installed version; do not fabricate missing weights.

Apply the included `scripts/patch-ace-local-checkpoints.py` with `--sdk-root` and `--receipt-root` pointing to the isolated SDK and a receipts directory on E:. It verifies both source preimages before changing either file, retains backups and a reviewed diff, and handles an already-patched installation without rewriting it. The owned API uses an ephemeral authentication key held only in its parent and worker environments. It is not saved in configuration or exposed to the renderer. An external API can use the existing `ACESTEP_API_KEY` environment reference.

For an explicit CPU fallback, a configuration may include `sfxTorchPath`, an absolute site-packages directory containing matching CPU builds of Torch and Torchaudio. Only the SFX worker uses that override. ACE-Step may separately use an equivalent process-scoped `PYTHONPATH` override. Do not set a global override that would change the image runtime. CPU inference and CUDA inference require separate evidence.

## Output and limits

Effects support 0.25–10 seconds; music supports 10–120 seconds. Prompts are bounded to 1,500 characters and seeds are explicit integers. Audio jobs run serially within this authoring service. Generation may need several minutes to load weights; configured status is not an inference health check.

Each result is written atomically under `assets/generated/audio/sfx/` or `assets/generated/audio/music/`, with a JSON receipt containing the request, model, WAV hash and project DNA hash. The service rejects changed project identity, invalid or silent WAVs, unexpected provider output, oversized responses and non-loopback music endpoints. IEEE float music output is converted to PCM16 for native engine compatibility. The original response hash is retained. Listen to each take in the workshop; musical quality, looping, loudness balance and actual game playback require further review.

ACE-Step uses the MIT license. Stable Audio weights use the Stability AI Community License and include Gemma terms. Obtain the gated weights using an account authorized for the model and review the applicable model terms before distribution. Do not publish credentials, private runtime configuration, downloaded weights, caches or generated takes as application source.
