// Deliberately invalid usage — compiled by the negative vue-tsc test to prove
// the generated literal unions reject wrong values. NOT part of the package
// tsconfig; only tests/fixtures/bad/tsconfig.json includes it.

import type { LButtonProps } from "../../../src/components/button";

export const bad: LButtonProps = {
  variant: "not-a-real-variant", // this MUST be a type error for the test to pass
  size: "sm",
};
