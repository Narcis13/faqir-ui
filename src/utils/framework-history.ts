// The framework files every released CLI wrote into a project, by content hash
// (task 1.1 release-blocker: `faqir upgrade` never refreshed ui/tokens).
//
// `faqir upgrade` three-way merges the framework-owned files under the output
// directory — the token layer and the base styles — the same way it merges a
// component. The merge needs a BASE: the bytes the project was given. A project
// initialized by 1.1 or later has one in `.faqir/pristine/framework/`; one
// initialized by 1.0 or earlier does not, because nothing recorded it. What
// every such project DOES have is a file some release wrote verbatim — so if
// its bytes hash to one of these, it was never edited, and the upgrade can
// fast-forward it exactly as it would a component whose working copy equals
// its baseline.
//
// Keys are paths relative to the output directory. `tokens/index.css` carries
// two kinds of file: the concatenated token layer `faqir init` writes (hashed
// WITHOUT its first-line banner, which the 1.0 Node bundle wrote mangled) and
// the `@import` index `init --tokens-split` copies. Each hash is annotated with
// the tags that shipped it. The table is closed: every release from 1.1 on
// records a real baseline at init, so no newer version needs a row here.
// `tests/commands/upgrade-framework.test.ts` recomputes it from the git tags.

export const RELEASED_FRAMEWORK_HASHES: Readonly<Record<string, readonly string[]>> = {
  "base/motion-presets.css": [
    "b9458b784c15665b074ed7f45d8f3ea6b229995fbfae4344fcdd4191b5c8904a", // v1.0.0
  ],
  "base/prose.css": [
    "445b80f74785cd2abf300ff3b216070b4e38f5de26d4ac6bb1d781cc14625357", // v0.1.1 v0.1.2 v0.2.0 v0.2.1 v0.2.2 v0.2.3 v0.2.4
    "ed49cacc684a8a67d5ed456e17ae78bfff6a222c7221e8a4e07d9d0fbdd8ac99", // v1.0.0
  ],
  "base/reset.css": [
    "cbf560b2e1ff9b6686baeb377d5ce3e7bc7ab51370bb0fae261c5dd74f1464a2", // v0.1.1 v0.1.2 v0.2.0 v0.2.1 v0.2.2 v0.2.3 v0.2.4
    "5b3be5e205781be6ec38cb00a93bf8038f161c2195dfd338712f9ab7835bda47", // v1.0.0
  ],
  "base/rhythm.css": [
    "d78fbe53b78bd1a9abf497fa1ddfa41dd738531a0076dc831b63b3bee787c006", // v1.0.0
  ],
  "tokens/aliases.css": [
    "006f0e595d056a87e6dcb8784ab0f7b451b17af47c44e36c3e860c8202e1fea7", // v0.1.1 v0.1.2 v0.2.0 v0.2.1 v0.2.2 v0.2.3 v0.2.4
    "3e2dcba4dcf14390e805725c38ce3cef0d6a2aeb76675a733699635700b08447", // v1.0.0
  ],
  "tokens/density.css": [
    "a055cfedd4804420c9b7f9a498a5ac6074be674e8aec26c6a746860b288d8e8a", // v1.0.0
  ],
  "tokens/density.html": [
    "61229b51529b5de3ac948ab18ec9c9ba1a96f6404adf943084e05c724896c46e", // v1.0.0
  ],
  "tokens/doc-aliases.css": [
    "ded1bcbb28bc98c85ef1508d42ac6e0bbc3ebd4cd8c63415eae106955f7883f6", // v0.2.0 v0.2.1 v0.2.2 v0.2.3 v0.2.4
    "55886fc2ea4b4d12cff78542028e0616abda4bceb606c7ec509a2a7667cd9675", // v1.0.0
  ],
  "tokens/document.css": [
    "c26b9fab0caac0346b881df7f7b9a293e1324d6cba8b828f957e7cf2b4a2b246", // v0.2.0 v0.2.1 v0.2.2 v0.2.3 v0.2.4
    "1ca21c7a2ace6a406d1d24de2ace07e5e08f1baa7abf7ef62f97aac7221f3d9d", // v1.0.0
  ],
  "tokens/effects.css": [
    "2c9dd1f660d71f1550eb9581a4c12160006b26f85983404805ede642698c887e", // v0.1.1 v0.1.2 v0.2.0 v0.2.1 v0.2.2 v0.2.3 v0.2.4 v1.0.0
  ],
  "tokens/imports.css": [
    "4603276e6d6ac6f800cafada20e5e3b1b8a970dfb88937ecf1452aa04ca370ac", // v0.1.1 v0.1.2
    "4e32664ab254e7da26fb2ca9ffc2da7f378679f43423f93fd456972d47448edb", // v0.2.0 v0.2.1 v0.2.2 v0.2.3 v0.2.4
    "609a136abedf5cc7672d6dc30d4a731b7383d7a6fd87649d772a2d91f24abff0", // v1.0.0
  ],
  "tokens/index.css": [
    "6584b3813c75cd93675d48826d1b5a3ce92e1e4c02593e495ca7ee060c6cb25a", // v0.1.1 v0.1.2 v0.2.0
    "4603276e6d6ac6f800cafada20e5e3b1b8a970dfb88937ecf1452aa04ca370ac", // v0.1.1 v0.1.2
    "4e32664ab254e7da26fb2ca9ffc2da7f378679f43423f93fd456972d47448edb", // v0.2.0 v0.2.1 v0.2.2 v0.2.3 v0.2.4
    "547d02a4c1480942cce0a64717e18a8c4af5f62ce8e1e38b8a9f0d131e5fc8b7", // v0.2.1 v0.2.2 v0.2.3 v0.2.4
    "0d199a11031e015a8e2fbfec9a307eced9b19ca997d13f01211685b28f31015a", // v1.0.0
    "609a136abedf5cc7672d6dc30d4a731b7383d7a6fd87649d772a2d91f24abff0", // v1.0.0
  ],
  "tokens/motion.css": [
    "b4eaf534f773c8bd343997e39ea0c7ea6cb143eb9cd90f0d21ccd70f5c2644b4", // v0.1.1 v0.1.2 v0.2.0 v0.2.1 v0.2.2 v0.2.3 v0.2.4
    "d2001985e3f00be6d00f5f1bce4ab457fb5199bb08c348ec6b9f03d12dbe82f0", // v1.0.0
  ],
  "tokens/palette.css": [
    "f124356c1300f0a1b305eb026e2c08f57976a424e7ee00c5bd9be591dadb2574", // v0.1.1 v0.1.2 v0.2.0 v0.2.1 v0.2.2 v0.2.3 v0.2.4
    "99dffc0b72bd862d7b70a3b1292d50f0a0e2b385be8792a8a546770d7f51efff", // v1.0.0
  ],
  "tokens/semantic.css": [
    "45e4833c94606183828e7d2da1026e16e8a8a308de219d108ca1b36eaeca8622", // v0.1.1 v0.1.2 v0.2.0 v0.2.1 v0.2.2 v0.2.3 v0.2.4
    "e36f80450c712e82020478346bc76ea9765b5889267469e4f9259175fc468174", // v1.0.0
  ],
  "tokens/spacing.css": [
    "1ccedbf4a58031c25106ada834904621ccd367b32424e1b087da6f96c3070dbf", // v0.1.1 v0.1.2 v0.2.0 v0.2.1 v0.2.2 v0.2.3 v0.2.4
    "2113ef78b48070342a0af4958a68804e40d3240687673ff5fc4fa01954b19df7", // v1.0.0
  ],
  "tokens/typography.css": [
    "d029a6b1f91f04ff8c703a87c8ec2921f08cbb7962935a9487c33d88bb78ccf2", // v0.1.1 v0.1.2 v0.2.0 v0.2.1 v0.2.2 v0.2.3 v0.2.4 v1.0.0
  ],
};
