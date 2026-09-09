// ═══════════════════════════════════════════════════════════════════════════
// The overlay family — Escape layering and teardown-while-open  [W3-2]
// ═══════════════════════════════════════════════════════════════════════════
//
// Two defects that every dismissible component shared, so they are asserted
// across the family rather than one file at a time — a new overlay added to the
// table below inherits both guarantees.
//
// 1. ESCAPE DID NOT LAYER. Each controller called `preventDefault()` and let the
//    keystroke keep travelling, so one Escape dismissed every ancestor overlay
//    at once: closing a `select-custom` inside a modal closed the whole form,
//    with everything the user had typed into it. `tooltip` was the only one that
//    stopped propagation, and it is the model the rest now follow.
//
// 2. `destroy()` WHILE OPEN LEFT A DEAD OVERLAY. Listeners were unbound and the
//    panel was left exactly where it was: a full-page backdrop whose close
//    button, Escape key and overlay click had all just stopped working, with no
//    way out. That is precisely what an SPA route change does. `context-menu`
//    was the only controller that closed itself on teardown, and it is the model
//    the rest now follow.

import { describe, it, expect, beforeEach } from "bun:test";
import { createDropdown } from "../../registry/recipes/dropdown/dropdown.js";
import { createContextMenu } from "../../registry/recipes/context-menu/context-menu.js";
import { createPopover } from "../../registry/recipes/popover/popover.js";
import { createSelectCustom } from "../../registry/recipes/select-custom/select-custom.js";
import { createCombobox } from "../../registry/recipes/combobox/combobox.js";
import { createTagInput } from "../../registry/recipes/tag-input/tag-input.js";
import { createCommandPalette } from "../../registry/recipes/command-palette/command-palette.js";
import { createDialog } from "../../registry/recipes/dialog/dialog.js";
import { createDrawer } from "../../registry/recipes/drawer/drawer.js";
import { createSheet } from "../../registry/recipes/sheet/sheet.js";
import { createSidebar } from "../../registry/recipes/sidebar/sidebar.js";
import { createTooltip } from "../../registry/recipes/tooltip/tooltip.js";
import { createDatePicker } from "../../registry/recipes/date-picker/date-picker.js";
import { createCalendar } from "../../registry/recipes/calendar/calendar.js";

interface Overlay {
  name: string;
  create: (root: HTMLElement) => any;
  html: string;
  /** Put it in its open/visible state. */
  open: (api: any, root: HTMLElement) => void;
  /** Where a keydown originates from when the component has focus. */
  escapeFrom: string;
  /** Everything that must be put away again, as `[selector, expectHidden]`. */
  hides: string[];
  /** The `data-state` value that means "dismissed". */
  closedState: string;
  /** Escape is not this controller's key to eat (it has no dismiss behaviour). */
  escapeIsNotOurs?: boolean;
}

