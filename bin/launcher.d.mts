export const DIST_ENTRY: string;
export const SRC_ENTRY: string;

export function findBun(env?: Record<string, string | undefined>): string | null;

export function resolveLaunch(input: { hasDist: boolean; bun: string | null }): {
  runtime: string | null;
  entry: string;
};

export function launchFaqir(argv?: string[], env?: Record<string, string | undefined>): void;
