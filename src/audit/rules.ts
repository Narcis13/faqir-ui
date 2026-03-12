import { dirname, relative } from "node:path";

import {
  findAllBySelector,
  findElements,
  getAttribute,
  getAttributeNode,
  type HtmlElement,
  hasAttribute,
} from "../parser/html-parser";
import { type ParsedCss } from "../parser/css-parser";
import { type LoomManifest } from "../utils/manifest";
import { type RegistryLayer } from "../utils/registry";

export type AuditSeverity = "critical" | "error" | "warning" | "info";

export type RepairAction = {
  type: "replace-text" | "insert-text" | "remove-element";
  filePath: string;
  target: string;
  start: number;
  end: number;
  text?: string;
};

export type AuditResult = {
  ruleId: string;
  severity: AuditSeverity;
  componentName: string;
  filePath: string;
  message: string;
  elementId?: string;
  location: {
    offset: number;
    line: number;
    column: number;
  };
  fix?: RepairAction;
};

export type KnownComponentEntry = {
  name: string;
  layer: RegistryLayer;
  manifest: LoomManifest;
  componentDir: string;
  htmlPath: string;
  cssPath: string;
  jsPath?: string;
};

export type AuditHtmlFile = {
  path: string;
  source: string;
  document: HtmlDocument;
  componentRoots: HtmlElement[];
  scriptSrcs: string[];
  inlineScripts: string[];
  snippetComponentName: string | null;
};

export type AuditProject = {
  cwd: string;
  outputRoot: string;
  loomScriptPath: string;
  componentsByName: Map<string, KnownComponentEntry>;
  tokenCatalog: Set<string>;
};

export type ParsedComponent = {
  name: string;
  root: HtmlElement;
  filePath: string;
  snippet: boolean;
  entry: KnownComponentEntry;
  manifest: LoomManifest;
};

export type ComponentAuditContext = {
  project: AuditProject;
  file: AuditHtmlFile;
  component: ParsedComponent;
  entry: KnownComponentEntry;
  manifest: LoomManifest;
};

export type CssAuditContext = {
  project: AuditProject;
  entry: KnownComponentEntry;
  source: string;
  parsed: ParsedCss;
};

export interface ComponentAuditRule {
  id: string;
  severity: AuditSeverity;
  check(context: ComponentAuditContext): AuditResult[];
}

export interface CssAuditRule {
  id: string;
  severity: AuditSeverity;
  check(context: CssAuditContext): AuditResult[];
}

