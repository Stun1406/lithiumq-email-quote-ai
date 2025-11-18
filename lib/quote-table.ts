interface QuoteBreakdown {
  baseCost?: number;
  accessories?: number;
  handling?: number;
  afterHoursFee?: number;
  storage?: number;
  labor?: number;
  [key: string]: number | undefined;
}

interface QuoteLineItem {
  label: string;
  amount: number;
  unit?: string | null;
  quantity?: number | null;
}

interface QuoteCost {
  total?: number;
  breakdown?: QuoteBreakdown;
  lineItems?: QuoteLineItem[];
  invoiceItems?: QuoteLineItem[];
}

const DEFAULT_LABELS: Record<string, string> = {
  baseCost: "Base handling",
  accessories: "Accessories",
  handling: "Handling",
  afterHoursFee: "After-hours access",
  storage: "Storage",
  labor: "Labor",
};

function buildLineItemsFromBreakdown(breakdown?: QuoteBreakdown | null) {
  if (!breakdown) return [] as QuoteLineItem[];
  return Object.keys(DEFAULT_LABELS).map((key) => ({
    label: DEFAULT_LABELS[key] || key,
    amount: Number(breakdown[key] ?? 0),
  }));
}

function renderRows(items: QuoteLineItem[]) {
  return items.map((item) => {
    const detail =
      item.quantity && item.unit
        ? `${item.label} (${item.quantity} ${item.unit})`
        : item.label;
    return `| ${detail} | $${Number(item.amount ?? 0).toFixed(2)} |`;
  });
}

export function formatQuoteTable(cost?: QuoteCost | null) {
  if (!cost) return "";
  const lineItems =
    (Array.isArray(cost.lineItems) && cost.lineItems.length
      ? cost.lineItems
      : buildLineItemsFromBreakdown(cost.breakdown)) ?? [];
  if (!lineItems.length) return "";

  const total = Number(
    cost.total ??
      lineItems.reduce((sum, item) => sum + (item.amount || 0), 0)
  ).toFixed(2);

  const sections = [
    "Quotation Summary",
    "",
    "| Component | Amount |",
    "| --- | ---: |",
    ...renderRows(lineItems),
    `| **Total** | **$${total}** |`,
  ];

  if (Array.isArray(cost.invoiceItems) && cost.invoiceItems.length > 0) {
    sections.push(
      "",
      "Invoice-only Charges",
      "",
      "| Component | Amount |",
      "| --- | ---: |",
      ...renderRows(cost.invoiceItems)
    );
  }

  return sections.join("\n");
}
