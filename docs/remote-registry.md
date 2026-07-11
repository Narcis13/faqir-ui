# Remote Registries — hosting Faqir components on any static host

Faqir components can be distributed by anyone, from **static files only**. There
is no server logic, no database, and no build step a consumer has to run — just a
folder of files behind an HTTP host (GitHub Pages, Cloudflare Pages, S3, a plain
`nginx`, …). The bundled registry that ships with the CLI stays the offline-first
default; remote registries are purely additive.

```
faqir add button --registry https://ui.example.com/registry
faqir add @acme/data-grid          # resolves via faqir.config.json → registries
```

Every file is verified against a SHA-256 hash **before anything is written to
disk**. An integrity failure, a missing file, or a network error aborts the
install with nothing written — a component is never left half-installed.

---

## The layout a host must serve

Mirror the shape of the bundled `registry/` directory and place a
`registry-index.json` at its root:

```
<registry base URL>/
├── registry-index.json
├── primitives/
│   └── button/
│       ├── button.html
│       ├── button.css
│       └── button.manifest.json
├── recipes/
│   └── dialog/
│       ├── dialog.html
│       ├── dialog.css
│       ├── dialog.js
│       └── dialog.manifest.json
└── patterns/
    └── …
```

A component's files live at `<base>/<layer>/<name>/<path>`, where `<layer>` is
one of `primitives`, `recipes`, `patterns`. The CLI installs them under the
project's `output_dir` at exactly the same relative path.

## `registry-index.json`

```jsonc
{
  "schema": "faqir-registry-index@1",
  "count": 66,
  "components": [
    {
      "name": "button",
      "kind": "primitive",          // manifest kind
      "layer": "primitives",        // directory the component installs into
      "version": "1.0.0",
      "files": [
        { "path": "button.css",           "sha256": "0da7ecb0…" },
        { "path": "button.html",          "sha256": "fbedc6b4…" },
        { "path": "button.manifest.json", "sha256": "98fb7858…" }
      ],
      "hash": "…",                  // aggregate SHA-256 over the files
      "deps": []                    // component dependencies (composition.contains)
    }
  ]
}
```

Field notes:

- **`files[].path`** is relative to the component directory (POSIX separators)
  and lists **every** file the component ships — including assets the manifest
  does not declare (e.g. an icon license). The index reproduces a component
  byte-for-byte.
- **`files[].sha256`** is the lowercase hex SHA-256 of the file's raw bytes.
- **`hash`** is a stable component fingerprint: a SHA-256 over the path-sorted
  `(path, sha256)` pairs. The CLI rejects an index whose `hash` disagrees with
  its `files`, so a tampered entry cannot slip through.
- **`deps`** are resolved within the *same* index — a remote component pulls its
  dependencies from its own registry.
- The document is **deterministic**: components are ordered by layer then name,
  files by path. Regenerating without a content change leaves the bytes
  identical.

## Generating the index

From a checkout that contains a `registry/` directory:

```
bun run build:registry-index      # writes registry/registry-index.json
bun run check:registry-index      # CI: fails if the committed index is stale
```

Then publish the whole `registry/` folder (index included) to any static host.

## Scoped names via `faqir.config.json`

Map a scope to a registry base URL so consumers can install without repeating the
URL:

```jsonc
{
  "registries": {
    "@acme": "https://ui.acme.com/registry"
  }
}
```

```
faqir add @acme/data-grid         # → https://ui.acme.com/registry
```

Keys may be written with or without the leading `@`. An unknown scope produces a
helpful error listing the scopes that *are* configured.

## Integrity guarantees

1. The CLI fetches `registry-index.json` and validates its shape.
2. It resolves the requested components and their dependencies from the index.
3. It downloads every file into memory and checks each byte against the index
   hash.
4. **Only after every file of every component is verified** does it write to
   disk.

Any failure in steps 1–3 aborts before step 4, so integrity failures can never
write files, and a partial download never leaves a half-installed component.
