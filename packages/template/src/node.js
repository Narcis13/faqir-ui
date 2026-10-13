// @faqir-ui/template/node — the file loader (docs/template.md §10.1, §15.2).
// The one module that touches `node:`: it serves template files from one root
// directory and nothing else. A name that breaks §10.1, a file that does not
// exist, and a path that leaves the root through a symbolic link all read as
// "not found", so a hostile template learns nothing about the disk.

import { readFileSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { isValidName } from "./compose.js";

/**
 * Make a loader that reads `<root>/<name>` as UTF-8.
 * @param {string} root
 * @returns {(name: string) => string | null}
 */
export function createFileLoader(root) {
  if (typeof root !== "string" || root === "") throw new TypeError("createFileLoader: root must be a directory path");
  const base = realpathSync(resolve(root));
  return (name) => {
    if (typeof name !== "string" || !isValidName(name)) return null;
    try {
      const real = realpathSync(join(base, name));
      return real.startsWith(base + sep) ? readFileSync(real, "utf8") : null;
    } catch {
      return null; // missing, a directory, or unreadable: all "not found"
    }
  };
}
