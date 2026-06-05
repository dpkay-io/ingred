export class IngredError extends Error {
  constructor(message: string, public hint?: string) {
    super(message);
    this.name = 'IngredError';
  }
}

export class SourceNotFoundError extends IngredError {
  constructor(name: string, available: string[]) {
    const suggestion = available.length
      ? `\nAvailable sources: ${available.join(', ')}`
      : '\nNo sources linked. Run `ingred link <repo-url-or-path>` first.';
    super(`Source "${name}" not found.${suggestion}`);
    this.name = 'SourceNotFoundError';
  }
}

export class GitNotAvailableError extends IngredError {
  constructor() {
    super(
      'Git is required to link remote repositories.',
      'Install git and try again: https://git-scm.com/downloads',
    );
    this.name = 'GitNotAvailableError';
  }
}

export class NoSourcesError extends IngredError {
  constructor() {
    super(
      'No ingredient sources linked.',
      'Run `ingred link <repo-url-or-path>` to add your ingredient files.',
    );
    this.name = 'NoSourcesError';
  }
}