export const COMPONENT_AUDIT_RULES: ComponentAuditRule[] = [
  {
    id: "required-slot",
    severity: "critical",
    check(context) {
      const results: AuditResult[] = [];

      for (const [slotName, slot] of Object.entries(context.manifest.slots ?? {})) {
        if (!slot.required) {
          continue;
        }

        if (findAllBySelector(context.component.root, slot.selector).length > 0) {
          continue;
        }

        results.push(
          createResult(
            context,
            "required-slot",
            "critical",
            context.component.root,
            `Missing required slot "${slotName}"`,
          ),
        );
      }

      return results;
    },
  },
  {
    id: "required-aria",
    severity: "critical",
    check(context) {
      if (context.manifest.name === "dialog") {
        return checkDialogRequiredAria(context);
      }

      if (context.manifest.name === "tabs") {
        return checkTabsRequiredAria(context);
      }

      if (context.manifest.name === "dropdown") {
        return checkDropdownRequiredAria(context);
      }

      return [];
    },
  },
  {
    id: "focus-trap",
    severity: "critical",
    check(context) {
      if (!context.manifest.a11y?.focus_trap || context.component.snippet) {
        return [];
      }

      if (hasControllerLoaded(context)) {
        return [];
      }

      return [
        createResult(
          context,
          "focus-trap",
          "critical",
          context.component.root,
          `Focus-trapped recipe "${context.manifest.name}" is missing its controller loader`,
          buildAddScriptFix(context),
        ),
      ];
    },
  },
  {
    id: "valid-variant",
    severity: "error",
    check(context) {
      const results: AuditResult[] = [];

      for (const [variantName, variant] of Object.entries(context.manifest.variants ?? {})) {
        const targets = getVariantTargets(context.component.root, variant.applied_to);

        for (const target of targets) {
          const actual = getAttribute(target, variant.attr);

          if (!actual || variant.values.includes(actual)) {
            continue;
          }

          const expected = getClosestValue(actual, variant.values) ?? variant.default;
          results.push(
            createResult(
              context,
              "valid-variant",
              "error",
              target,
              `Invalid ${variantName} value "${actual}". Expected one of: ${variant.values.join(", ")}`,
              buildSetAttributeFix(context.file.path, getTargetSelector(target), context.file.source, target, variant.attr, expected),
            ),
          );
        }
      }

      return results;
    },
  },
  {
    id: "valid-state",
    severity: "error",
    check(context) {
      const actual = getAttribute(context.component.root, "data-state");
      const allowed = Object.keys(context.manifest.states ?? {});

      if (!actual || allowed.length === 0 || allowed.includes(actual)) {
        return [];
      }

      return [
        createResult(
          context,
          "valid-state",
          "error",
          context.component.root,
          `Invalid state "${actual}". Expected one of: ${allowed.join(", ")}`,
          buildSetAttributeFix(
            context.file.path,
            getTargetSelector(context.component.root),
            context.file.source,
            context.component.root,
            "data-state",
            getDefaultState(context.manifest) ?? allowed[0],
          ),
        ),
      ];
    },
  },
  {
    id: "controller-loaded",
    severity: "error",
    check(context) {
      if (context.manifest.kind !== "recipe" || context.component.snippet || hasControllerLoaded(context)) {
        return [];
      }

      return [
        createResult(
          context,
          "controller-loaded",
          "error",
          context.component.root,
          `Recipe "${context.manifest.name}" is missing a controller loader`,
          buildAddScriptFix(context),
        ),
      ];
    },
  },
  {
    id: "orphan-panel",
    severity: "error",
    check(context) {
      if (context.manifest.name !== "tabs") {
        return [];
      }

      const { triggers, panels } = getTabsPairs(context.component.root);
      const triggerIds = new Set(triggers.map((trigger, index) => getTriggerId(context, trigger, index)));
      const panelIds = new Set(panels.map((panel, index) => getPanelId(context, panel, index)));
      const results: AuditResult[] = [];

      for (let index = 0; index < panels.length; index += 1) {
        const panel = panels[index];
        const labelledBy = getAttribute(panel, "aria-labelledby");
        const panelId = getPanelId(context, panel, index);
        const matchingTrigger = triggers.find(
          (trigger, triggerIndex) =>
            getAttribute(trigger, "aria-controls") === panelId ||
            getTriggerId(context, trigger, triggerIndex) === labelledBy ||
            getAttribute(trigger, "data-value") === getAttribute(panel, "data-value"),
        );

        if (matchingTrigger) {
          continue;
        }

        const fix = panelIds.size > 0 && triggerIds.size === 0
          ? undefined
          : buildRemoveElementFix(context.file.path, getTargetSelector(panel), panel);

        results.push(
          createResult(
            context,
            "orphan-panel",
            "error",
            panel,
            `Panel "${panelId}" does not have a matching tab trigger`,
            fix,
          ),
        );
      }

      return results;
    },
  },
  {
    id: "orphan-part",
    severity: "warning",
    check(context) {
      const allowed = new Set(Object.keys(context.manifest.slots ?? {}));

      return findElements(context.component.root, (element) => element !== context.component.root && hasAttribute(element, "data-part"))
        .flatMap((element) => {
          const part = getAttribute(element, "data-part");

          if (!part || allowed.has(part)) {
            return [];
          }

          return [
            createResult(
              context,
              "orphan-part",
              "warning",
              element,
              `Unknown part "${part}" is not declared in the ${context.manifest.name} manifest`,
            ),
          ];
        });
    },
  },
  {
    id: "aria-describedby",
    severity: "warning",
    check(context) {
      if (context.manifest.name !== "dialog") {
        return [];
      }

      const panel = getSlotElement(context.component.root, context.manifest, "panel");
      const description = getSlotElement(context.component.root, context.manifest, "description");

      if (!panel || !description) {
        return [];
      }

      const descriptionId = getElementId(description) ?? getDeterministicId(context, "description", 0);
      const actual = getAttribute(panel, "aria-describedby");
      const results: AuditResult[] = [];

      if (!getElementId(description)) {
        results.push(
          createResult(
            context,
            "aria-describedby",
            "warning",
            description,
            `Description slot needs an id so the panel can reference it`,
            buildSetAttributeFix(context.file.path, getTargetSelector(description), context.file.source, description, "id", descriptionId),
          ),
        );
      }

      if (actual !== descriptionId) {
        results.push(
          createResult(
            context,
            "aria-describedby",
            "warning",
            panel,
            `Panel should reference the description slot with aria-describedby`,
            buildSetAttributeFix(
              context.file.path,
              getTargetSelector(panel),
              context.file.source,
              panel,
              "aria-describedby",
              descriptionId,
            ),
          ),
        );
      }

      return results;
    },
  },
  {
    id: "close-label",
    severity: "warning",
    check(context) {
      const closeButtons = getSlotElements(context.component.root, context.manifest, "close");

      return closeButtons.flatMap((button) => {
        if (hasAttribute(button, "aria-label")) {
          return [];
        }

        return [
          createResult(
            context,
            "close-label",
            "warning",
            button,
            `Close controls should include an aria-label`,
            buildSetAttributeFix(
              context.file.path,
              getTargetSelector(button),
              context.file.source,
              button,
              "aria-label",
              `Close ${context.manifest.name}`,
            ),
          ),
        ];
      });
    },
  },
];

