// @faqir-ui/react demo — task 0.7-02 acceptance ("example page with ≥ 5
// components verified against the real CSS bundle"). Composes seven interactive
// recipes (dialog, alert-dialog, tabs, tooltip, pagination, slider, accordion)
// plus a handful of primitives, styled ONLY by the shipped Faqir CSS bundle
// (no className, no inline styling — the data-ui/data-part contract is the API).
// Note the React slot convention: a recipe's named parts are PROPS
// (`<LCard title={…} body={…} />`), while a bring-your-own recipe (tabs,
// accordion) takes `children` that replace the whole anatomy. Served by
// ./serve.ts; mounted under <StrictMode> so the create→destroy→create effect
// double-invoke is exercised against a real browser too.

import { useRef, useState } from "react";
import type { RecipeHandle } from "../../src/index";
import {
  LDialog,
  LAlertDialog,
  LTabs,
  LTooltip,
  LPagination,
  LSlider,
  LAccordion,
  LButton,
  LCard,
  LBadge,
  LStack,
  LText,
  LSeparator,
} from "../../src/index";

export default function App() {
  const dialog = useRef<RecipeHandle & { open: () => void }>(null);
  const alert = useRef<RecipeHandle & { open: () => void }>(null);
  const [page, setPage] = useState(1);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  return (
    <LStack gap="6">
      <LText size="xl" weight="bold">
        @faqir-ui/react — recipes against the real CSS bundle
      </LText>

      <LCard
        title={<LText weight="semibold">Dialog + Alert dialog (imperative handle)</LText>}
        body={
          <LStack gap="4">
            <LStack variant="horizontal" gap="2">
              <LButton variant="primary" onClick={() => dialog.current?.open()}>
                Open dialog
              </LButton>
              <LButton variant="destructive" onClick={() => alert.current?.open()}>
                Delete…
              </LButton>
              {confirmed && <LBadge variant="success">{confirmed}</LBadge>}
            </LStack>

            <LDialog
              ref={dialog}
              title="Edit profile"
              body={<LText>Everything here is styled by the Faqir bundle.</LText>}
              footer={
                <LButton variant="primary" data-part="close">
                  Done
                </LButton>
              }
            />

            <LAlertDialog
              ref={alert}
              title="Delete this item?"
              body={<LText>This action cannot be undone.</LText>}
              onConfirm={() => setConfirmed("Deleted")}
              onCancel={() => setConfirmed("Cancelled")}
            />
          </LStack>
        }
      />

      <LCard
        title={<LText weight="semibold">Tabs</LText>}
        body={
          <LTabs>
            <div data-part="list" role="tablist">
              <button data-part="trigger" role="tab" aria-selected="true">
                Overview
              </button>
              <button data-part="trigger" role="tab" aria-selected="false">
                Activity
              </button>
            </div>
            <div data-part="panel" role="tabpanel">
              The recipe wrapper renders this markup; its controller wires the roving tabs.
            </div>
            <div data-part="panel" role="tabpanel" hidden>
              Second panel content.
            </div>
          </LTabs>
        }
      />

      <LCard
        title={<LText weight="semibold">Tooltip · Slider · Pagination</LText>}
        body={
          <LStack gap="4">
            <LTooltip trigger="Hover me" content="I am a tooltip" />
            <LSlider value="40" />
            <LPagination onPageChange={(detail) => setPage((detail as { page: number }).page)} />
            <LText size="sm">Current page: {page}</LText>
          </LStack>
        }
      />

      <LCard
        title={<LText weight="semibold">Accordion</LText>}
        body={
          <LAccordion>
            <div data-part="item" data-state="collapsed">
              <button data-part="trigger">What is Faqir?</button>
              <div data-part="content" hidden>
                A zero-class, manifest-driven UI framework.
              </div>
            </div>
            <div data-part="item" data-state="collapsed">
              <button data-part="trigger">Why bindings?</button>
              <div data-part="content" hidden>
                So React apps get typed components over the exact same contract.
              </div>
            </div>
          </LAccordion>
        }
      />

      <LSeparator />
      <LText size="sm">
        Seven recipes + eight primitives, styled entirely by faqir.default.css.
      </LText>
    </LStack>
  );
}
