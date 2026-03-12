import { readTextFile, writeTextFile } from "../utils/fs";
import { type AuditResult, type RepairAction } from "./rules";

export type RepairReport = {
  applied: number;
  filesChanged: string[];
};

export async function applyAuditFixes(results: AuditResult[]): Promise<RepairReport> {
  const fixes = dedupeFixes(results.flatMap((result) => result.fix ? [result.fix] : []));
  const fixesByFile = new Map<string, RepairAction[]>();

  for (const fix of fixes) {
    const list = fixesByFile.get(fix.filePath) ?? [];
    list.push(fix);
    fixesByFile.set(fix.filePath, list);
  }

  const filesChanged: string[] = [];

  for (const [filePath, fileFixes] of fixesByFile) {
    let source = await readTextFile(filePath);
    const ordered = [...fileFixes].sort((left, right) => {
      if (left.start !== right.start) {
        return right.start - left.start;
      }

      return right.end - left.end;
    });

    for (const fix of ordered) {
      const replacement = fix.text ?? "";
      source = `${source.slice(0, fix.start)}${replacement}${source.slice(fix.end)}`;
    }

    await writeTextFile(filePath, source);
    filesChanged.push(filePath);
  }

  return {
    applied: fixes.length,
    filesChanged: filesChanged.sort((left, right) => left.localeCompare(right)),
  };
}

function dedupeFixes(fixes: RepairAction[]): RepairAction[] {
  const seen = new Set<string>();
  const unique: RepairAction[] = [];

  for (const fix of fixes) {
    const key = [fix.type, fix.filePath, fix.start, fix.end, fix.text ?? ""].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(fix);
  }

  return unique;
}
