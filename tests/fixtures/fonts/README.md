# Font fixtures

Two real WOFF2 files — Instrument Serif's Latin and Latin-Extended faces, the
smallest family in the OFL catalog at 32 KB for the pair. They are the bytes
`tests/commands/fonts.test.ts` serves through the injected fetch, so
`faqir fonts add instrument-serif` is exercised end to end without a socket.

They are the **real** files, not synthetic stand-ins, on purpose: the installer
verifies every download against the SHA-256 pinned in `src/fonts/catalog.ts`,
so a fixture with a made-up hash could only ever test the refusal path. Serving
these means one family's pins are checked against the actual upstream bytes on
every test run — a typo'd hash in the catalog fails here.

Licensed under the SIL Open Font License 1.1, like every family in the catalog
(`https://openfontlicense.org`); see `@fontsource/instrument-serif`'s `LICENSE`.

## If the catalog's pins for this family change

The fixture goes stale and the test fails, which is the point. Re-download the
two files at the version the catalog names and commit them together with the
new pins:

```bash
V=5.3.0
for f in instrument-serif-latin-400-normal.woff2 \
         instrument-serif-latin-ext-400-normal.woff2; do
  curl -sSO "https://cdn.jsdelivr.net/npm/@fontsource/instrument-serif@$V/files/$f"
done
shasum -a 256 *.woff2      # must equal the catalog's sha256 fields
```
