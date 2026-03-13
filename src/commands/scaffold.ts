// loom scaffold — generate full page templates

import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "../utils/logger";
import { configExists, readConfig, writeConfig } from "../utils/config";
import { ensureDir, getRegistryPath } from "../utils/fs";
import { loadManifest } from "../manifest";

interface ScaffoldDef {
  name: string;
  title: string;
  description: string;
  patterns: string[];
  components: string[];
}

const SCAFFOLDS: Record<string, ScaffoldDef> = {
  "landing-page": {
    name: "landing-page",
    title: "Landing Page",
    description: "Marketing landing page with hero, features, and CTA sections",
    patterns: [],
    components: ["button", "card", "separator", "grid", "stack", "surface", "badge"],
  },
  "admin-dashboard": {
    name: "admin-dashboard",
    title: "Admin Dashboard",
    description: "Full admin dashboard with sidebar, data tables, and charts",
    patterns: ["dashboard-shell", "crud-table"],
    components: [
      "button", "card", "input", "badge", "avatar", "separator", "spinner",
      "grid", "stack", "surface", "table", "dialog", "dropdown", "tabs", "toast",
      "pagination",
    ],
  },
  "internal-tool": {
    name: "internal-tool",
    title: "Internal Tool",
    description: "Internal tool with settings, forms, and data management",
    patterns: ["settings-page", "crud-table"],
    components: [
      "button", "card", "input", "label", "select", "checkbox", "switch",
      "badge", "separator", "spinner", "grid", "stack",
      "tabs", "dialog", "dropdown", "toast", "table", "pagination",
    ],
  },
};

function printHelp() {
  log.heading("loom scaffold <name>");
  log.blank();
  console.log("Generate a full page template.");
  log.blank();
  console.log("Available scaffolds:");
  log.table(
    Object.values(SCAFFOLDS).map((s) => [s.name, s.description])
  );
  log.blank();
  console.log("Options:");
  log.table([
    ["--output <path>", "Output file path (default: ./<name>.html)"],
    ["--no-add", "Don't auto-install missing components"],
  ]);
}

async function ensureComponentsInstalled(
  needed: string[],
  config: Awaited<ReturnType<typeof readConfig>>,
  cwd: string,
  autoAdd: boolean
): Promise<string[]> {
  const installed = new Set([
    ...config.installed.primitives,
    ...config.installed.recipes,
    ...config.installed.patterns,
  ]);

  const missing = needed.filter((c) => !installed.has(c));
  if (missing.length === 0) return [];

  if (!autoAdd) {
    return missing;
  }

  // Auto-add missing components via the add logic
  const registryPath = getRegistryPath();

  for (const name of missing) {
    for (const layer of ["primitives", "recipes", "patterns"] as const) {
      const compPath = join(registryPath, layer, name);
      if (existsSync(compPath)) {
        const outputDir = join(cwd, config.output_dir);
        const destDir = join(outputDir, layer, name);
        ensureDir(destDir);

        // Copy files
        const glob = new Bun.Glob("**/*");
        for await (const path of glob.scan({ cwd: compPath, onlyFiles: true })) {
          const content = await Bun.file(join(compPath, path)).text();
          ensureDir(join(destDir, path, ".."));
          await Bun.write(join(destDir, path), content);
        }

        if (!config.installed[layer].includes(name)) {
          config.installed[layer].push(name);
        }
        break;
      }
    }
  }

  config.installed.primitives.sort();
  config.installed.recipes.sort();
  config.installed.patterns.sort();
  await writeConfig(config, cwd);

  return [];
}