const OVERLAYS: Overlay[] = [
  {
    name: "dropdown",
    create: createDropdown,
    html: `
      <div data-ui="dropdown" data-state="closed">
        <button data-part="trigger" aria-haspopup="true" aria-expanded="false">Options</button>
        <div data-part="menu" role="menu" hidden>
          <button data-part="item" role="menuitem">Edit</button>
        </div>
      </div>`,
    open: (api) => api.open(),
    escapeFrom: "[data-part='menu']",
    hides: ["[data-part='menu']"],
    closedState: "closed",
  },
  {
    name: "context-menu",
    create: createContextMenu,
    html: `
      <div data-ui="context-menu" data-state="closed">
        <div data-part="target" role="button" tabindex="0" aria-haspopup="menu" aria-expanded="false">Right-click</div>
        <div data-part="menu" role="menu" hidden>
          <button data-part="item" type="button" role="menuitem" tabindex="-1">Edit</button>
        </div>
      </div>`,
    open: (api) => api.open(10, 10),
    escapeFrom: "[data-part='menu']",
    hides: ["[data-part='menu']"],
    closedState: "closed",
  },
  {
    name: "popover",
    create: createPopover,
    html: `
      <div data-ui="popover" data-state="closed">
        <button data-part="trigger" aria-haspopup="true" aria-expanded="false">Show</button>
        <div data-part="content" hidden>
          <p>Body</p>
          <button data-part="close" aria-label="Close">x</button>
        </div>
      </div>`,
    open: (api) => api.open(),
    escapeFrom: "[data-part='content']",
    hides: ["[data-part='content']"],
    closedState: "closed",
  },
  {
    name: "select-custom",
    create: createSelectCustom,
    html: `
      <div data-ui="select-custom" data-state="closed">
        <button data-part="trigger" role="combobox" aria-expanded="false" aria-haspopup="listbox">
          <span data-part="value">Pick one</span>
        </button>
        <div data-part="listbox" role="listbox" hidden>
          <div data-part="option" role="option" data-value="a">A</div>
          <div data-part="option" role="option" data-value="b">B</div>
        </div>
      </div>`,
    open: (api) => api.open(),
    escapeFrom: "[data-part='listbox']",
    hides: ["[data-part='listbox']"],
    closedState: "closed",
  },
  {
    name: "combobox",
    create: createCombobox,
    html: `
      <div data-ui="combobox" data-state="closed">
        <input data-part="input" role="combobox" aria-expanded="false" aria-autocomplete="list">
        <div data-part="listbox" role="listbox" hidden>
          <div data-part="option" role="option" data-value="a">Apple</div>
        </div>
      </div>`,
    open: (api) => api.open(),
    escapeFrom: "[data-part='input']",
    hides: ["[data-part='listbox']"],
    closedState: "closed",
  },
  {
    name: "tag-input",
    create: createTagInput,
    html: `
      <div data-ui="tag-input" data-state="closed">
        <span data-part="taglist" role="group" aria-label="Tags">
          <input data-part="input" type="text" role="combobox" aria-expanded="false" aria-autocomplete="list">
        </span>
        <div data-part="listbox" role="listbox" hidden>
          <div data-part="option" role="option" data-value="red">red</div>
        </div>
        <input data-part="value" type="hidden">
      </div>`,
    open: (_api, root) => {
      const input = root.querySelector("[data-part='input']") as HTMLInputElement;
      input.value = "r";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    escapeFrom: "[data-part='input']",
    hides: ["[data-part='listbox']"],
    closedState: "closed",
  },
  {
    name: "command-palette",
    create: createCommandPalette,
    html: `
      <div data-ui="command-palette" data-state="closed">
        <div data-part="overlay" hidden></div>
        <div data-part="panel" role="dialog" hidden tabindex="-1">
          <input data-part="search" type="text">
          <div data-part="list" role="listbox">
            <button data-part="item" role="option" type="button">Open file</button>
          </div>
          <div data-part="empty" hidden>No results</div>
        </div>
      </div>`,
    open: (api) => api.open(),
    escapeFrom: "[data-part='search']",
    hides: ["[data-part='overlay']", "[data-part='panel']"],
    closedState: "closed",
  },
  {
    name: "tooltip",
    create: createTooltip,
    html: `
      <div data-ui="tooltip" data-state="hidden">
        <button data-part="trigger">Help</button>
        <div data-part="content" role="tooltip" hidden>Tip</div>
      </div>`,
    open: (api) => api.show(),
    escapeFrom: "[data-part='content']",
    hides: ["[data-part='content']"],
    closedState: "hidden",
  },
  {
    name: "date-picker",
    create: createDatePicker,
    html: `
      <div data-ui="date-picker" data-state="closed">
        <input data-part="input" type="text" aria-expanded="false">
        <button data-part="trigger" aria-label="Open calendar">cal</button>
        <div data-part="calendar" hidden>
          <div data-ui="calendar">
            <button data-part="nav-prev">&lt;</button>
            <span data-part="month-label"></span>
            <button data-part="nav-next">&gt;</button>
            <div data-part="grid-body"></div>
          </div>
        </div>
      </div>`,
    open: (api) => api.open(),
    escapeFrom: "[data-part='calendar']",
    hides: ["[data-part='calendar']"],
    closedState: "closed",
  },
];

/** Modals: destroy-while-open only — Escape on a top-level modal is its own. */
const MODALS: Overlay[] = [
  {
    name: "dialog",
    create: createDialog,
    html: `
      <div data-ui="dialog" data-state="closed">
        <button data-part="trigger">Open</button>
        <div data-part="overlay" hidden></div>
        <div data-part="panel" role="dialog" tabindex="-1" hidden>
          <button data-part="close">Close</button>
        </div>
      </div>`,
    open: (api) => api.open(),
    escapeFrom: "[data-part='panel']",
    hides: ["[data-part='overlay']", "[data-part='panel']"],
    closedState: "closed",
  },
  {
    name: "drawer",
    create: createDrawer,
    html: `
      <div data-ui="drawer" data-state="closed">
        <button data-part="trigger">Open</button>
        <div data-part="overlay" hidden></div>
        <div data-part="panel" role="dialog" tabindex="-1" hidden>
          <button data-part="close">Close</button>
        </div>
      </div>`,
    open: (api) => api.open(),
    escapeFrom: "[data-part='panel']",
    hides: ["[data-part='overlay']", "[data-part='panel']"],
    closedState: "closed",
  },
  {
    name: "sheet",
    create: createSheet,
    html: `
      <div data-ui="sheet" data-state="closed">
        <button data-part="trigger">Open</button>
        <div data-part="overlay" hidden></div>
        <div data-part="panel" role="dialog" tabindex="-1" hidden>
          <button data-part="close">Close</button>
        </div>
      </div>`,
    open: (api) => api.open(),
    escapeFrom: "[data-part='panel']",
    hides: ["[data-part='overlay']", "[data-part='panel']"],
    closedState: "closed",
  },
];

function mount(entry: Overlay) {
  document.body.innerHTML = `<div id="host">${entry.html}</div>`;
  const root = document.querySelector("[data-ui]") as HTMLElement;
  return { root, api: entry.create(root) };
}

function pressEscape(el: Element) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
}

