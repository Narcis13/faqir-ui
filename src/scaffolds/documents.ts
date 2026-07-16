export type DocumentScaffoldName = "invoice" | "report";

export interface DocumentScaffoldDefinition {
  name: DocumentScaffoldName;
  title: string;
  description: string;
  defaultTheme: string;
  patterns: string[];
  components: string[];
}

export interface DocumentScaffoldOptions {
  title: string;
  stylesheets: string;
  coreScriptSrc?: string;
}

/** Components that make up Faqir's document/print layer (§7.4). */
export const DOCUMENT_LAYER_COMPONENTS = [
  "document",
  "key-value",
  "table",
  "qr-code",
  "signature",
  "page-break",
  "callout",
  "stat",
  "description-list",
  "image",
] as const;

export const DOCUMENT_SCAFFOLDS: Record<DocumentScaffoldName, DocumentScaffoldDefinition> = {
  invoice: {
    name: "invoice",
    title: "Invoice",
    description: "Print-ready invoice with line items, payment QR code, and signatures",
    defaultTheme: "document",
    patterns: ["document"],
    components: [
      "grid",
      "key-value",
      "page-break",
      "qr-code",
      "signature",
      "stack",
      "table",
      "text",
    ],
  },
  report: {
    name: "report",
    title: "Report",
    description: "Print-ready business report with callouts, metrics, details, and imagery",
    defaultTheme: "document",
    patterns: ["document"],
    components: [
      "callout",
      "description-list",
      "grid",
      "image",
      "page-break",
      "stack",
      "stat",
      "text",
    ],
  },
};

const PLACEHOLDER_GUIDE = `  <!--
    FAQIR scaffold placeholder convention
    -------------------------------------
    Replace the sample value immediately following every
    "FAQIR_REPLACE: path.to.value" comment. Keep data-ui/data-part attributes
    intact so the page remains auditable. Switch visual themes with
    "faqir theme set <name>"; this scaffold starts with the document theme.
  -->`;

function coreScript(src?: string): string {
  return src ? `\n  <script src="${src}" defer></script>` : "";
}

function documentShell(options: DocumentScaffoldOptions, body: string): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${options.title}</title>
${options.stylesheets}
</head>
<body>
${PLACEHOLDER_GUIDE}
  <main>