function generateLandingPage(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="ui/tokens/index.css">
  <link rel="stylesheet" href="ui/tokens/theme.css">
  <link rel="stylesheet" href="ui/base/reset.css">
  <link rel="stylesheet" href="ui/base/prose.css">
  <link rel="stylesheet" href="ui/primitives/button/button.css">
  <link rel="stylesheet" href="ui/primitives/card/card.css">
  <link rel="stylesheet" href="ui/primitives/separator/separator.css">
  <link rel="stylesheet" href="ui/primitives/grid/grid.css">
  <link rel="stylesheet" href="ui/primitives/stack/stack.css">
  <link rel="stylesheet" href="ui/primitives/surface/surface.css">
  <link rel="stylesheet" href="ui/primitives/badge/badge.css">
  <style>
    body { font-family: var(--font-sans); color: var(--color-fg); background: var(--color-bg); }
    [data-part="hero"] { text-align: center; padding: var(--space-20) var(--space-6); }
    [data-part="hero"] h1 { font-size: var(--text-4xl); font-weight: var(--weight-bold); margin-bottom: var(--space-4); }
    [data-part="hero"] p { font-size: var(--text-lg); color: var(--color-fg-muted); max-width: 40rem; margin: 0 auto var(--space-8); }
    [data-part="hero-actions"] { display: flex; gap: var(--space-3); justify-content: center; }
    [data-part="features"] { padding: var(--space-16) var(--space-6); max-width: 72rem; margin: 0 auto; }
    [data-part="features"] h2 { text-align: center; font-size: var(--text-3xl); font-weight: var(--weight-bold); margin-bottom: var(--space-12); }
    [data-part="cta"] { text-align: center; padding: var(--space-16) var(--space-6); background: var(--color-bg-subtle); }
    [data-part="cta"] h2 { font-size: var(--text-2xl); font-weight: var(--weight-bold); margin-bottom: var(--space-4); }
    [data-part="cta"] p { color: var(--color-fg-muted); margin-bottom: var(--space-6); }
    [data-part="footer"] { text-align: center; padding: var(--space-8) var(--space-6); color: var(--color-fg-muted); font-size: var(--text-sm); }
  </style>
</head>
<body>

  <!-- Hero Section -->
  <section data-part="hero">
    <span data-ui="badge" data-variant="secondary">New Release</span>
    <h1>Build something amazing</h1>
    <p>A modern solution for your business needs. Fast, reliable, and built for scale.</p>
    <div data-part="hero-actions">
      <button data-ui="button" data-variant="primary" data-size="lg">Get Started</button>
      <button data-ui="button" data-variant="outline" data-size="lg">Learn More</button>
    </div>
  </section>

  <hr data-ui="separator">

  <!-- Features -->
  <section data-part="features">
    <h2>Features</h2>
    <div data-ui="grid" data-variant="3col" style="gap: var(--space-6);">
      <div data-ui="card">
        <div data-part="header"><h3 data-part="title">Fast Performance</h3></div>
        <div data-part="body"><p>Built for speed with optimized delivery and minimal overhead.</p></div>
      </div>
      <div data-ui="card">
        <div data-part="header"><h3 data-part="title">Secure by Default</h3></div>
        <div data-part="body"><p>Enterprise-grade security with encryption and access controls.</p></div>
      </div>
      <div data-ui="card">
        <div data-part="header"><h3 data-part="title">Easy Integration</h3></div>
        <div data-part="body"><p>Plug in to your existing workflow with our flexible API.</p></div>
      </div>
    </div>
  </section>

  <hr data-ui="separator">

  <!-- CTA -->
  <section data-part="cta">
    <h2>Ready to get started?</h2>
    <p>Join thousands of teams already using our platform.</p>
    <button data-ui="button" data-variant="primary" data-size="lg">Start Free Trial</button>
  </section>

  <!-- Footer -->
  <footer data-part="footer">
    <p>&copy; 2025 Your Company. All rights reserved.</p>
  </footer>

</body>
</html>`;
}

function generateAdminDashboard(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="ui/tokens/index.css">
  <link rel="stylesheet" href="ui/tokens/theme.css">
  <link rel="stylesheet" href="ui/base/reset.css">
  <link rel="stylesheet" href="ui/base/prose.css">
  <link rel="stylesheet" href="ui/primitives/button/button.css">
  <link rel="stylesheet" href="ui/primitives/card/card.css">
  <link rel="stylesheet" href="ui/primitives/input/input.css">
  <link rel="stylesheet" href="ui/primitives/badge/badge.css">
  <link rel="stylesheet" href="ui/primitives/avatar/avatar.css">
  <link rel="stylesheet" href="ui/primitives/separator/separator.css">
  <link rel="stylesheet" href="ui/primitives/spinner/spinner.css">
  <link rel="stylesheet" href="ui/primitives/grid/grid.css">
  <link rel="stylesheet" href="ui/primitives/stack/stack.css">
  <link rel="stylesheet" href="ui/primitives/surface/surface.css">
  <link rel="stylesheet" href="ui/recipes/dialog/dialog.css">
  <link rel="stylesheet" href="ui/recipes/dropdown/dropdown.css">
  <link rel="stylesheet" href="ui/recipes/tabs/tabs.css">
  <link rel="stylesheet" href="ui/recipes/toast/toast.css">
  <link rel="stylesheet" href="ui/recipes/table/table.css">
  <link rel="stylesheet" href="ui/recipes/pagination/pagination.css">
  <style>
    body { font-family: var(--font-sans); color: var(--color-fg); background: var(--color-bg); margin: 0; }
    [data-ui="dashboard-shell"] { display: grid; grid-template-columns: 16rem 1fr; grid-template-rows: auto 1fr; min-height: 100vh; }
    [data-part="sidebar"] { grid-row: 1 / -1; background: var(--color-bg-subtle); border-right: 1px solid var(--color-border); padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); }
    [data-part="sidebar"] [data-part="logo"] { font-size: var(--text-lg); font-weight: var(--weight-bold); padding: var(--space-4) var(--space-2); }
    [data-part="nav-item"] { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); color: var(--color-fg-muted); text-decoration: none; font-size: var(--text-sm); }
    [data-part="nav-item"]:hover { background: var(--color-bg-muted); color: var(--color-fg); }
    [data-part="nav-item"][data-state="active"] { background: var(--color-primary-subtle); color: var(--color-primary); font-weight: var(--weight-medium); }
    [data-part="header"] { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4) var(--space-6); border-bottom: 1px solid var(--color-border); }
    [data-part="header-actions"] { display: flex; align-items: center; gap: var(--space-3); }
    [data-part="content"] { padding: var(--space-6); overflow-y: auto; }
    [data-part="stats"] { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-4); margin-bottom: var(--space-6); }
    [data-part="stat-value"] { font-size: var(--text-2xl); font-weight: var(--weight-bold); }
    [data-part="stat-label"] { font-size: var(--text-sm); color: var(--color-fg-muted); }
  </style>
</head>
<body>

  <div data-ui="dashboard-shell">

    <!-- Sidebar -->
    <aside data-part="sidebar">
      <div data-part="logo">Admin</div>
      <hr data-ui="separator">
      <nav data-part="nav">
        <a href="#" data-part="nav-item" data-state="active">Dashboard</a>
        <a href="#" data-part="nav-item">Users</a>
        <a href="#" data-part="nav-item">Products</a>
        <a href="#" data-part="nav-item">Orders</a>
        <a href="#" data-part="nav-item">Settings</a>
      </nav>
      <div style="margin-top: auto;">
        <hr data-ui="separator">
        <div style="display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2);">
          <span data-ui="avatar" data-size="sm">JD</span>
          <span style="font-size: var(--text-sm);">John Doe</span>
        </div>
      </div>
    </aside>

    <!-- Header -->
    <header data-part="header">
      <h1 style="font-size: var(--text-xl); font-weight: var(--weight-semibold); margin: 0;">Dashboard</h1>
      <div data-part="header-actions">
        <div data-ui="input" data-size="sm" style="width: 16rem;">
          <input type="search" placeholder="Search..." data-part="field">
        </div>
        <button data-ui="button" data-variant="ghost" data-size="sm" aria-label="Notifications">
          <span data-part="icon">&#128276;</span>
        </button>
        <span data-ui="avatar" data-size="sm">JD</span>
      </div>
    </header>

    <!-- Content -->
    <main data-part="content">

      <!-- Stats -->
      <div data-part="stats">
        <div data-ui="card">
          <div data-part="body">
            <div data-part="stat-label">Total Users</div>
            <div data-part="stat-value">2,420</div>
          </div>
        </div>
        <div data-ui="card">
          <div data-part="body">
            <div data-part="stat-label">Revenue</div>
            <div data-part="stat-value">$45,231</div>
          </div>
        </div>
        <div data-ui="card">
          <div data-part="body">
            <div data-part="stat-label">Orders</div>
            <div data-part="stat-value">1,210</div>
          </div>
        </div>
        <div data-ui="card">
          <div data-part="body">
            <div data-part="stat-label">Active Now</div>
            <div data-part="stat-value">573</div>
          </div>
        </div>
      </div>

      <!-- Recent Activity -->
      <div data-ui="card">
        <div data-part="header">
          <h3 data-part="title">Recent Orders</h3>
        </div>
        <div data-part="body">
          <div data-ui="table">
            <table data-part="table">
              <thead data-part="header">
                <tr>
                  <th data-part="head-cell">Order</th>
                  <th data-part="head-cell">Customer</th>
                  <th data-part="head-cell">Status</th>
                  <th data-part="head-cell">Amount</th>
                </tr>
              </thead>
              <tbody data-part="body">
                <tr data-part="row">
                  <td data-part="cell">#1234</td>
                  <td data-part="cell">Alice Smith</td>
                  <td data-part="cell"><span data-ui="badge" data-variant="success">Completed</span></td>
                  <td data-part="cell">$250.00</td>
                </tr>
                <tr data-part="row">
                  <td data-part="cell">#1233</td>
                  <td data-part="cell">Bob Johnson</td>
                  <td data-part="cell"><span data-ui="badge" data-variant="warning">Pending</span></td>
                  <td data-part="cell">$120.00</td>
                </tr>
                <tr data-part="row">
                  <td data-part="cell">#1232</td>
                  <td data-part="cell">Carol Williams</td>
                  <td data-part="cell"><span data-ui="badge" data-variant="default">Processing</span></td>
                  <td data-part="cell">$89.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </main>
  </div>

  <script type="module" src="ui/core/loom.js"></script>
</body>
</html>`;
}

