import type { ObjectSchema, RenderFormOptions, UISchema } from "./index.js";

/** `renderForm`'s options, less `rules`: `buildForm` emits no rules definition. */
export type BuildFormOptions = Omit<RenderFormOptions, "rules">;

/**
 * Build the form as DOM nodes on `document`, with no markup parsed and no
 * expression derived from the schema. Accepts what `renderForm` accepts, minus
 * `ui:wizard` and anything that needs a rules definition (the conditional
 * keywords, or a `pattern` no HTML attribute can carry), which throw.
 * Repeatable rows are added and removed by listeners on their buttons.
 * The form is returned detached.
 */
export function buildForm(
  jsonSchema: ObjectSchema,
  document: Document,
  uiSchema?: UISchema,
  opts?: BuildFormOptions,
): HTMLFormElement;
