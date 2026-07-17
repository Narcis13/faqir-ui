import type { ObjectSchema, RenderFormOptions, UISchema } from "../src/index.js";

export interface GoldenCase {
  name: string;
  schema: ObjectSchema;
  uiSchema?: UISchema;
  opts?: RenderFormOptions;
}

/**
 * The realistic end-to-end schema used by both the golden/audit gate and the
 * happy-dom integration test: a patient-intake wizard exercising every §7.2
 * composite — scalars, formats, enum radio, nested object, enum arrays at both
 * cardinalities, a repeatable group, and per-step validation.
 */
export const PATIENT_INTAKE_SCHEMA: ObjectSchema = {
  type: "object",
  title: "Patient intake",
  description: "Pre-visit information for your first appointment.",
  properties: {
    fullName: { type: "string", title: "Full name", minLength: 2 },
    dateOfBirth: { type: "string", format: "date", title: "Date of birth" },
    sex: { type: "string", title: "Sex at birth", enum: ["female", "male", "intersex"] },
    address: {
      type: "object",
      title: "Home address",
      properties: {
        street: { type: "string", title: "Street" },
        city: { type: "string", title: "City" },
      },
      required: ["city"],
    },
    symptoms: {
      type: "array",
      title: "Current symptoms",
      items: { type: "string", enum: ["fever", "cough", "fatigue", "headache"] },
      uniqueItems: true,
    },
    conditions: {
      type: "array",
      title: "Diagnosed conditions",
      items: { type: "string", enum: ["asthma", "diabetes", "hypertension", "arthritis", "migraine", "none"] },
      uniqueItems: true,
    },
    medications: {
      type: "array",
      title: "Current medications",
      description: "Everything you take regularly.",
      maxItems: 10,
      items: {
        type: "object",
        properties: {
          name: { type: "string", title: "Medication" },
          dose: { type: "string", title: "Dose" },
        },
        required: ["name"],
      },
    },
    email: { type: "string", format: "email", title: "Contact email" },
    consent: { type: "boolean", title: "I consent to treatment" },
  },
  required: ["fullName", "email", "consent"],
};

export const PATIENT_INTAKE_UI: UISchema = {
  "ui:wizard": {
    label: "Intake steps",
    steps: [
      { title: "Patient", description: "Basic identity.", fields: ["fullName", "dateOfBirth", "sex", "address"] },
      { title: "History", fields: ["symptoms", "conditions", "medications"] },
      { title: "Consent", fields: ["email", "consent"] },
    ],
  },
  medications: { addLabel: "Add medication" },
};

/**
 * The canonical schema-rendered form page (task 0.6-14). This is the *shared
 * golden fixture* pinning the `form-page` registry pattern to the generator:
 * `registry/patterns/form-page/form-page.html` is exactly this schema's
 * `renderForm()` output (plus the pattern's `@ui:component/kind/composition`
 * discovery header). The drift guard in `form-page-golden.test.ts` re-renders
 * from here and fails if the pattern and the generator ever diverge.
 *
 * It deliberately spans the common scalar widgets a real form page needs —
 * required text with a hint + constraint, an email format, an enum radio group
 * (under the four-option threshold), a textarea, and a boolean checkbox — so the
 * pinned reference exercises the generator's whole scalar surface.
 */
export const FORM_PAGE_SCHEMA: ObjectSchema = {
  type: "object",
  title: "Create your account",
  description: "Join the workspace. You can change any of this later in settings.",
  properties: {
    fullName: { type: "string", title: "Full name", description: "Shown on your profile.", minLength: 2 },
    email: { type: "string", format: "email", title: "Work email" },
    role: { type: "string", title: "Role", enum: ["developer", "designer", "manager"], default: "developer" },
    bio: { type: "string", title: "About you" },
    newsletter: { type: "boolean", title: "Send me product updates" },
  },
  required: ["fullName", "email"],
};

export const FORM_PAGE_UI: UISchema = {
  bio: { "ui:widget": "textarea", "ui:rows": 4, "ui:placeholder": "A sentence or two." },
};

export const FORM_PAGE_OPTS: RenderFormOptions = { idPrefix: "form-page" };

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
  {
    name: "nested-object",
    schema: {
      type: "object",
      title: "Shipping",
      properties: {
        recipient: { type: "string", title: "Recipient" },
        address: {
          type: "object",
          title: "Address",
          description: "Where the parcel goes.",
          properties: {
            street: { type: "string", title: "Street" },
            city: { type: "string", title: "City" },
            geo: {
              type: "object",
              title: "Coordinates",
              properties: {
                lat: { type: "number", title: "Latitude", minimum: -90, maximum: 90 },
                lng: { type: "number", title: "Longitude", minimum: -180, maximum: 180 },
              },
            },
          },
          required: ["street", "city"],
        },
      },
      required: ["recipient"],
    },
  },
  {
    name: "array-enum-checkbox-group",
    schema: {
      type: "object",
      properties: {
        channels: {
          type: "array",
          title: "Notification channels",
          description: "Pick any that apply.",
          items: { type: "string", enum: ["email", "sms", "push", "post"] },
          uniqueItems: true,
          default: ["email", "push"],
        },
      },
      required: ["channels"],
    },
    uiSchema: {
      channels: { enumLabels: ["Email", "SMS", "Push", "Postal mail"] },
    },
  },
  {
    name: "array-enum-multi-select",
    schema: {
      type: "object",
      properties: {
        regions: {
          type: "array",
          title: "Regions served",
          items: { type: "string", enum: ["africa", "americas", "asia", "europe", "middle-east", "oceania"] },
          uniqueItems: true,
          default: ["europe"],
        },
      },
    },
  },
  {
    name: "array-of-objects",
    schema: {
      type: "object",
      properties: {
        contacts: {
          type: "array",
          title: "Emergency contacts",
          description: "People we may call.",
          minItems: 1,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              name: { type: "string", title: "Name" },
              phone: { type: "string", title: "Phone" },
              relation: {
                type: "string",
                title: "Relation",
                enum: ["parent", "partner", "sibling", "friend", "other"],
              },
            },
            required: ["name", "phone"],
          },
        },
      },
    },
    uiSchema: {
      contacts: { addLabel: "Add contact", removeLabel: "Remove contact" },
    },
  },
  {
    name: "layout-groups",
    schema: {
      type: "object",
      title: "Account",
      properties: {
        fullName: { type: "string", title: "Full name" },
        email: { type: "string", format: "email", title: "Email" },
        newsletter: { type: "boolean", title: "Newsletter" },
      },
      required: ["fullName", "email"],
    },
    uiSchema: {
      "ui:groups": [
        { title: "Identity", description: "Who you are.", fields: ["fullName", "email"] },
        { title: "Preferences", fields: ["newsletter"] },
      ],
    },
  },
  {
    name: "wizard",
    schema: {
      type: "object",
      title: "Signup",
      properties: {
        fullName: { type: "string", title: "Full name" },
        email: { type: "string", format: "email", title: "Email" },
        plan: { type: "string", title: "Plan", enum: ["free", "team", "business"] },
      },
      required: ["fullName", "email"],
    },
    uiSchema: {
      "ui:wizard": {
        label: "Signup steps",
        steps: [
          { title: "Profile", description: "Tell us who you are.", fields: ["fullName", "email"] },
          { title: "Plan", fields: ["plan"] },
        ],
      },
    },
  },
  {
    name: "patient-intake",
    schema: PATIENT_INTAKE_SCHEMA,
    uiSchema: PATIENT_INTAKE_UI,
    opts: { idPrefix: "intake" },
  },
];