export const CSS_AUDIT_RULES: CssAuditRule[] = [
  {
    id: "token-exists",
    severity: "warning",
    check(context) {
      return [...context.parsed.referencedTokens]
        .filter((token) => !context.project.tokenCatalog.has(token))
        .map((token) => ({
          ruleId: "token-exists",
          severity: "warning" as const,
          componentName: context.entry.manifest.name,
          filePath: context.entry.cssPath,
          message: `Unknown design token "--${token}" referenced in CSS`,
          location: {
            offset: 0,
            line: 1,
            column: 1,
          },
        }));
    },
  },
  {
    id: "reduced-motion",
    severity: "info",
    check(context) {
      if (!context.parsed.hasMotionDeclarations || context.parsed.hasReducedMotionQuery) {
        return [];
      }

      return [
        {
          ruleId: "reduced-motion",
          severity: "info",
          componentName: context.entry.manifest.name,
          filePath: context.entry.cssPath,
          message: `Component CSS uses motion without a prefers-reduced-motion override`,
          location: {
            offset: 0,
            line: 1,
            column: 1,
          },
        },
      ];
    },
  },
];

function checkDialogRequiredAria(context: ComponentAuditContext): AuditResult[] {
  const panel = getSlotElement(context.component.root, context.manifest, "panel");
  const title = getSlotElement(context.component.root, context.manifest, "title");

  if (!panel) {
    return [];
  }

  const results: AuditResult[] = [];

  if (getAttribute(panel, "role") !== "dialog") {
    results.push(
      createResult(
        context,
        "required-aria",
        "critical",
        panel,
        `Dialog panel must include role="dialog"`,
        buildSetAttributeFix(context.file.path, getTargetSelector(panel), context.file.source, panel, "role", "dialog"),
      ),
    );
  }

  if (getAttribute(panel, "aria-modal") !== "true") {
    results.push(
      createResult(
        context,
        "required-aria",
        "critical",
        panel,
        `Dialog panel must include aria-modal="true"`,
        buildSetAttributeFix(context.file.path, getTargetSelector(panel), context.file.source, panel, "aria-modal", "true"),
      ),
    );
  }

  if (!title) {
    return results;
  }

  const titleId = getElementId(title) ?? getDeterministicId(context, "title", 0);

  if (!getElementId(title)) {
    results.push(
      createResult(
        context,
        "required-aria",
        "critical",
        title,
        `Dialog title needs an id so the panel can reference it`,
        buildSetAttributeFix(context.file.path, getTargetSelector(title), context.file.source, title, "id", titleId),
      ),
    );
  }

  if (getAttribute(panel, "aria-labelledby") !== titleId) {
    results.push(
      createResult(
        context,
        "required-aria",
        "critical",
        panel,
        `Dialog panel must reference its title with aria-labelledby`,
        buildSetAttributeFix(
          context.file.path,
          getTargetSelector(panel),
          context.file.source,
          panel,
          "aria-labelledby",
          titleId,
        ),
      ),
    );
  }

  return results;
}

