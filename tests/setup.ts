import { setDefaultTimeout } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { SPAWN_TIMEOUT } from "./helpers/spawn";

GlobalRegistrator.register();

// A `runSync` of a Bun child blocks the event loop, so bun can only fail the test
// once the spawn returns — and with its 5 s default, a child that stalled
// silently (the Bun↔Bun flake documented in helpers/spawn.ts) failed the test at
// the first budget, before the one retry `runSync` exists to make. Room for both
// attempts; a test that needs more still declares its own.
setDefaultTimeout(2 * SPAWN_TIMEOUT.CLI + 5_000);
