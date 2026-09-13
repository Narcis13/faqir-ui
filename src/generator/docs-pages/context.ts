/**
 * The shared input every docs-page module receives from `buildDocsSite`.
 *
 * Page modules live beside this file, one per site section, and each exports
 * `render<Section>Pages(ctx: PageContext): SiteFile[]`. They import the shell
 * and the HTML helpers from `../docs` — which in turn imports them — so a page
 * module must only USE those imports inside functions, never at module top
 * level, or the import cycle evaluates them before they exist.
 */
import type { CdnPin, DocsComponent, DocsTheme, SiteConfig, SiteFile, TokenEntry } from "../docs";

export interface PageContext {
  config: SiteConfig;
  components: DocsComponent[];
  themes: DocsTheme[];
  /** First component by bare name, in layer order (primitive wins). */
  byName: Map<string, DocsComponent>;
  tokenList: TokenEntry[];
  registryRoot: string;
  packageRoot: string;
  siteRoot: string;
  pin: CdnPin;
}

export type { SiteFile };