function checkTabsRequiredAria(context: ComponentAuditContext): AuditResult[] {
  const { list, triggers, panels } = getTabsPairs(context.component.root);
  const results: AuditResult[] = [];

  if (list && getAttribute(list, "role") !== "tablist") {
    results.push(
      createResult(
        context,
        "required-aria",
        "critical",
        list,
        `Tabs list must include role="tablist"`,
        buildSetAttributeFix(context.file.path, getTargetSelector(list), context.file.source, list, "role", "tablist"),
      ),
    );
  }

  for (let index = 0; index < triggers.length; index += 1) {
    const trigger = triggers[index];
    const expectedTriggerId = getTriggerId(context, trigger, index);
    const panel = panels[index] ?? null;

    if (getAttribute(trigger, "role") !== "tab") {
      results.push(
        createResult(
          context,
          "required-aria",
          "critical",
          trigger,
          `Tab triggers must include role="tab"`,
          buildSetAttributeFix(context.file.path, getTargetSelector(trigger), context.file.source, trigger, "role", "tab"),
        ),
      );
    }

    if (getElementId(trigger) !== expectedTriggerId) {
      results.push(
        createResult(
          context,
          "required-aria",
          "critical",
          trigger,
          `Tab trigger needs a stable id`,
          buildSetAttributeFix(context.file.path, getTargetSelector(trigger), context.file.source, trigger, "id", expectedTriggerId),
        ),
      );
    }

    if (!panel) {
      continue;
    }

    const expectedPanelId = getPanelId(context, panel, index);

    if (getAttribute(trigger, "aria-controls") !== expectedPanelId) {
      results.push(
        createResult(
          context,
          "required-aria",
          "critical",
          trigger,
          `Tab triggers must point to their panel with aria-controls`,
          buildSetAttributeFix(
            context.file.path,
            getTargetSelector(trigger),
            context.file.source,
            trigger,
            "aria-controls",
            expectedPanelId,
          ),
        ),
      );
    }
  }

  for (let index = 0; index < panels.length; index += 1) {
    const panel = panels[index];
    const expectedPanelId = getPanelId(context, panel, index);
    const trigger = triggers[index] ?? null;
    const expectedTriggerId = trigger ? getTriggerId(context, trigger, index) : null;

    if (getAttribute(panel, "role") !== "tabpanel") {
      results.push(
        createResult(
          context,
          "required-aria",
          "critical",
          panel,
          `Tab panels must include role="tabpanel"`,
          buildSetAttributeFix(context.file.path, getTargetSelector(panel), context.file.source, panel, "role", "tabpanel"),
        ),
      );
    }

    if (getElementId(panel) !== expectedPanelId) {
      results.push(
        createResult(
          context,
          "required-aria",
          "critical",
          panel,
          `Tab panel needs a stable id`,
          buildSetAttributeFix(context.file.path, getTargetSelector(panel), context.file.source, panel, "id", expectedPanelId),
        ),
      );
    }

    if (expectedTriggerId && getAttribute(panel, "aria-labelledby") !== expectedTriggerId) {
      results.push(
        createResult(
          context,
          "required-aria",
          "critical",
          panel,
          `Tab panels must point back to their trigger with aria-labelledby`,
          buildSetAttributeFix(
            context.file.path,
            getTargetSelector(panel),
            context.file.source,
            panel,
            "aria-labelledby",
            expectedTriggerId,
          ),
        ),
      );
    }
  }

  return results;
}