function generateInternalTool(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="ui/tokens/index.css">
  <link rel="stylesheet" href="ui/tokens/theme.css">
  <link rel="stylesheet" href="ui/base/reset.css">
  <link rel="stylesheet" href="ui/base/prose.css">
  <link rel="stylesheet" href="ui/primitives/button/button.css">
  <link rel="stylesheet" href="ui/primitives/card/card.css">
  <link rel="stylesheet" href="ui/primitives/input/input.css">
  <link rel="stylesheet" href="ui/primitives/label/label.css">
  <link rel="stylesheet" href="ui/primitives/select/select.css">
  <link rel="stylesheet" href="ui/primitives/checkbox/checkbox.css">
  <link rel="stylesheet" href="ui/primitives/switch/switch.css">
  <link rel="stylesheet" href="ui/primitives/badge/badge.css">
  <link rel="stylesheet" href="ui/primitives/separator/separator.css">
  <link rel="stylesheet" href="ui/primitives/spinner/spinner.css">
  <link rel="stylesheet" href="ui/primitives/grid/grid.css">
  <link rel="stylesheet" href="ui/primitives/stack/stack.css">
  <link rel="stylesheet" href="ui/recipes/tabs/tabs.css">
  <link rel="stylesheet" href="ui/recipes/dialog/dialog.css">
  <link rel="stylesheet" href="ui/recipes/dropdown/dropdown.css">
  <link rel="stylesheet" href="ui/recipes/toast/toast.css">
  <link rel="stylesheet" href="ui/recipes/table/table.css">
  <link rel="stylesheet" href="ui/recipes/pagination/pagination.css">
  <style>
    body { font-family: var(--font-sans); color: var(--color-fg); background: var(--color-bg); margin: 0; padding: var(--space-6); max-width: 72rem; margin: 0 auto; }
    [data-part="page-header"] { margin-bottom: var(--space-6); }
    [data-part="page-header"] h1 { font-size: var(--text-2xl); font-weight: var(--weight-bold); margin-bottom: var(--space-1); }
    [data-part="page-header"] p { color: var(--color-fg-muted); }
    [data-part="section"] { margin-bottom: var(--space-6); }
    [data-part="section-header"] { margin-bottom: var(--space-4); }
    [data-part="section-header"] h2 { font-size: var(--text-lg); font-weight: var(--weight-semibold); }
    [data-part="field-group"] { display: grid; grid-template-columns: 1fr 2fr; gap: var(--space-4); align-items: start; padding: var(--space-4) 0; border-bottom: 1px solid var(--color-border); }
    [data-part="field-label"] { font-size: var(--text-sm); font-weight: var(--weight-medium); padding-top: var(--space-2); }
    [data-part="field-description"] { font-size: var(--text-sm); color: var(--color-fg-muted); margin-top: var(--space-1); }
    [data-part="actions"] { display: flex; gap: var(--space-3); justify-content: flex-end; padding: var(--space-4) 0; position: sticky; bottom: 0; background: var(--color-bg); border-top: 1px solid var(--color-border); }
  </style>
</head>
<body>

  <div data-part="page-header">
    <h1>Settings</h1>
    <p>Manage your application configuration and preferences.</p>
  </div>

  <div data-ui="tabs" data-variant="underline">
    <div data-part="list" role="tablist">
      <button data-part="trigger" role="tab" id="tab-general" aria-controls="panel-general" aria-selected="true">General</button>
      <button data-part="trigger" role="tab" id="tab-notify" aria-controls="panel-notify" aria-selected="false" tabindex="-1">Notifications</button>
      <button data-part="trigger" role="tab" id="tab-security" aria-controls="panel-security" aria-selected="false" tabindex="-1">Security</button>
    </div>

    <!-- General Settings -->
    <div data-part="panel" role="tabpanel" id="panel-general" aria-labelledby="tab-general">
      <div data-ui="card" style="margin-top: var(--space-4);">
        <div data-part="body">

          <div data-part="field-group">
            <div>
              <div data-part="field-label">Application Name</div>
              <div data-part="field-description">The name displayed in the header.</div>
            </div>
            <div data-ui="input">
              <input type="text" data-part="field" value="My Application">
            </div>
          </div>

          <div data-part="field-group">
            <div>
              <div data-part="field-label">Language</div>
              <div data-part="field-description">Default language for the interface.</div>
            </div>
            <div data-ui="select">
              <select data-part="field">
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
              </select>
            </div>
          </div>

          <div data-part="field-group">
            <div>
              <div data-part="field-label">Dark Mode</div>
              <div data-part="field-description">Enable dark theme.</div>
            </div>
            <button data-ui="switch" role="switch" aria-checked="false">
              <span data-part="thumb"></span>
            </button>
          </div>

        </div>
      </div>
    </div>

    <!-- Notifications -->
    <div data-part="panel" role="tabpanel" id="panel-notify" aria-labelledby="tab-notify" hidden>
      <div data-ui="card" style="margin-top: var(--space-4);">
        <div data-part="body">

          <div data-part="field-group">
            <div>
              <div data-part="field-label">Email Notifications</div>
              <div data-part="field-description">Receive email updates.</div>
            </div>
            <button data-ui="switch" role="switch" aria-checked="true" data-state="checked">
              <span data-part="thumb"></span>
            </button>
          </div>

          <div data-part="field-group">
            <div>
              <div data-part="field-label">Push Notifications</div>
              <div data-part="field-description">Browser push notifications.</div>
            </div>
            <button data-ui="switch" role="switch" aria-checked="false">
              <span data-part="thumb"></span>
            </button>
          </div>

        </div>
      </div>
    </div>

    <!-- Security -->
    <div data-part="panel" role="tabpanel" id="panel-security" aria-labelledby="tab-security" hidden>
      <div data-ui="card" style="margin-top: var(--space-4);">
        <div data-part="body">

          <div data-part="field-group">
            <div>
              <div data-part="field-label">Change Password</div>
              <div data-part="field-description">Update your account password.</div>
            </div>
            <div data-ui="stack" style="gap: var(--space-3);">
              <div data-ui="input">
                <input type="password" data-part="field" placeholder="Current password">
              </div>
              <div data-ui="input">
                <input type="password" data-part="field" placeholder="New password">
              </div>
            </div>
          </div>

          <div data-part="field-group">
            <div>
              <div data-part="field-label">Two-Factor Auth</div>
              <div data-part="field-description">Add an extra layer of security.</div>
            </div>
            <button data-ui="button" data-variant="outline" data-size="sm">Enable 2FA</button>
          </div>

        </div>
      </div>
    </div>
  </div>

  <div data-part="actions">
    <button data-ui="button" data-variant="outline">Discard</button>
    <button data-ui="button" data-variant="primary">Save Changes</button>
  </div>

  <script type="module" src="ui/core/loom.js"></script>
</body>
</html>`;
}

export async function scaffold(args: string[]): Promise<void> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    return;
  }

  const name = args[0];
  const scaffoldDef = SCAFFOLDS[name];

  if (!scaffoldDef) {
    log.error(`Unknown scaffold: '${name}'`);
    log.dim("Available scaffolds: " + Object.keys(SCAFFOLDS).join(", "));
    process.exit(1);
  }

  const cwd = process.cwd();

  if (!configExists(cwd)) {
    log.error("No loom.config.json found. Run 'loom init' first.");
    process.exit(1);
  }

  const config = await readConfig(cwd);
  const noAdd = args.includes("--no-add");

  // Parse output path
  let outputPath = join(cwd, `${name}.html`);
  const outputIdx = args.indexOf("--output");
  if (outputIdx >= 0 && args[outputIdx + 1]) {
    outputPath = join(cwd, args[outputIdx + 1]);
  }

  log.heading(`Scaffolding: ${scaffoldDef.title}`);

  // Ensure all needed components are installed
  const allNeeded = [...scaffoldDef.components, ...scaffoldDef.patterns];
  const missing = await ensureComponentsInstalled(allNeeded, config, cwd, !noAdd);

  if (missing.length > 0) {
    log.warn(`Missing components: ${missing.join(", ")}`);
    log.dim("Run 'loom add' to install them, or remove --no-add.");
    process.exit(1);
  }

  if (!noAdd && allNeeded.length > 0) {
    log.step("Ensured all required components are installed.");
  }

  // Generate the page
  let html: string;
  switch (name) {
    case "landing-page":
      html = generateLandingPage(scaffoldDef.title);
      break;
    case "admin-dashboard":
      html = generateAdminDashboard(scaffoldDef.title);
      break;
    case "internal-tool":
      html = generateInternalTool(scaffoldDef.title);
      break;
    default:
      log.error(`No generator for scaffold '${name}'.`);
      process.exit(1);
      return;
  }

  ensureDir(join(outputPath, ".."));
  await Bun.write(outputPath, html);

  log.blank();
  log.success(`Scaffold generated: ${outputPath}`);
  log.dim("Open the file in a browser to preview.");
}
