// Deliberately invalid usage — compiled by the negative vue-tsc test to prove
// the generated literal unions reject wrong values. NOT part of the package
// tsconfig; only tests/fixtures/bad/tsconfig.json includes it.

import type { LButtonProps } from "../../../src/components/button";
import type { LDialogProps } from "../../../src/recipes/dialog";

export const bad: LButtonProps = {
  variant: "not-a-real-variant", // this MUST be a type error for the test to pass
  size: "sm",
};

export const badRecipe: LDialogProps = {
  size: "xl", // this MUST be a type error too — recipe unions are enforced
};