beforeEach(() => {
  document.body.innerHTML = "";
});

// ───────────────────────────────────────────────────────────────────────────
// 1 · Escape dismisses ONE overlay
// ───────────────────────────────────────────────────────────────────────────

describe("Escape layers", () => {
  for (const entry of OVERLAYS) {
    it(`${entry.name}: Escape does not reach an enclosing overlay`, () => {
      const { root, api } = mount(entry);
      entry.open(api, root);
      expect(root.dataset.state).not.toBe(entry.closedState);

      // Stands in for the modal this component is nested inside. Before the fix
      // every one of these counted 1 — dismissing the inner widget dismissed the
      // form around it, and the user's input with it.
      let reachedAncestor = 0;
      document.getElementById("host")!.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key === "Escape") reachedAncestor++;
      });

      pressEscape(root.querySelector(entry.escapeFrom)!);

      expect(root.dataset.state).toBe(entry.closedState);
      expect(reachedAncestor).toBe(0);
    });
  }

  it("menubar: Escape with nothing expanded still reaches the page", () => {
    // The menubar is never hidden, so it receives Escape even when it has
    // nothing to dismiss. Swallowing it there would trap a user inside whatever
    // the menubar sits in — the opposite failure to the one above.
    document.body.innerHTML = `
      <div id="host">
        <div data-ui="menubar" data-state="closed" role="menubar">
          <div data-part="group" role="none">
            <button type="button" data-part="trigger" id="file" role="menuitem" tabindex="0"
                    aria-haspopup="menu" aria-expanded="false" aria-controls="file-menu">File</button>
            <div data-part="submenu" id="file-menu" role="menu" aria-labelledby="file" hidden>
              <button type="button" data-part="item" role="menuitem" tabindex="-1">New</button>
            </div>
          </div>
        </div>
      </div>`;
    const root = document.querySelector("[data-ui='menubar']") as HTMLElement;
    const { createMenubar } = require("../../registry/recipes/menubar/menubar.js");
    createMenubar(root);

    let reachedAncestor = 0;
    document.getElementById("host")!.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Escape") reachedAncestor++;
    });

    pressEscape(root);
    expect(reachedAncestor).toBe(1);
  });

  it("menubar: Escape with a submenu open is consumed", () => {
    document.body.innerHTML = `
      <div id="host">
        <div data-ui="menubar" data-state="closed" role="menubar">
          <div data-part="group" role="none">
            <button type="button" data-part="trigger" id="file" role="menuitem" tabindex="0"
                    aria-haspopup="menu" aria-expanded="false" aria-controls="file-menu">File</button>
            <div data-part="submenu" id="file-menu" role="menu" aria-labelledby="file" hidden>
              <button type="button" data-part="item" role="menuitem" tabindex="-1">New</button>
            </div>
          </div>
        </div>
      </div>`;
    const root = document.querySelector("[data-ui='menubar']") as HTMLElement;
    const { createMenubar } = require("../../registry/recipes/menubar/menubar.js");
    const api = createMenubar(root);
    api.open(0);
    expect(root.dataset.state).toBe("open");

    let reachedAncestor = 0;
    document.getElementById("host")!.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Escape") reachedAncestor++;
    });

    pressEscape(root.querySelector("[data-part='submenu']")!);
    expect(root.dataset.state).toBe("closed");
    expect(reachedAncestor).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2 · destroy() while open leaves nothing standing
