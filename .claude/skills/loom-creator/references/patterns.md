# Patterns Reference

All 6 composition patterns. Patterns combine primitives and recipes — no custom JS.

Each pattern has: `.html`, `.css`, `.manifest.json` (no `.js`).

---

## Auth Form

Login, register, and forgot-password forms.

```html
<div data-ui="auth-form" data-variant="login|register|forgot-password" data-size="sm|md|lg">
  <div data-part="header">
    <h2 data-part="title">Sign In</h2>
    <p data-part="description">Enter your credentials</p>
  </div>
  <form data-part="form">
    <div data-part="error" hidden>Error message</div>
    <div data-part="email-field">
      <label data-ui="label">Email</label>
      <input data-ui="input" type="email" required>
    </div>
    <div data-part="password-field">
      <label data-ui="label">Password</label>
      <input data-ui="input" type="password" required>
    </div>
    <div data-part="name-field" hidden>  <!-- shown in register mode -->
      <label data-ui="label">Name</label>
      <input data-ui="input" type="text">
    </div>
    <button data-part="submit" data-ui="button" data-variant="primary" type="submit">Sign In</button>
  </form>
  <div data-part="separator" data-ui="separator" data-label="OR"></div>
  <div data-part="social">
    <button data-ui="button" data-variant="outline">Continue with Google</button>
  </div>
  <div data-part="footer">
    <p data-ui="text" data-size="sm" data-variant="muted">Don't have an account? <a href="#">Sign up</a></p>
  </div>
</div>
```

States: `default`, `loading`, `error`, `success`. Uses: card, input, button, separator, label.

## CRUD Table

Data table with create, read, update, delete operations.

```html
<div data-ui="crud-table">
  <div data-part="header">
    <h2 data-part="title">Users</h2>
    <div data-part="actions">
      <input data-part="search" data-ui="input" placeholder="Search...">
      <button data-part="create" data-ui="button" data-variant="primary">Add User</button>
    </div>
  </div>
  <div data-part="table">
    <!-- data-ui="table" component here -->
  </div>
  <div data-part="pagination">
    <!-- data-ui="pagination" component here -->
  </div>
  <div data-part="empty" hidden>
    <!-- data-ui="empty-state" component here -->
  </div>
</div>
```

Uses: table, pagination, empty-state, button, input, dialog (for create/edit modals).

## Dashboard Shell

Application layout with sidebar, header, and content area.

```html
<div data-ui="dashboard-shell">
  <aside data-part="sidebar">
    <div data-part="sidebar-header">
      <span data-part="logo">Logo</span>
    </div>
    <nav data-part="nav" data-ui="nav" data-variant="vertical">
      <a data-part="link" data-state="active" href="#">Dashboard</a>
      <a data-part="link" href="#">Settings</a>
    </nav>
    <div data-part="sidebar-footer">
      <div data-ui="avatar" data-size="sm"><span data-part="fallback">U</span></div>
    </div>
  </aside>
  <main data-part="main">
    <header data-part="header">
      <button data-part="menu-toggle" aria-label="Toggle menu">&#x2630;</button>
      <h1 data-part="title" data-ui="heading" data-size="4">Dashboard</h1>
    </header>
    <div data-part="content">
      <!-- Page content -->
    </div>
  </main>
</div>
```

Uses: nav, avatar, button, heading.

## Empty State (Pattern)

Placeholder for empty content areas.

```html
<div data-ui="empty-state-pattern" data-variant="default|search|error">
  <div data-part="illustration">
    <span data-part="icon">...</span>
  </div>
  <h3 data-part="title">No results found</h3>
  <p data-part="description">Try adjusting your search or filters.</p>
  <div data-part="actions">
    <button data-ui="button" data-variant="primary">Action</button>
    <button data-ui="button" data-variant="outline">Secondary</button>
  </div>
</div>
```

Uses: button, text.

## Search Results

Search interface with input, results, and pagination.

```html
<div data-ui="search-results">
  <div data-part="header">
    <div data-part="search-bar">
      <input data-part="input" data-ui="input" type="search" placeholder="Search...">
      <button data-part="submit" data-ui="button" data-variant="primary">Search</button>
    </div>
    <div data-part="filters">
      <select data-ui="select" data-size="sm">
        <option>All</option>
      </select>
    </div>
  </div>
  <div data-part="summary">
    <p data-ui="text" data-size="sm" data-variant="muted">Showing 1-10 of 42 results</p>
  </div>
  <div data-part="results">
    <!-- Result cards here -->
  </div>
  <div data-part="pagination">
    <!-- data-ui="pagination" here -->
  </div>
  <div data-part="empty" hidden>
    <!-- empty state here -->
  </div>
</div>
```

Uses: input, button, select, card, pagination, empty-state.

## Settings Page

Settings page with tabbed sections and form fields.

```html
<div data-ui="settings-page">
  <div data-part="header">
    <h1 data-part="title" data-ui="heading" data-size="3">Settings</h1>
    <p data-part="description" data-ui="text" data-variant="muted">Manage your preferences</p>
  </div>
  <div data-part="tabs" data-ui="tabs">
    <div data-part="list" role="tablist">
      <button data-part="trigger" role="tab" aria-selected="true">General</button>
      <button data-part="trigger" role="tab" aria-selected="false" tabindex="-1">Security</button>
    </div>
    <div data-part="panel" role="tabpanel">
      <!-- Form fields -->
    </div>
    <div data-part="panel" role="tabpanel" hidden>
      <!-- More fields -->
    </div>
  </div>
  <div data-part="footer">
    <button data-ui="button" data-variant="outline">Discard</button>
    <button data-ui="button" data-variant="primary">Save Changes</button>
  </div>
</div>
```

Uses: tabs, input, switch, checkbox, button, label, card.