function checkDropdownRequiredAria(context: ComponentAuditContext): AuditResult[] {
  const trigger = getSlotElement(context.component.root, context.manifest, "trigger");
  const menu = getSlotElement(context.component.root, context.manifest, "menu");
  const items = getSlotElements(context.component.root, context.manifest, "item");
  const results: AuditResult[] = [];

  if (trigger && getAttribute(trigger, "aria-haspopup") !== "menu") {
    results.push(
      createResult(
        context,
        "required-aria",
        "critical",
        trigger,
        `Dropdown trigger must include aria-haspopup="menu"`,
        buildSetAttributeFix(
          context.file.path,
          getTargetSelector(trigger),
          context.file.source,
          trigger,
          "aria-haspopup",
          "menu",
        ),
      ),
    );
  }

  if (trigger && !hasAttribute(trigger, "aria-expanded")) {
    results.push(
      createResult(
        context,
        "required-aria",
        "critical",
        trigger,
        `Dropdown trigger must include aria-expanded`,
        buildSetAttributeFix(
          context.file.path,
          getTargetSelector(trigger),
          context.file.source,
          trigger,
          "aria-expanded",
          "false",
        ),
      ),
    );
  }

  if (menu && getAttribute(menu, "role") !== "menu") {
    results.push(
      createResult(
        context,
        "required-aria",
        "critical",
        menu,
        `Dropdown menu must include role="menu"`,
        buildSetAttributeFix(context.file.path, getTargetSelector(menu), context.file.source, menu, "role", "menu"),
      ),
    );
  }

  for (const item of items) {
    if (getAttribute(item, "role") === "menuitem") {
      continue;
    }

    results.push(
      createResult(
        context,
        "required-aria",
        "critical",
        item,
        `Dropdown items must include role="menuitem"`,
        buildSetAttributeFix(context.file.path, getTargetSelector(item), context.file.source, item, "role", "menuitem"),
      ),
    );
  }

  return results;
}

function hasControllerLoaded(context: ComponentAuditContext): boolean {
  const jsFile = context.entry.jsPath;

  if (!jsFile) {
    return true;
  }

  const candidates = [
    "loom.js",
    context.manifest.files.js ?? "",
    `${context.manifest.name}/${context.manifest.files.js ?? ""}`,
    `${context.entry.layer}/${context.manifest.name}/${context.manifest.files.js ?? ""}`,
  ].filter(Boolean);

  if (context.file.scriptSrcs.some((src) => candidates.some((candidate) => src.includes(candidate)))) {
    return true;
  }

  return context.file.inlineScripts.some((script) => candidates.some((candidate) => script.includes(candidate)));
}

function buildAddScriptFix(context: ComponentAuditContext): RepairAction {
  const relativePath = normalizeImportPath(relative(dirname(context.file.path), context.project.loomScriptPath));
  const bodyClose = context.file.source.lastIndexOf("</body>");
  const insertionPoint = bodyClose >= 0 ? bodyClose : context.file.source.length;
  const prefix = insertionPoint > 0 && !context.file.source.slice(0, insertionPoint).endsWith("\n") ? "\n" : "";
  const suffix = bodyClose >= 0 ? "  " : "\n";

  return {
    type: "insert-text",
    filePath: context.file.path,
    target: "</body>",
    start: insertionPoint,
    end: insertionPoint,
    text: `${prefix}${suffix}<script type="module" src="${relativePath}"></script>\n`,
  };
}

function getVariantTargets(root: HtmlElement, appliedTo?: string): HtmlElement[] {
  if (!appliedTo || appliedTo === "root") {
    return [root];
  }

  return findAllBySelector(root, `[data-part='${appliedTo}']`);
}

function getDefaultState(manifest: LoomManifest): string | null {
  for (const [stateName, state] of Object.entries(manifest.states ?? {})) {
    if (state.default) {
      return stateName;
    }
  }

  return null;
}

function getClosestValue(input: string, values: string[]): string | null {
  let best: { value: string; distance: number } | null = null;

  for (const value of values) {
    const distance = levenshtein(input, value);

    if (!best || distance < best.distance) {
      best = { value, distance };
    }
  }

  return best?.value ?? null;
}

function levenshtein(left: string, right: string): number {
  const rows = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));

  for (let row = 0; row <= left.length; row += 1) {
    rows[row][0] = row;
  }

  for (let column = 0; column <= right.length; column += 1) {
    rows[0][column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + cost,
      );
    }
  }

  return rows[left.length][right.length];
}

function getSlotElement(root: HtmlElement, manifest: LoomManifest, slotName: string): HtmlElement | null {
  return getSlotElements(root, manifest, slotName)[0] ?? null;
}

