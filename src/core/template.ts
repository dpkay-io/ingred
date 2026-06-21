export interface TemplateVars {
  stack: string;
  workspace: string;
  target: string;
  date: string;
}

export function resolveTemplateVars(text: string, vars: TemplateVars): string {
  if (!text.includes('{{')) return text;

  const knownVars: Record<string, string> = {
    stack: vars.stack,
    workspace: vars.workspace,
    target: vars.target,
    date: vars.date,
  };

  return text.replace(/\\?\{\{(\w+)\}\}/g, (match, varName: string) => {
    if (match.startsWith('\\')) return match.slice(1);
    return knownVars[varName] ?? match;
  });
}
