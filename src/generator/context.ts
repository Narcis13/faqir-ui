import type { LoomConfig } from "../utils/config";
import { loadInstalledComponentManifests } from "../utils/registry";

export async function generateContext(
  projectRoot: string,
  config: LoomConfig,
): Promise<Record<string, unknown>> {
  const components = await loadInstalledComponentManifests(projectRoot, config);

  return {
    generated_at: new Date().toISOString(),
    version: config.version,
    theme: config.theme,
    output_dir: config.output_dir,
    tokens_split: config.tokens_split,
    include_core: config.include_core,
    installed: config.installed,
    paths: {
      tokens: `${config.output_dir}/tokens`,
      base: `${config.output_dir}/base`,
      core: config.include_core ? `${config.output_dir}/core` : null,
      primitives: `${config.output_dir}/primitives`,
      recipes: `${config.output_dir}/recipes`,
      patterns: `${config.output_dir}/patterns`,
    },
    components: Object.fromEntries(
      components.map(({ manifest }) => [
        manifest.name,
        {
          kind: manifest.kind,
          category: manifest.category,
          description: manifest.description,
          selector: manifest.anatomy.selector,
          slots: Object.keys(manifest.slots ?? {}),
          variants: Object.fromEntries(
            Object.entries(manifest.variants ?? {}).map(([name, variant]) => [
              name,
              {
                values: variant.values,
                default: variant.default,
                attr: variant.attr,
              },
            ]),
          ),
          states: Object.keys(manifest.states ?? {}),
          tokens_used: manifest.tokens_used,
          safe_transforms: manifest.safe_transforms,
          unsafe_transforms: manifest.unsafe_transforms,
          files: manifest.files,
          composition: manifest.composition,
        },
      ]),
    ),
  };
}
