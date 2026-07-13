export interface GoldenCase {
  name: string;
  schema: Record<string, unknown>;
  uiSchema?: Record<string, unknown>;
  opts?: Record<string, unknown>;
}

export const GOLDEN_CASES: GoldenCase[] = [
  {
    name: "string-input",
    schema: {
      type: "object",
      title: "Contact & profile",
      description: "Tell us <only> what you want to share.",
      properties: {
        displayName: {
          type: "string",
          title: "Display <name>",
          description: "Shown to other people & agents.",
          minLength: 2,
          maxLength: 40,
          pattern: "[A-Za-z ]+",
          default: "Ada & Co.",
        },
      },
      required: ["displayName"],
    },
    uiSchema: {
      displayName: { placeholder: 'Ada "Lovelace"' },
    },
    opts: { idPrefix: "contact", theme: "paper", density: "compact" },
  },
  {
    name: "string-textarea",
    schema: {
      type: "object",
      properties: {
        biography: {
          type: "string",
          title: "Biography",
          description: "A short public introduction.",
          default: "Mathematician\nProgrammer",
        },
      },
    },
    uiSchema: {
      biography: { "ui:widget": "textarea", "ui:rows": 6, "ui:placeholder": "About you" },
    },
  },
  {
    name: "string-enum-radio",
    schema: {
      type: "object",
      properties: {
        plan: {
          type: "string",
          title: "Plan",
          description: "Choose one billing plan.",
          enum: ["free", "team", "business", "enterprise"],
          default: "team",
        },
      },
      required: ["plan"],
    },
    uiSchema: {
      plan: { enumLabels: ["Free", "Team", "Business", "Enterprise"] },
    },
  },
  {
    name: "string-enum-select",
    schema: {
      type: "object",
      properties: {
        region: {
          type: "string",
          title: "Region",
          enum: ["africa", "americas", "asia", "europe", "oceania"],
        },
      },
      required: ["region"],
    },
    uiSchema: {
      region: { "ui:placeholder": "Choose a region" },
    },
  },
  {
    name: "number",
    schema: {
      type: "object",
      properties: {
        temperature: {
          type: "number",
          title: "Temperature",
          description: "Target temperature in degrees Celsius.",
          minimum: -20,
          maximum: 50,
          multipleOf: 0.5,
          default: 21.5,
        },
      },
    },
  },
  {
    name: "integer",
    schema: {
      type: "object",
      properties: {
        seats: {
          type: "integer",
          title: "Seats",
          minimum: 1,
          maximum: 20,
          default: 4,
        },
      },
      required: ["seats"],
    },
  },
  {
    name: "boolean-checkbox",
    schema: {
      type: "object",
      properties: {
        acceptTerms: {
          type: "boolean",
          title: "Accept terms",
          description: "Required to continue.",
          default: true,
        },
      },
      required: ["acceptTerms"],
    },
  },
  {
    name: "boolean-switch",
    schema: {
      type: "object",
      properties: {
        notifications: {
          type: "boolean",
          title: "Notifications",
          description: "Receive product updates.",
          default: false,
        },
      },
    },
    uiSchema: {
      notifications: { widget: "switch" },
    },
  },
  {
    name: "format-date",
    schema: {
      type: "object",
      properties: {
        startDate: {
          type: "string",
          format: "date",
          title: "Start date",
          description: "The first active day.",
          default: "2026-07-13",
        },
      },
      required: ["startDate"],
    },
    uiSchema: {
      startDate: { placeholder: "Pick a date" },
    },
  },
  {
    name: "format-email",
    schema: {
      type: "object",
      properties: {
        workEmail: {
          type: "string",
          format: "email",
          title: "Work email",
          description: "Use your company address.",
        },
      },
      required: ["workEmail"],
    },
    uiSchema: {
      workEmail: { placeholder: "ada@example.com" },
    },
  },
  {
    name: "format-uri",
    schema: {
      type: "object",
      properties: {
        website: {
          type: "string",
          format: "uri",
          title: "Website",
          default: "https://example.com/?a=1&b=2",
        },
      },
    },
  },
];
