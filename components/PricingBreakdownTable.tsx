import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

type Breakdown = Partial<{
  baseCost: number;
  accessories: number;
  handling: number;
  afterHoursFee: number;
  storage: number;
  labor: number;
}> &
  Record<string, number | undefined>;

export interface PricingLineItem {
  label: string;
  amount: number;
  unit?: string | null;
  quantity?: number | null;
}

export interface PricingQuote {
  total?: number | null;
  breakdown?: Breakdown | null;
  lineItems?: PricingLineItem[] | null;
  invoiceItems?: PricingLineItem[] | null;
}

interface Props {
  quote?: PricingQuote | null;
  note?: string | null;
}

function hasBreakdown(breakdown?: Breakdown | null) {
  return !!breakdown && Object.values(breakdown).some((v) => typeof v === "number");
}

function deriveLineItems(breakdown?: Breakdown | null): PricingLineItem[] {
  if (!breakdown) return [];
  const map: Record<keyof Breakdown, string> = {
    baseCost: "Base transloading",
    accessories: "Accessories",
    handling: "Handling",
    afterHoursFee: "After-hours fee",
    storage: "Storage",
    labor: "Labor",
  };
  return Object.entries(map)
    .map(([key, label]) => {
      const value = breakdown[key as keyof Breakdown];
      if (typeof value !== "number") return null;
      return { label, amount: value };
    })
    .filter(Boolean) as PricingLineItem[];
}

function LineItemsTable({ items, title }: { items: PricingLineItem[]; title?: string }) {
  if (!items.length) return null;
  return (
    <div className="space-y-1">
      {title && <p className="text-xs font-semibold text-muted-foreground uppercase">{title}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/2">Line item</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, idx) => (
            <TableRow key={`${item.label}-${idx}`}>
              <TableCell>
                <div className="flex flex-col">
                  <span>{item.label}</span>
                  {item.quantity && item.unit && (
                    <span className="text-xs text-muted-foreground">
                      {item.quantity} {item.unit}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">
                {currency.format(item.amount || 0)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function PricingBreakdownTable({ quote, note }: Props) {
  const providedLineItems = quote?.lineItems || undefined;
  const lineItems =
    (providedLineItems && providedLineItems.length > 0
      ? providedLineItems
      : deriveLineItems(quote?.breakdown)) || [];

  if (!lineItems.length && !hasBreakdown(quote?.breakdown)) {
    return <p className="text-sm text-muted-foreground">No pricing available.</p>;
  }

  const invoiceItems = Array.isArray(quote?.invoiceItems)
    ? quote?.invoiceItems || []
    : [];

  return (
    <div className="space-y-3">
      <LineItemsTable items={lineItems} />

      {invoiceItems.length > 0 && (
        <LineItemsTable items={invoiceItems} title="Invoice-only charges" />
      )}

      {typeof quote?.total === "number" && (
        <div className="flex justify-end text-sm font-semibold">
          Total: <span className="ml-2">{currency.format(quote.total)}</span>
        </div>
      )}

      {note && (
        <p className="text-xs text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  );
}
