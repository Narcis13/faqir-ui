# Data-Driven Rendering in Faqir UI

Two approaches for connecting Faqir UI components to server-backed data.
Approach B is application-level and works today. Approach C is a framework-level
directive that would require changes to `faqir-core.js`.

---

## Approach B: Data Source Service Layer

A thin JS service layer that `l-data` blocks consume. Not a Faqir controller —
an application-level utility. Faqir's `no-fetch` audit rule only applies to
recipe controllers, so this layer lives outside that boundary.

### The Service Factory

```html
<script>
  /**
   * Creates a reactive data source bound to a REST endpoint.
   * Meant to be spread into l-data and consumed by l-for / l-if / l-text.
   *
   * @param {string} endpoint  - Base URL (e.g. "/api/menu-items")
   * @param {object} [options]
   * @param {string} [options.idKey="id"]       - Primary key field name
   * @param {number} [options.pollInterval]     - Auto-refresh interval in ms (0 = off)
   * @param {boolean} [options.optimistic=true] - Update UI before server confirms
   */
  function apiSource(endpoint, options = {}) {
    const { idKey = 'id', pollInterval = 0, optimistic = true } = options;
    let pollTimer = null;

    return {
      items: [],
      loading: true,
      submitting: false,
      error: null,

      // ---- Read ----

      async load() {
        this.loading = true;
        this.error = null;
        try {
          const res = await fetch(endpoint);
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          this.items = await res.json();
        } catch (e) {
          this.error = e.message;
        } finally {
          this.loading = false;
        }
      },

      // ---- Create ----

      async create(payload) {
        this.submitting = true;
        this.error = null;

        // Optimistic: add a temporary item immediately
        let tempIndex = -1;
        if (optimistic) {
          const temp = { ...payload, _pending: true };
          this.items.push(temp);
          tempIndex = this.items.length - 1;
        }

        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          const created = await res.json();

          if (optimistic) {
            // Replace the temp item with the real server response
            this.items[tempIndex] = created;
          } else {
            this.items.push(created);
          }
          return created;
        } catch (e) {
          this.error = e.message;
          // Roll back optimistic insert
          if (optimistic && tempIndex >= 0) {
            this.items.splice(tempIndex, 1);
          }
          return null;
        } finally {
          this.submitting = false;
        }
      },

      // ---- Update ----

      async update(id, payload) {
        this.error = null;
        const idx = this.items.findIndex(i => i[idKey] === id);
        let snapshot = null;

        if (optimistic && idx >= 0) {
          snapshot = { ...this.items[idx] };
          Object.assign(this.items[idx], payload);
        }

        try {
          const res = await fetch(`${endpoint}/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          const updated = await res.json();

          if (idx >= 0) this.items[idx] = updated;
          return updated;
        } catch (e) {
          this.error = e.message;
          // Roll back
          if (optimistic && snapshot && idx >= 0) {
            this.items[idx] = snapshot;
          }
          return null;
        }
      },

      // ---- Delete ----

      async remove(id) {
        this.error = null;
        const idx = this.items.findIndex(i => i[idKey] === id);
        let snapshot = null;

        if (optimistic && idx >= 0) {
          snapshot = this.items[idx];
          this.items.splice(idx, 1);
        }

        try {
          const res = await fetch(`${endpoint}/${id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

          if (!optimistic && idx >= 0) {
            this.items.splice(idx, 1);
          }
        } catch (e) {
          this.error = e.message;
          // Roll back
          if (optimistic && snapshot) {
            this.items.splice(idx, 0, snapshot);
          }
        }
      },

      // ---- Polling ----

      startPolling(interval) {
        this.stopPolling();
        const ms = interval || pollInterval;
        if (ms > 0) {
          pollTimer = setInterval(() => this.load(), ms);
        }
      },

      stopPolling() {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      },

      // ---- Refetch shorthand ----

      async refresh() {
        return this.load();
      },
    };
  }
</script>
```

### Usage: Menu from Server

```html
<div l-data="{ ...apiSource('/api/menu-items'), newName: '' }"
     l-init="load()">

  <!-- Loading state -->
  <template l-if="loading">
    <div data-ui="spinner" data-size="sm"></div>
  </template>

  <!-- Error state -->
  <template l-if="error">
    <div data-ui="card" data-variant="destructive" data-size="sm">
      <div data-part="body">
        <span data-ui="text" data-variant="destructive" l-text="error"></span>
        <button data-ui="button" data-variant="outline" data-size="sm"
                @click="load()">Retry</button>
      </div>
    </div>
  </template>

  <!-- Menu rendered from server data -->
  <template l-if="!loading && !error">
    <nav data-ui="menu">
      <template l-for="item in items">
        <a data-part="item" l-text="item.name" :href="item.url"></a>
      </template>
    </nav>
  </template>

  <!-- Add new item -->
  <form @submit.prevent="create({ name: newName }).then(() => newName = '')">
    <div data-ui="stack" data-variant="horizontal" data-gap="2">
      <input data-ui="input" data-size="sm" l-model="newName"
             placeholder="New menu item..." required>
      <button data-ui="button" data-variant="primary" data-size="sm"
              :data-state="submitting ? 'disabled' : ''">
        Add
      </button>
    </div>
  </form>
</div>
```

### Usage: Task Manager with Full CRUD

```html
<div l-data="{
       ...apiSource('/api/tasks', { idKey: 'id', optimistic: true }),
       newTitle: '',
       newPriority: 'medium',
       filter: 'all',

       get filtered() {
         if (this.filter === 'all') return this.items;
         if (this.filter === 'done') return this.items.filter(t => t.done);
         return this.items.filter(t => !t.done);
       }
     }"
     l-init="load()">

  <!-- Toolbar -->
  <div data-ui="stack" data-variant="horizontal" data-gap="2">
    <button data-ui="button" data-size="sm"
            :data-variant="filter === 'all' ? 'primary' : 'ghost'"
            @click="filter = 'all'">All</button>
    <button data-ui="button" data-size="sm"
            :data-variant="filter === 'active' ? 'primary' : 'ghost'"
            @click="filter = 'active'">Active</button>
    <button data-ui="button" data-size="sm"
            :data-variant="filter === 'done' ? 'primary' : 'ghost'"
            @click="filter = 'done'">Done</button>
  </div>

  <!-- Task list -->
  <div data-ui="stack" data-gap="3">
    <template l-for="task in filtered">
      <div data-ui="card" data-size="sm">
        <div data-part="body">
          <div data-ui="stack" data-variant="horizontal" data-gap="3" data-align="center">
            <input data-ui="checkbox" type="checkbox"
                   :checked="task.done"
                   @change="update(task.id, { done: !task.done })">
            <span data-ui="text" l-text="task.title" data-flex="1"
                  :data-state="task.done ? 'done' : ''"></span>
            <span data-ui="badge" data-size="sm"
                  :data-variant="task.priority === 'high' ? 'destructive' : 'secondary'"
                  l-text="task.priority"></span>
            <button data-ui="button" data-variant="ghost" data-size="sm"
                    @click="remove(task.id)">&#x2715;</button>
          </div>
        </div>
      </div>
    </template>
  </div>

  <!-- Add form -->
  <form @submit.prevent="create({ title: newTitle, priority: newPriority, done: false }).then(() => newTitle = '')">
    <div data-ui="stack" data-variant="horizontal" data-gap="2">
      <input data-ui="input" l-model="newTitle" placeholder="New task..." required>
      <select data-ui="select" data-size="sm" l-model="newPriority">
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
      <button data-ui="button" data-variant="primary">Add</button>
    </div>
  </form>
</div>
```

### Usage: Polling for Live Data

```html
<div l-data="{ ...apiSource('/api/notifications', { pollInterval: 15000 }) }"
     l-init="load(); startPolling()">

  <span data-ui="badge" l-text="items.length"></span>

  <template l-for="notif in items">
    <div data-ui="card" data-size="sm">
      <div data-part="body">
        <span data-ui="text" l-text="notif.message"></span>
      </div>
    </div>
  </template>
</div>
```

### Multiple Sources on One Page

```html
<script>
  // Each source is independent — different endpoints, different state
  const menuSource = apiSource('/api/menus');
  const userSource = apiSource('/api/users', { optimistic: false });
</script>

<!-- Menus section -->
<div l-data="{ ...menuSource }" l-init="load()">
  <template l-for="menu in items">
    <span l-text="menu.name"></span>
  </template>
</div>

<!-- Users section (separate scope, separate data) -->
<div l-data="{ ...userSource }" l-init="load()">
  <template l-for="user in items">
    <span l-text="user.email"></span>
  </template>
</div>
```

### Architecture Diagram

```
  Browser                          Server
  -------                          ------
  l-data="{ ...apiSource() }"
       |
       v
  l-init="load()"
       |
       |---- GET /api/items -------->  DB query
       |<--- JSON [ ... ] ----------  Response
       |
       v
  items = [...] (reactive proxy)
       |
       v
  l-for="item in items"
       |
       v
  DOM updates automatically
       |
       |
  @click="create({...})"
       |
       |---- POST /api/items ------->  DB insert
       |<--- JSON { new item } -----  Response
       |
       v
  items.push(newItem) (reactive)
       |
       v
  l-for re-renders with new item
```

### Boundary Rules

- `apiSource()` is **application code** — lives in a `<script>` tag or a shared `.js` file
- Faqir **recipe controllers** (dropdown.js, table.js) never call `fetch` — the audit rule still applies
- The `l-data` / `l-init` / `l-for` directives are the bridge between data and DOM
- Error and loading states use standard Faqir components (spinner, card, empty-state)

---

## Approach C: `l-source` Directive (Framework-Level)

A new directive built into `faqir-core.js` that makes server-backed data a
first-class concept. Declarative — no JavaScript needed in markup.

### Directive Syntax

```
l-source:<name>="<endpoint>"
```

Modifiers:

```
l-source:<name>.method="GET|POST|PUT|PATCH|DELETE"  (default: GET)
l-source:<name>.poll="<ms>"                          (0 = off)
l-source:<name>.lazy                                 (don't load on init)
l-source:<name>.optimistic                           (update UI before confirm)
l-source:<name>.key="<field>"                        (id field, default: "id")
```

### What It Injects Into Scope

For `l-source:items="/api/things"`, the directive injects:

| Variable          | Type       | Description                                  |
|-------------------|------------|----------------------------------------------|
| `items`           | `Array`    | The fetched data                             |
| `$items`          | `Object`   | Source controller (see API below)             |
| `$items.loading`  | `boolean`  | True during initial fetch                    |
| `$items.error`    | `string`   | Error message or null                        |
| `$items.submitting` | `boolean` | True during a mutation (create/update/delete) |

### Source Controller API (`$items`)

```js
$items.load()                     // Re-fetch from endpoint
$items.create(payload)            // POST payload, append result to items
$items.update(id, payload)        // PATCH endpoint/id, merge result
$items.remove(id)                 // DELETE endpoint/id, splice from items
$items.startPolling(ms?)          // Start auto-refresh
$items.stopPolling()              // Stop auto-refresh
```

### Usage: Menu from Server

```html
<div l-data="{ newName: '' }"
     l-source:items="/api/menu-items">

  <!-- Loading -->
  <template l-if="$items.loading">
    <div data-ui="spinner" data-size="sm"></div>
  </template>

  <!-- Error -->
  <template l-if="$items.error">
    <div data-ui="stack" data-variant="horizontal" data-gap="2" data-align="center">
      <span data-ui="text" data-variant="destructive" l-text="$items.error"></span>
      <button data-ui="button" data-size="sm" @click="$items.load()">Retry</button>
    </div>
  </template>

  <!-- Menu -->
  <nav data-ui="menu">
    <template l-for="item in items">
      <a data-part="item" l-text="item.name" :href="item.url"></a>
    </template>
  </nav>

  <!-- Add -->
  <form @submit.prevent="$items.create({ name: newName }).then(() => newName = '')">
    <div data-ui="stack" data-variant="horizontal" data-gap="2">
      <input data-ui="input" data-size="sm" l-model="newName" placeholder="New item...">
      <button data-ui="button" data-variant="primary" data-size="sm">Add</button>
    </div>
  </form>
</div>
```

### Usage: Editable Table with Inline Updates

```html
<div l-data="{ editingId: null, editName: '' }"
     l-source:rows="/api/products"
     l-source:rows.key="product_id">

  <table data-ui="table">
    <thead data-part="thead">
      <tr data-part="tr">
        <th data-part="th">Name</th>
        <th data-part="th">Price</th>
        <th data-part="th">Actions</th>
      </tr>
    </thead>
    <tbody data-part="tbody">
      <template l-for="row in rows">
        <tr data-part="tr">
          <td data-part="td">
            <template l-if="editingId === row.product_id">
              <input data-ui="input" data-size="sm" l-model="editName">
            </template>
            <template l-if="editingId !== row.product_id">
              <span l-text="row.name"></span>
            </template>
          </td>
          <td data-part="td" l-text="'$' + row.price"></td>
          <td data-part="td">
            <template l-if="editingId === row.product_id">
              <button data-ui="button" data-size="sm" data-variant="primary"
                      @click="$rows.update(row.product_id, { name: editName }); editingId = null">
                Save
              </button>
            </template>
            <template l-if="editingId !== row.product_id">
              <div data-ui="stack" data-variant="horizontal" data-gap="1">
                <button data-ui="button" data-size="sm" data-variant="ghost"
                        @click="editingId = row.product_id; editName = row.name">
                  Edit
                </button>
                <button data-ui="button" data-size="sm" data-variant="ghost"
                        @click="$rows.remove(row.product_id)">
                  Delete
                </button>
              </div>
            </template>
          </td>
        </tr>
      </template>
    </tbody>
  </table>
</div>
```

### Usage: Multiple Sources with Dependencies

```html
<div l-data="{ selectedCategoryId: null }"
     l-source:categories="/api/categories">

  <!-- Category selector -->
  <select data-ui="select" l-model="selectedCategoryId">
    <option value="">All categories</option>
    <template l-for="cat in categories">
      <option :value="cat.id" l-text="cat.name"></option>
    </template>
  </select>

  <!-- Products filtered by category — nested scope with dependent source -->
  <template l-if="selectedCategoryId">
    <div l-source:products="'/api/categories/' + selectedCategoryId + '/products'">
      <template l-for="product in products">
        <div data-ui="card" data-size="sm">
          <div data-part="body" l-text="product.name"></div>
        </div>
      </template>
    </div>
  </template>
</div>
```

### Usage: Polling Dashboard

```html
<div l-source:stats="/api/dashboard/stats"
     l-source:stats.poll="10000"
     l-source:alerts="/api/dashboard/alerts"
     l-source:alerts.poll="5000">

  <!-- Stats cards -->
  <div data-ui="grid" data-cols="3" data-gap="4">
    <div data-ui="card" data-size="sm">
      <div data-part="body">
        <span data-ui="text" data-size="2xl" l-text="stats[0]?.activeUsers || 0"></span>
        <span data-ui="text" data-variant="muted">Active Users</span>
      </div>
    </div>
  </div>

  <!-- Alerts list (auto-refreshes every 5s) -->
  <div data-ui="stack" data-gap="2">
    <template l-for="alert in alerts">
      <div data-ui="card" data-size="sm"
           :data-variant="alert.severity === 'critical' ? 'destructive' : 'default'">
        <div data-part="body" l-text="alert.message"></div>
      </div>
    </template>
  </div>
</div>
```

### Usage: Lazy-Loaded Sections

```html
<div l-data="{ showComments: false }"
     l-source:comments="/api/posts/42/comments"
     l-source:comments.lazy>

  <button data-ui="button" data-variant="outline"
          @click="showComments = true; $comments.load()">
    Show Comments
  </button>

  <template l-if="showComments">
    <template l-if="$comments.loading">
      <div data-ui="spinner"></div>
    </template>
    <div data-ui="stack" data-gap="2">
      <template l-for="comment in comments">
        <div data-ui="card" data-size="sm">
          <div data-part="body">
            <span data-ui="text" data-weight="medium" l-text="comment.author"></span>
            <p data-ui="text" l-text="comment.body"></p>
          </div>
        </div>
      </template>
    </div>
  </template>
</div>
```

### Implementation Sketch for `faqir-core.js`

The directive would be registered as a custom directive in the core:

```js
// Inside faqir-core.js — directive registration

function handleSource(el, dir, scope) {
  // dir.arg    = "items" (the name after l-source:)
  // dir.expression = "/api/menu-items" (the endpoint)
  // dir.modifiers  = { poll: "5000", lazy: true, ... }

  const name = dir.arg;
  const endpoint = evaluateExpression(dir.expression, scope, el);
  const key = dir.modifiers.key || 'id';
  const pollMs = parseInt(dir.modifiers.poll) || 0;
  const lazy = 'lazy' in dir.modifiers;
  const optimistic = 'optimistic' in dir.modifiers;

  // Inject reactive array into scope
  scope[name] = [];

  // Inject controller as $name
  const controller = {
    loading: !lazy,
    error: null,
    submitting: false,

    async load() {
      controller.loading = true;
      controller.error = null;
      try {
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        scope[name] = await res.json();
      } catch (e) {
        controller.error = e.message;
      } finally {
        controller.loading = false;
      }
    },

    async create(payload) {
      controller.submitting = true;
      controller.error = null;
      let tempIdx = -1;

      if (optimistic) {
        scope[name].push({ ...payload, _pending: true });
        tempIdx = scope[name].length - 1;
      }

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const created = await res.json();
        if (optimistic) {
          scope[name][tempIdx] = created;
        } else {
          scope[name].push(created);
        }
        return created;
      } catch (e) {
        controller.error = e.message;
        if (optimistic && tempIdx >= 0) scope[name].splice(tempIdx, 1);
        return null;
      } finally {
        controller.submitting = false;
      }
    },

    async update(id, payload) {
      // ... similar to create with PATCH
    },

    async remove(id) {
      // ... similar with DELETE
    },

    startPolling(ms) {
      controller.stopPolling();
      const interval = ms || pollMs;
      if (interval > 0) {
        controller._timer = setInterval(() => controller.load(), interval);
      }
    },

    stopPolling() {
      if (controller._timer) {
        clearInterval(controller._timer);
        controller._timer = null;
      }
    },
  };

  // Make controller reactive
  scope['$' + name] = reactive(controller);

  // Auto-load unless lazy
  if (!lazy) {
    controller.load();
  }

  // Auto-poll if configured
  if (pollMs > 0 && !lazy) {
    controller.startPolling();
  }

  // Cleanup on scope teardown
  addCleanup(el, function () {
    controller.stopPolling();
  });
}

// Register it
customDirectives.set('source', handleSource);
```

### Architecture Diagram

```
  Markup                        faqir-core.js                     Server
  ------                        ------------                     ------

  l-source:items="/api/x"
        |
        v
  handleSource() parses
  directive, creates:
    - scope.items = []           (reactive array)
    - scope.$items = controller  (reactive object)
        |
        |--- auto load() -----> GET /api/x --------->  DB
        |<-- scope.items = data <--- JSON [...] -----  Response
        |
        v
  l-for="item in items"
  reacts to scope.items change
        |
        v
  DOM rendered
        |
        |
  @click="$items.create({...})"
        |
        v
  controller.create()
        |--- optimistic push -->  scope.items updated --> DOM updates
        |--- POST /api/x --------------------------------> DB
        |<-- server confirms <--- JSON { created } ------  Response
        |--- replace temp item -> scope.items patched --> DOM patches
```

### Comparison: B vs C

| Aspect                | B (Service Layer)              | C (l-source Directive)          |
|-----------------------|--------------------------------|---------------------------------|
| Framework changes     | None                           | New directive in faqir-core.js   |
| JS required           | `<script>` with apiSource()    | None (purely declarative)       |
| Learning curve        | Know JS + Faqir                 | Know l-source syntax only       |
| Flexibility           | Full — it's just functions     | Constrained to REST conventions |
| Multiple sources      | Manual setup per scope         | Multiple l-source attrs         |
| Polling               | Manual startPolling() call     | Declarative modifier            |
| Lazy loading          | Manual conditional load()      | `.lazy` modifier                |
| Optimistic updates    | Built into apiSource option    | `.optimistic` modifier          |
| Testability           | Unit test apiSource directly   | Need to mock fetch globally     |
| Non-REST APIs         | Easy — write custom methods    | Would need escape hatch         |
| Error handling        | Customizable per source        | Standardized via $name.error    |
| Audit rule impact     | None — app code, not controller| Need to exempt l-source from no-fetch |
| Reusability           | Import apiSource anywhere      | Copy l-source attr to any element |
| Migration path        | Start here, evolve to C        | Destination                     |

### Recommended Path

1. **Start with B** — validate the pattern in real pages, find the pain points
2. **Formalize into C** once the API surface stabilizes and the pattern proves reusable
3. B remains available as an escape hatch for non-REST or complex data flows
