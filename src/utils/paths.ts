import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * Whether `candidate` resolves to `root` itself or somewhere beneath it.
 *
 * The one containment test every command that writes (or serves) a
 * user-named path applies. `rel.startsWith("..")` — what each command used to
 * inline — also refused a legitimate child literally named `..foo`; a path
 * escapes only when its relative form IS `..` or starts with `../`.
 */
export function isInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(root, candidate));
  if (isAbsolute(rel)) return false;
  return rel !== ".." && !rel.startsWith(`..${sep}`);
}