function getSlotElements(root: HtmlElement, manifest: LoomManifest, slotName: string): HtmlElement[] {
  const selector = manifest.slots?.[slotName]?.selector ?? `[data-part='${slotName}']`;
  return findAllBySelector(root, selector);
}

function getTabsPairs(root: HtmlElement): {
  list: HtmlElement | null;
  triggers: HtmlElement[];
  panels: HtmlElement[];
} {
  return {
    list: findAllBySelector(root, "[data-part='list']")[0] ?? null,
    triggers: findAllBySelector(root, "[data-part='trigger']"),
    panels: findAllBySelector(root, "[data-part='panel']"),
  };
}

function getTriggerId(context: ComponentAuditContext, trigger: HtmlElement, index: number): string {
  return getElementId(trigger) ?? `${getTabsBaseId(context)}-${getTabsValue(trigger, index)}-tab`;
}

function getPanelId(context: ComponentAuditContext, panel: HtmlElement, index: number): string {
  return getElementId(panel) ?? `${getTabsBaseId(context)}-${getTabsValue(panel, index)}-panel`;
}

function getTabsValue(element: HtmlElement, index: number): string {
  return getAttribute(element, "data-value") ?? `tab-${index + 1}`;
}

function getTabsBaseId(context: ComponentAuditContext): string {
  return getElementId(context.component.root) ?? `${context.manifest.name}-${context.component.root.startTagStart}`;
}

function getDeterministicId(context: ComponentAuditContext, slotName: string, index: number): string {
  const rootId = getElementId(context.component.root) ?? `${context.manifest.name}-${context.component.root.startTagStart}`;
  return `${rootId}-${slotName}${index > 0 ? `-${index + 1}` : ""}`;
}

function getElementId(element: HtmlElement): string | null {
  return getAttribute(element, "id");
}

function createResult(
  context: ComponentAuditContext,
  ruleId: string,
  severity: AuditSeverity,
  element: HtmlElement,
  message: string,
  fix?: RepairAction,
): AuditResult {
  return {
    ruleId,
    severity,
    componentName: context.manifest.name,
    filePath: context.file.path,
    message,
    elementId: getElementId(element) ?? undefined,
    location: getLocation(context.file.source, element.startTagStart),
    fix,
  };
}

function getLocation(source: string, offset: number): { offset: number; line: number; column: number } {
  let line = 1;
  let lineStart = 0;

  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
      lineStart = index + 1;
    }
  }

  return {
    offset,
    line,
    column: offset - lineStart + 1,
  };
}

function getTargetSelector(element: HtmlElement): string {
  const id = getElementId(element);

  if (id) {
    return `#${id}`;
  }

  const dataUi = getAttribute(element, "data-ui");

  if (dataUi) {
    return `[data-ui="${dataUi}"]`;
  }

  const dataPart = getAttribute(element, "data-part");

  if (dataPart) {
    return `[data-part="${dataPart}"]`;
  }

  return element.tagName;
}

function buildSetAttributeFix(
  filePath: string,
  target: string,
  source: string,
  element: HtmlElement,
  name: string,
  value: string,
): RepairAction {
  const attribute = getAttributeNode(element, name);
  const escaped = escapeAttribute(value);

  if (attribute) {
    return {
      type: "replace-text",
      filePath,
      target,
      start: attribute.start,
      end: attribute.end,
      text: `${name}="${escaped}"`,
    };
  }

  const insertAt = getTagAttributeInsertOffset(source, element);
  return {
    type: "insert-text",
    filePath,
    target,
    start: insertAt,
    end: insertAt,
    text: ` ${name}="${escaped}"`,
  };
}

function buildRemoveElementFix(filePath: string, target: string, element: HtmlElement): RepairAction {
  return {
    type: "remove-element",
    filePath,
    target,
    start: element.start,
    end: element.end,
    text: "",
  };
}

function getTagAttributeInsertOffset(source: string, element: HtmlElement): number {
  if (source[element.startTagEnd - 2] === "/") {
    return element.startTagEnd - 2;
  }

  return element.startTagEnd - 1;
}

function escapeAttribute(value: string): string {
  return value.replace(/"/g, "&quot;");
}

function normalizeImportPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");

  if (normalized.startsWith(".")) {
    return normalized;
  }

  return `./${normalized}`;
}
