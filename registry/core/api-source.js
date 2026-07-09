/**
 * Faqir Data Source — Approach B: Service Layer
 *
 * A thin JS service that l-data blocks consume via spread syntax.
 * Application-level utility — NOT a Faqir recipe controller.
 *
 * Usage:
 *   <div l-data="{ ...apiSource('/api/tasks'), newTitle: '' }" l-init="load()">
 *     <template l-for="task in items">...</template>
 *   </div>
 *
 * @param {string} endpoint  - Base URL (e.g. "/api/tasks")
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
          this.items[tempIndex] = created;
        } else {
          this.items.push(created);
        }
        return created;
      } catch (e) {
        this.error = e.message;
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
