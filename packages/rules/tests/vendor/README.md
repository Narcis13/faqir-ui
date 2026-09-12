# Vendored fixtures

## `jsonlogic-tests.json`

The public JSONLogic conformance suite, verbatim.

| | |
| --- | --- |
| Source | <https://jsonlogic.com/tests.json> |
| Retrieved | 2026-09-12 |
| SHA-256 | `a202b65edda0d7ab687c758b8f10cfe9ba75561cd7166e5650710f88f26303a4` |
| Licence | MIT — JsonLogic is © 2016 Jeremy Wadhams |

Each entry is either a `"# comment"` string or a `[logic, data, expected]`
triple. `../logic.test.ts` runs every one of them against `evaluateLogic`, and
partitions them by hand: a vector whose operators are all implemented **must**
produce the expected value, and a vector naming an operator this package does
not implement (`map`, `filter`, `reduce`, `merge`, `?:`) **must** be refused
with a `DefinitionError` that names it. Both halves are asserted to be
non-empty, so a vector cannot drift into the "not our problem" bucket unnoticed.

It is vendored rather than fetched because a test that reaches the network is a
test that fails on a train. Re-download it (and update the digest above) only
deliberately: this file is the definition of "our subset behaves like
JSONLogic", and silently replacing it would silently move that line.
