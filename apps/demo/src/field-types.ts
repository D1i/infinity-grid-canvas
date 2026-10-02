import { FULL_WIDTH } from "@infinity-grid-canvas/core";

export interface FieldType {
  type: string;
  label: string;
  /** Default width in cells. */
  w: number;
}

/** Palette of field kinds the designer offers. Widths are in grid cells (of 12). */
export const FIELD_TYPES: FieldType[] = [
  { type: "text", label: "Text", w: 4 },
  { type: "textarea", label: "Text area", w: FULL_WIDTH },
  { type: "number", label: "Number", w: 3 },
  { type: "money", label: "Money", w: 3 },
  { type: "date", label: "Date", w: 3 },
  { type: "select", label: "Dropdown", w: 4 },
  { type: "lookup", label: "Lookup", w: 4 },
  { type: "checkbox", label: "Checkbox", w: 3 },
  { type: "toggle", label: "Toggle", w: 3 },
  { type: "phone", label: "Phone", w: 4 },
  { type: "email", label: "Email", w: 4 },
  { type: "file", label: "File", w: 6 }
];

export const TITLES: Record<string, string[]> = {
  text: ["Full name", "Company", "Position", "City", "Street", "Postal code", "Tax ID", "Website", "Nickname", "Middle name"],
  textarea: ["Description", "Notes", "Comment", "Address", "Summary"],
  number: ["Quantity", "Priority", "Score", "Seats", "Employees", "Age"],
  money: ["Amount", "Budget", "Discount", "Annual revenue", "Price"],
  date: ["Close date", "Created", "Due date", "Birthday", "Start date", "Renewal"],
  select: ["Stage", "Source", "Industry", "Currency", "Region", "Status"],
  lookup: ["Owner", "Account", "Contact", "Parent deal", "Manager", "Campaign"],
  checkbox: ["Active", "VIP", "Do not call", "Verified", "Primary"],
  toggle: ["Email opt-in", "SMS opt-in", "Public", "Archived"],
  phone: ["Phone", "Mobile", "Work phone", "Fax"],
  email: ["Email", "Work email", "Billing email"],
  file: ["Attachment", "Contract", "Logo", "Photo"]
};

export function titleFor(type: string, i: number): string {
  const list = TITLES[type] ?? ["Field"];
  const base = list[i % list.length];
  const round = Math.floor(i / list.length);
  return round ? `${base} ${round + 1}` : base;
}

/** A small CRM-like contact form, shown on first load. */
export function sampleLayout() {
  let y = 0;
  const rows: { type: string; title: string; w: number; required?: boolean }[][] = [
    [
      { type: "text", title: "Full name", w: 6, required: true },
      { type: "email", title: "Email", w: 6, required: true }
    ],
    [
      { type: "phone", title: "Phone", w: 4 },
      { type: "lookup", title: "Account", w: 4 },
      { type: "lookup", title: "Owner", w: 4 }
    ],
    [
      { type: "select", title: "Stage", w: 3 },
      { type: "money", title: "Amount", w: 3 },
      { type: "date", title: "Close date", w: 3 },
      { type: "number", title: "Probability", w: 3 }
    ],
    [{ type: "textarea", title: "Description", w: FULL_WIDTH }],
    [
      { type: "select", title: "Source", w: 4 },
      { type: "select", title: "Industry", w: 4 },
      { type: "checkbox", title: "Active", w: 2 }
    ],
    [
      { type: "file", title: "Contract", w: 6 },
      { type: "date", title: "Renewal", w: 3 }
    ],
    [
      { type: "toggle", title: "Email opt-in", w: 3 },
      { type: "money", title: "Budget", w: 3 }
    ]
  ];
  const items = [];
  for (const row of rows) {
    let x = 0;
    for (const f of row) {
      items.push({ ...f, x, y });
      x += f.w === FULL_WIDTH ? 12 : f.w;
    }
    y++;
  }
  return items;
}
