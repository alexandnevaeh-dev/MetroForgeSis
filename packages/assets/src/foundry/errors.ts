/** Typed Asset Foundry errors — do not parse these via string matching. */

export class FoundryError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class ProviderUnavailableError extends FoundryError {
  constructor(message: string) {
    super('PROVIDER_UNAVAILABLE', message);
  }
}

export class AuthenticationError extends FoundryError {
  constructor(message: string) {
    super('AUTHENTICATION', message);
  }
}

export class RateLimitError extends FoundryError {
  constructor(message: string) {
    super('RATE_LIMIT', message);
  }
}

export class QuotaExceededError extends FoundryError {
  constructor(message: string) {
    super('QUOTA_EXCEEDED', message);
  }
}

export class UnsupportedCapabilityError extends FoundryError {
  constructor(message: string) {
    super('UNSUPPORTED_CAPABILITY', message);
  }
}

export class LicenseRejectedError extends FoundryError {
  constructor(message: string) {
    super('LICENSE_REJECTED', message);
  }
}

export class GenerationFailedError extends FoundryError {
  constructor(message: string) {
    super('GENERATION_FAILED', message);
  }
}

export class CompilationFailedError extends FoundryError {
  constructor(message: string) {
    super('COMPILATION_FAILED', message);
  }
}

export class QARejectedError extends FoundryError {
  constructor(message: string) {
    super('QA_REJECTED', message);
  }
}

export class AssetMissingError extends FoundryError {
  constructor(message: string) {
    super('ASSET_MISSING', message);
  }
}

export function isTransientFoundryError(err: unknown): boolean {
  return err instanceof RateLimitError || err instanceof ProviderUnavailableError;
}

export function isNonRetryableFoundryError(err: unknown): boolean {
  return (
    err instanceof AuthenticationError ||
    err instanceof LicenseRejectedError ||
    err instanceof QuotaExceededError ||
    err instanceof UnsupportedCapabilityError
  );
}
