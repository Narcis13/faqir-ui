export type ParsedCss = {
  definedTokens: Set<string>;
  referencedTokens: Set<string>;
  hasReducedMotionQuery: boolean;
  hasMotionDeclarations: boolean;
};

export function parseCss(source: string): ParsedCss {
  const definedTokens = new Set<string>();
  const referencedTokens = new Set<string>();

  for (const match of source.matchAll(/(--[A-Za-z0-9-_]+)\s*:/g)) {
    definedTokens.add(match[1].slice(2));
  }

  for (const match of source.matchAll(/var\(\s*(--[A-Za-z0-9-_]+)\b/g)) {
    referencedTokens.add(match[1].slice(2));
  }

  return {
    definedTokens,
    referencedTokens,
    hasReducedMotionQuery: /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/.test(source),
    hasMotionDeclarations: /\b(?:transition(?:-[a-z-]+)?|animation(?:-[a-z-]+)?)\s*:/.test(source),
  };
}
