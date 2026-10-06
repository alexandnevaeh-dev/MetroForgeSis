/** Kaggle is a development/benchmarking profile — never treated as a reliable online API.
 *  Use it for Diffusers/SDXL/IP-Adapter/ControlNet benchmarking and quantized-model testing
 *  via a semi-manual export/import contract, not as a permanent server. */
export interface KaggleNotebookConfig {
  username?: string;
  key?: string;
  notebookSlug?: string;
}

export interface KaggleNotebookReport {
  configured: boolean;
  notebookSlug?: string;
  readiness: 'NOT_CONFIGURED' | 'MANUAL_EXPORT_REQUIRED';
  reason: string;
  exportContract: { input: string; output: string };
  setupInstructions?: string[];
}

export function kaggleNotebookDoctor(config: KaggleNotebookConfig = {}): KaggleNotebookReport {
  const configured = Boolean(config.username && config.key);
  return {
    configured,
    notebookSlug: config.notebookSlug,
    readiness: 'MANUAL_EXPORT_REQUIRED',
    reason: 'KAGGLE_NOTEBOOK is a development/benchmarking profile, not a reliable online API — treat every result as semi-manual.',
    exportContract: {
      input: 'Canonical player reference PNG + a generation manifest JSON uploaded to the Kaggle notebook as an input dataset.',
      output: 'Generated artifact PNG + a provenance JSON downloaded from the notebook output and re-imported into MetroForge for QA.',
    },
    setupInstructions: configured
      ? undefined
      : ['Set KAGGLE_USERNAME and KAGGLE_KEY (from kaggle.json) to enable the Kaggle API for dataset upload/download.', 'Set KAGGLE_NOTEBOOK_SLUG to the benchmarking notebook to run.'],
  };
}

/** Colab is an experimental/manual profile for interactive model tests only — MetroForge does
 *  not attempt to run its persistent remote HTTP worker on free Colab runtimes (they are not
 *  guaranteed and restrict persistent remote-service behavior). */
export interface ColabNotebookConfig {
  notebookUrl?: string;
}

export interface ColabNotebookReport {
  configured: boolean;
  notebookUrl?: string;
  readiness: 'NOT_CONFIGURED' | 'MANUAL_INTERACTIVE_ONLY';
  reason: string;
  setupInstructions: string[];
}

export function colabNotebookDoctor(config: ColabNotebookConfig = {}): ColabNotebookReport {
  return {
    configured: Boolean(config.notebookUrl),
    notebookUrl: config.notebookUrl,
    readiness: 'MANUAL_INTERACTIVE_ONLY',
    reason: 'COLAB_NOTEBOOK is an experimental/manual profile for interactive model tests only; free Colab runtimes are not guaranteed and must not host a persistent remote HTTP worker.',
    setupInstructions: [
      'Open a Colab notebook, install the pinned inference dependencies, and interactively test model loading/generation.',
      'Do not attempt to expose a persistent HTTP endpoint on the free Colab tier.',
      'Set COLAB_NOTEBOOK_URL only as a bookmark/reference — it is not polled or invoked automatically.',
    ],
  };
}