${body}  </main>${coreScript(options.coreScriptSrc)}
</body>
</html>`;
}

function generateInvoice(options: DocumentScaffoldOptions): string {
  return documentShell(options, `
  <article data-ui="document" data-variant="invoice" data-format="a4" aria-label="Invoice INV-2026-001">
    <header data-part="doc-header">
      <div>
        <!-- FAQIR_REPLACE: supplier.name -->
        <strong>Northstar Studio LLC</strong>
        <!-- FAQIR_REPLACE: supplier.registration -->
        <p data-ui="text" data-size="xs" data-variant="muted">Registration US-1234567</p>
      </div>
      <div>
        <h1>Invoice</h1>
        <!-- FAQIR_REPLACE: invoice.number -->
        <p data-ui="text" data-size="sm" data-weight="semibold">INV-2026-001</p>
      </div>
    </header>

    <div data-part="body">
      <section aria-labelledby="invoice-parties-heading">
        <h2 id="invoice-parties-heading">Billing details</h2>
        <div data-ui="grid" data-cols="2" data-gap="6">
          <div data-ui="stack" data-gap="2">
            <h3>From</h3>
            <dl data-ui="key-value" data-variant="vertical" data-size="sm">
              <dt data-part="label">Supplier</dt>
              <!-- FAQIR_REPLACE: supplier.legal_name -->
              <dd data-part="value">Northstar Studio LLC</dd>
              <dt data-part="label">Address</dt>
              <!-- FAQIR_REPLACE: supplier.address -->
              <dd data-part="value">100 Market Street, Portland, OR 97205</dd>
              <dt data-part="label">Tax ID</dt>
              <!-- FAQIR_REPLACE: supplier.tax_id -->
              <dd data-part="value">US-12-3456789</dd>
              <dt data-part="label">Email</dt>
              <!-- FAQIR_REPLACE: supplier.email -->
              <dd data-part="value">billing@example.com</dd>
            </dl>
          </div>

          <div data-ui="stack" data-gap="2">
            <h3>Bill to</h3>
            <dl data-ui="key-value" data-variant="vertical" data-size="sm">
              <dt data-part="label">Customer</dt>
              <!-- FAQIR_REPLACE: customer.legal_name -->
              <dd data-part="value">Atlas Retail Inc.</dd>
              <dt data-part="label">Address</dt>
              <!-- FAQIR_REPLACE: customer.address -->
              <dd data-part="value">240 King Avenue, Seattle, WA 98101</dd>
              <dt data-part="label">Invoice date</dt>
              <!-- FAQIR_REPLACE: invoice.issue_date -->
              <dd data-part="value">July 15, 2026</dd>
              <dt data-part="label">Due date</dt>
              <!-- FAQIR_REPLACE: invoice.due_date -->
              <dd data-part="value">August 14, 2026</dd>
            </dl>
          </div>
        </div>
      </section>

      <section aria-labelledby="invoice-items-heading">
        <h2 id="invoice-items-heading">Line items</h2>
        <div data-ui="table" data-size="sm" data-print="compact" data-locale="en-US" data-currency="USD">
          <table data-part="table">
            <thead data-part="thead">
              <tr data-part="tr">
                <th data-part="th" scope="col">Description</th>
                <th data-part="th" scope="col" data-align="right" data-format="number">Quantity</th>
                <th data-part="th" scope="col" data-align="right" data-format="currency">Unit price</th>
                <th data-part="th" scope="col" data-align="right" data-format="currency">Amount</th>
              </tr>
            </thead>
            <tbody data-part="tbody">
              <!-- FAQIR_REPLACE: invoice.items[] -->
              <tr data-part="tr">
                <td data-part="td">Product strategy workshop</td>
                <td data-part="td" data-align="right" data-format="number" data-value="2">2</td>
                <td data-part="td" data-align="right" data-format="currency" data-value="1200">$1,200.00</td>
                <td data-part="td" data-align="right" data-format="currency" data-value="2400">$2,400.00</td>
              </tr>
              <tr data-part="tr">
                <td data-part="td">Interface design sprint</td>
                <td data-part="td" data-align="right" data-format="number" data-value="5">5</td>
                <td data-part="td" data-align="right" data-format="currency" data-value="800">$800.00</td>
                <td data-part="td" data-align="right" data-format="currency" data-value="4000">$4,000.00</td>
              </tr>
            </tbody>
            <tfoot data-part="tfoot">
              <tr data-part="tr">
                <td data-part="td" colspan="3" data-align="right">Subtotal</td>
                <!-- FAQIR_REPLACE: invoice.subtotal -->
                <td data-part="td" data-align="right" data-format="currency" data-value="6400">$6,400.00</td>
              </tr>
              <tr data-part="tr">
                <td data-part="td" colspan="3" data-align="right">Tax (8.5%)</td>
                <!-- FAQIR_REPLACE: invoice.tax -->
                <td data-part="td" data-align="right" data-format="currency" data-value="544">$544.00</td>
              </tr>
              <tr data-part="tr">
                <td data-part="td" colspan="3" data-align="right">Total due</td>
                <!-- FAQIR_REPLACE: invoice.total -->
                <td data-part="td" data-align="right" data-format="currency" data-value="6944">$6,944.00</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div data-ui="page-break" data-variant="after" role="separator" aria-label="Page break before payment details">Page break</div>

      <section aria-labelledby="invoice-payment-heading">
        <h2 id="invoice-payment-heading">Payment details</h2>
        <div data-ui="grid" data-cols="2" data-gap="6">
          <div data-ui="stack" data-gap="4" data-align="center">
            <!-- FAQIR_REPLACE: payment.url -->
            <div data-ui="qr-code" data-value="https://pay.example.com/INV-2026-001" data-size="md" data-ecl="M" role="img" aria-label="QR code to pay invoice INV-2026-001">
              <span data-part="caption">Scan to pay securely</span>
            </div>
          </div>
          <dl data-ui="key-value" data-variant="vertical">
            <dt data-part="label">Bank</dt>
            <!-- FAQIR_REPLACE: payment.bank_name -->
            <dd data-part="value">Example Commercial Bank</dd>
            <dt data-part="label">Account name</dt>
            <!-- FAQIR_REPLACE: payment.account_name -->
            <dd data-part="value">Northstar Studio LLC</dd>
            <dt data-part="label">IBAN / account</dt>
            <!-- FAQIR_REPLACE: payment.account_number -->
            <dd data-part="value">US00 EXAM 0000 1234 5678</dd>
            <dt data-part="label">Reference</dt>
            <!-- FAQIR_REPLACE: invoice.number -->
            <dd data-part="value">INV-2026-001</dd>
          </dl>
        </div>
      </section>

      <section aria-labelledby="invoice-terms-heading">
        <h2 id="invoice-terms-heading">Terms and authorization</h2>
        <!-- FAQIR_REPLACE: invoice.payment_terms -->
        <p>Payment is due within 30 days. Please include the invoice number with your transfer.</p>
        <div data-ui="grid" data-cols="2" data-gap="8">
          <div data-ui="signature" data-size="md" role="img" aria-label="Authorized supplier signature">
            <div data-part="line"></div>
            <span data-part="label">Authorized by supplier</span>
          </div>
          <div data-ui="signature" data-size="md" role="img" aria-label="Customer approval signature">
            <div data-part="line"></div>
            <span data-part="label">Approved by customer</span>
          </div>
        </div>
      </section>
    </div>

    <footer data-part="doc-footer">
      <!-- FAQIR_REPLACE: supplier.footer_text -->
      <p>Northstar Studio LLC · billing@example.com · +1 555 0100</p>
    </footer>
  </article>