// ───────────────────────────────────────────────────────────────────────────

describe("destroy() while open dismisses", () => {
  for (const entry of [...OVERLAYS, ...MODALS]) {
    it(`${entry.name}: leaves no dead overlay behind`, () => {
      const { root, api } = mount(entry);
      entry.open(api, root);
      expect(root.dataset.state).not.toBe(entry.closedState);

      api.destroy();

      expect(root.dataset.state).toBe(entry.closedState);
      for (const sel of entry.hides) {
        expect((root.querySelector(sel) as HTMLElement).hidden, `${entry.name} ${sel}`).toBe(true);
      }
    });
  }

  it("sidebar: a destroyed mobile drawer is not left covering the page", () => {
    document.body.innerHTML = `
      <div data-ui="sidebar" data-state="drawer" data-breakpoint="99999">
        <button data-part="trigger" aria-expanded="false">Menu</button>
        <div data-part="overlay" hidden></div>
        <aside data-part="panel"><nav></nav></aside>
      </div>`;
    const root = document.querySelector("[data-ui='sidebar']") as HTMLElement;
    const api = createSidebar(root);
    api.open();
    expect(root.dataset.state).toBe("drawer-open");

    api.destroy();
    expect(root.dataset.state).toBe("drawer");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3 · incomplete markup names the missing part
// ───────────────────────────────────────────────────────────────────────────

describe("a component missing a part says so instead of throwing", () => {
  const CASES: Array<[string, (root: HTMLElement) => any, string, string[]]> = [
    ["dropdown", createDropdown, "dropdown", ["trigger", "menu"]],
    ["context-menu", createContextMenu, "context-menu", ["target", "menu"]],
    ["date-picker", createDatePicker, "date-picker", ["input", "calendar"]],
    ["calendar", createCalendar, "calendar", ["grid-body"]],
  ];

  for (const [name, create, label, parts] of CASES) {
    it(`${name}: a bare root warns and stays inert`, () => {
      document.body.innerHTML = `<div data-ui="${name}"></div>`;
      const root = document.querySelector("[data-ui]") as HTMLElement;

      const warnings: string[] = [];
      const realWarn = console.warn;
      console.warn = (...args: unknown[]) => void warnings.push(String(args[0]));

      let api: any;
      try {
        // The engine contains a throwing controller, but a TypeError is a poor
        // way to tell a generator which part it forgot.
        expect(() => { api = create(root); }).not.toThrow();
      } finally {
        console.warn = realWarn;
      }

      const said = warnings.join("\n");
      expect(said).toContain("[Faqir]");
      expect(said).toContain(label);
      for (const part of parts) expect(said).toContain(part);

      // And the API it hands back is inert rather than absent, so a page that
      // calls `$ui.open()` on it does not take a second failure.
      expect(() => api.destroy()).not.toThrow();
    });
  }
});
