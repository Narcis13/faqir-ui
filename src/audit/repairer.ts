// Auto-fix engine — applies deterministic repairs to HTML files based on audit results
// Uses string manipulation (not DOM parsing) for precise, predictable fixes

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AuditResult, RepairAction } from "./rules";
import { log } from "../utils/logger";

export interface RepairSummary {
  files_modified: number;
  fixes_applied: number;
  fixes_skipped: number;
}

/**
 * Apply all fixable audit results to their source files.
 * Returns a summary of what was changed.
 */
export async function applyRepairs(
  results: AuditResult[],
  cwd: string,
): Promise<RepairSummary> {
  const fixable = results.filter(r => r.fix);
  if (fixable.length === 0) {
    return { files_modified: 0, fixes_applied: 0, fixes_skipped: 0 };
  }

  // Group fixes by file
  const byFile = new Map<string, AuditResult[]>();
  for (const result of fixable) {
    const filePath = join(cwd, result.file);
    const existing = byFile.get(filePath) || [];
    existing.push(result);
    byFile.set(filePath, existing);
  }

  let filesModified = 0;
  let fixesApplied = 0;
  let fixesSkipped = 0;

  for (const [filePath, fileResults] of byFile) {
    if (!existsSync(filePath)) {
      fixesSkipped += fileResults.length;
      continue;
    }

    let source = await Bun.file(filePath).text();
    let modified = false;

    for (const result of fileResults) {
      const fix = result.fix!;
      const newSource = applyFix(source, fix, result);
      if (newSource !== null && newSource !== source) {
        source = newSource;
        modified = true;
        fixesApplied++;
        log.step(`Fixed: ${result.message}`);
      } else {
        fixesSkipped++;
      }
    }

    if (modified) {
      await Bun.write(filePath, source);
      filesModified++;
    }
  }

  return { files_modified: filesModified, fixes_applied: fixesApplied, fixes_skipped: fixesSkipped };
}

/**
 * Apply a single fix to an HTML source string.
 * Returns the modified source, or null if the fix could not be applied.
 */
function applyFix(source: string, fix: RepairAction, result: AuditResult): string | null {
  switch (fix.type) {
    case "add-attribute":
      return addAttribute(source, fix, result);
    case "add-script":
      return addScript(source, fix, result);
    default:
      return null;
  }
}

/**
 * Add an attribute to an element found by its component/part context.
 */
function addAttribute(source: string, fix: RepairAction, result: AuditResult): string | null {
  const { attr, value } = fix.details;
  if (!attr) return null;

  // Find the element in the source by its data-ui/data-part context
  const componentName = result.component_name;
  const message = result.message;

  // Determine the target element: look for the part mentioned in the message
  let searchPattern: string;
  const partMatch = message.match(/\[data-part="(\w+)"\]/);
  if (partMatch) {
    searchPattern = `data-part="${partMatch[1]}"`;
  } else {
    searchPattern = `data-ui="${componentName}"`;
  }

  // Find the tag containing this pattern
  const idx = source.indexOf(searchPattern);
  if (idx === -1) return null;

  // Find the end of this tag (the closing >)
  const tagEnd = source.indexOf(">", idx);
  if (tagEnd === -1) return null;

  // Check if the attribute already exists on this element
  // Walk back to find the opening < of this tag
  let tagStart = idx;
  while (tagStart > 0 && source[tagStart] !== "<") tagStart--;
  const tagContent = source.slice(tagStart, tagEnd + 1);

  // If the attribute already exists, skip
  const attrPattern = new RegExp(`\\b${attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
  if (attrPattern.test(tagContent)) return null;

  // Also check for boolean attribute (no value)
  const boolPattern = new RegExp(`\\b${attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|>|/)`);
  if (boolPattern.test(tagContent)) return null;

  // Insert the attribute before the closing >
  const insertion = value ? ` ${attr}="${value}"` : ` ${attr}`;

  // Handle self-closing tags
  if (source[tagEnd - 1] === "/") {
    return source.slice(0, tagEnd - 1) + insertion + " />" + source.slice(tagEnd + 1);
  }

  return source.slice(0, tagEnd) + insertion + source.slice(tagEnd);
}

/**
 * Add a script tag for a recipe controller.
 */
function addScript(source: string, fix: RepairAction, _result: AuditResult): string | null {
  const { src, component } = fix.details;
  if (!src) return null;

  // Check if the script is already referenced
  if (source.includes(src) || source.includes("loom.js")) return null;

  // Find the closing </body> or end of file
  const bodyClose = source.lastIndexOf("</body>");
  if (bodyClose !== -1) {
    const scriptTag = `  <script type="module" src="ui/recipes/${component}/${src}"></script>\n`;
    return source.slice(0, bodyClose) + scriptTag + source.slice(bodyClose);
  }

  // No </body> tag — append at end
  const scriptTag = `\n<script type="module" src="ui/recipes/${component}/${src}"></script>\n`;
  return source + scriptTag;
}