`);
}

const REPORT_IMAGE = "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221200%22 height=%22480%22 viewBox=%220 0 1200 480%22%3E%3Crect width=%221200%22 height=%22480%22 fill=%22%23e5e7eb%22/%3E%3Cpath d=%22M0 390L260 220L460 320L710 110L930 250L1200 80V480H0Z%22 fill=%22%239ca3af%22/%3E%3Ctext x=%22600%22 y=%22435%22 text-anchor=%22middle%22 font-family=%22Arial,sans-serif%22 font-size=%2232%22 fill=%22%23374151%22%3EREPLACE REPORT IMAGE%3C/text%3E%3C/svg%3E";

function generateReport(options: DocumentScaffoldOptions): string {
  return documentShell(options, `
  <article data-ui="document" data-variant="report" data-format="a4" aria-label="Quarterly performance report">
    <header data-part="doc-header">
      <!-- FAQIR_REPLACE: report.title -->
      <h1>Quarterly Performance Report</h1>
      <!-- FAQIR_REPLACE: report.period -->
      <p data-ui="text" data-size="xs" data-variant="muted">Q2 2026 · Prepared July 15, 2026</p>
    </header>

    <div data-part="body">
      <section aria-labelledby="report-summary-heading">
        <h2 id="report-summary-heading">Executive summary</h2>
        <!-- FAQIR_REPLACE: report.executive_summary -->
        <p>Revenue and customer retention exceeded plan this quarter. Delivery capacity remains the primary constraint for the next planning cycle.</p>
        <div data-ui="callout" data-variant="success" role="note" aria-label="Quarterly performance highlight">
          <div data-part="content">
            <strong data-part="title">Performance highlight</strong>
            <!-- FAQIR_REPLACE: report.highlight -->
            <p>Recurring revenue grew 18% year over year while gross margin improved by 3.2 points.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="report-metrics-heading">
        <h2 id="report-metrics-heading">Key metrics</h2>
        <div data-ui="grid" data-cols="3" data-gap="4">
          <div data-ui="stat" data-variant="card" data-trend="up" aria-label="Revenue: 2.4 million dollars, up 18 percent">
            <span data-part="label">Revenue</span>
            <!-- FAQIR_REPLACE: report.metrics.revenue -->
            <span data-part="value">$2.4M</span>
            <span data-part="change">↑ 18% year over year</span>
          </div>
          <div data-ui="stat" data-variant="card" data-trend="up" aria-label="Gross margin: 62.4 percent, up 3.2 points">
            <span data-part="label">Gross margin</span>
            <!-- FAQIR_REPLACE: report.metrics.gross_margin -->
            <span data-part="value">62.4%</span>
            <span data-part="change">↑ 3.2 points</span>
          </div>
          <div data-ui="stat" data-variant="card" data-trend="neutral" aria-label="Customer retention: 94 percent, on plan">
            <span data-part="label">Customer retention</span>
            <!-- FAQIR_REPLACE: report.metrics.retention -->
            <span data-part="value">94%</span>
            <span data-part="change">On plan</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="report-context-heading">
        <h2 id="report-context-heading">Report context</h2>
        <dl data-ui="description-list" data-variant="horizontal" data-size="sm">
          <dt data-part="term">Owner</dt>
          <!-- FAQIR_REPLACE: report.owner -->
          <dd data-part="details">Strategy and Operations</dd>
          <dt data-part="term">Reporting period</dt>
          <!-- FAQIR_REPLACE: report.period -->
          <dd data-part="details">April 1 - June 30, 2026</dd>
          <dt data-part="term">Data cutoff</dt>
          <!-- FAQIR_REPLACE: report.data_cutoff -->
          <dd data-part="details">July 10, 2026</dd>
          <dt data-part="term">Distribution</dt>
          <!-- FAQIR_REPLACE: report.audience -->
          <dd data-part="details">Board and executive leadership</dd>
        </dl>
      </section>

      <section aria-labelledby="report-chart-heading">
        <h2 id="report-chart-heading">Revenue trend</h2>
        <!-- FAQIR_REPLACE: report.image.src, report.image.alt, report.image.caption -->
        <figure data-ui="image" data-variant="responsive" data-size="full">
          <img data-part="img" src="${REPORT_IMAGE}" alt="Placeholder area for the quarterly revenue trend chart" loading="eager">
          <figcaption data-part="caption">Replace this placeholder with an exported chart or supporting image.</figcaption>
        </figure>
      </section>

      <div data-ui="page-break" data-variant="after" role="separator" aria-label="Page break before analysis">Page break</div>

      <section aria-labelledby="report-analysis-heading">
        <h2 id="report-analysis-heading">Analysis and outlook</h2>
        <div data-ui="stack" data-gap="4">
          <div>
            <h3>What changed</h3>
            <!-- FAQIR_REPLACE: report.analysis.changes -->
            <p>Enterprise expansion revenue accelerated after the onboarding redesign. New-logo volume remained stable, with a healthier mix of annual contracts.</p>
          </div>
          <div>
            <h3>Risks and mitigations</h3>
            <!-- FAQIR_REPLACE: report.analysis.risks -->
            <p>Implementation capacity is approaching its planned ceiling. Hiring and partner certification are underway, with weekly lead-time monitoring.</p>
          </div>
          <div>
            <h3>Next-quarter priorities</h3>
            <!-- FAQIR_REPLACE: report.analysis.priorities -->
            <p>Increase delivery capacity, improve expansion forecasting, and complete the self-service reporting rollout.</p>
          </div>
        </div>
      </section>

      <div data-ui="callout" data-variant="info" role="note" aria-label="Decision requested from report readers">
        <div data-part="content">
          <strong data-part="title">Decision requested</strong>
          <!-- FAQIR_REPLACE: report.decision_requested -->
          <p>Approve the proposed delivery-capacity investment before the August planning cycle.</p>
        </div>
      </div>
    </div>

    <footer data-part="doc-footer">
      <!-- FAQIR_REPLACE: report.confidentiality -->
      <p>Confidential · Internal distribution only</p>
    </footer>
  </article>
`);
}

export function generateDocumentScaffold(
  name: DocumentScaffoldName,
  options: DocumentScaffoldOptions,
): string {
  return name === "invoice" ? generateInvoice(options) : generateReport(options);
}
