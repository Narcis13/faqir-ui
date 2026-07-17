<script setup lang="ts">
// Demo page for @faqir-ui/vue (task 0.6-13 acceptance): eight generated
// components — five recipes (dialog, alert-dialog, tabs, accordion, toast)
// and three primitives (button, card, badge) — running against the real
// Faqir CSS bundle (@faqir-ui/core/dist/faqir.default.css, loaded by
// serve.ts). Run with: bun packages/vue/examples/demo/serve.ts
import { ref } from "vue";
import {
  LButton,
  LCard,
  LBadge,
  LDialog,
  LAlertDialog,
  LTabs,
  LAccordion,
  LToast,
} from "../../src/index";

const dialog = ref<InstanceType<typeof LDialog>>();
const alertDialog = ref<InstanceType<typeof LAlertDialog>>();
const toast = ref<InstanceType<typeof LToast>>();
const lastEvent = ref("none yet");

function onConfirm(detail: { variant: string }) {
  lastEvent.value = `@confirm (variant: ${detail.variant})`;
  toast.value!.add({ message: "Row deleted.", tone: "success" });
}

function onCancel(detail: { reason: string }) {
  lastEvent.value = `@cancel (reason: ${detail.reason})`;
}
</script>

<template>
  <main style="max-inline-size: 56rem; margin-inline: auto; padding: var(--space-8); display: grid; gap: var(--space-6)">
    <header>
      <h1>@faqir-ui/vue demo</h1>
      <p>
        Generated Vue 3 components over the real Faqir CSS bundle.
        Last controller event: <LBadge variant="outline">{{ lastEvent }}</LBadge>
      </p>
    </header>

    <LCard>
      <template #title>Dialog recipe</template>
      <template #body>
        <p>
          The in-template trigger is controller-wired; the outline button opens
          it through the exposed ref API (<code>dialog.open()</code>, §11.2).
        </p>
        <LDialog ref="dialog" id="demo-dialog" size="sm" title="Edit profile">
          <template #trigger>Open dialog</template>
          <template #body>
            <p>Server-renderable markup; the controller attached on mount.</p>
          </template>
          <template #footer>
            <LButton variant="outline" @click="dialog!.close()">Done</LButton>
          </template>
        </LDialog>
        <LButton variant="outline" @click="dialog!.open()">Open via ref</LButton>
      </template>
    </LCard>

    <LCard>
      <template #title>Alert-dialog recipe</template>
      <template #body>
        <p>Confirm/cancel re-emit as Vue events with payloads.</p>
        <LAlertDialog
          ref="alertDialog"
          id="demo-alert"
          title="Delete this row?"
          description="This action cannot be undone."
          confirmText="Delete"
          cancelText="Keep it"
          @confirm="onConfirm"
          @cancel="onCancel"
        >
          <template #trigger>Delete row…</template>
        </LAlertDialog>
      </template>
    </LCard>

    <LCard>
      <template #title>Tabs recipe</template>
      <template #body>
        <LTabs id="demo-tabs">
          <div data-part="list" role="tablist">
            <button data-part="trigger" role="tab" id="demo-tabs-tab-1" aria-controls="demo-tabs-panel-1" aria-selected="true">Overview</button>
            <button data-part="trigger" role="tab" id="demo-tabs-tab-2" aria-controls="demo-tabs-panel-2" aria-selected="false" tabindex="-1">Settings</button>
          </div>
          <div data-part="panel" role="tabpanel" id="demo-tabs-panel-1" aria-labelledby="demo-tabs-tab-1">
            Keyboard-navigable tabs, controller attached by the wrapper.
          </div>
          <div data-part="panel" role="tabpanel" id="demo-tabs-panel-2" aria-labelledby="demo-tabs-tab-2" hidden>
            Settings panel content.
          </div>
        </LTabs>
      </template>
    </LCard>

    <LCard>
      <template #title>Accordion recipe</template>
      <template #body>
        <LAccordion id="demo-accordion">
          <div data-part="item" data-state="collapsed">
            <button data-part="trigger" aria-expanded="false" aria-controls="demo-acc-1">
              <span>What is Faqir UI?</span>
              <span data-part="icon" aria-hidden="true">▾</span>
            </button>
            <div data-part="content" id="demo-acc-1" role="region" hidden>
              A zero-class, manifest-driven UI system — these Vue components are generated from those manifests.
            </div>
          </div>
          <div data-part="item" data-state="collapsed">
            <button data-part="trigger" aria-expanded="false" aria-controls="demo-acc-2">
              <span>Does it ship CSS in this package?</span>
              <span data-part="icon" aria-hidden="true">▾</span>
            </button>
            <div data-part="content" id="demo-acc-2" role="region" hidden>
              No — this page loads @faqir-ui/core/dist/faqir.default.css, the same bundle plain-HTML projects use.
            </div>
          </div>
        </LAccordion>
      </template>
    </LCard>

    <LToast ref="toast" id="demo-toast" position="bottom-right" />
  </main>
</template>
