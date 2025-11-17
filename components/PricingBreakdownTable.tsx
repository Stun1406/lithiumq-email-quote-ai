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
}> & Record<string, number | undefined>;

export interface PricingQuote {
  total?: number | null;
  breakdown?: Breakdown | null;
}

interface Props {
  quote?: PricingQuote | null;
  note?: string | null;
}

export default function PricingBreakdownTable({ quote, note }: Props) {
  const breakdown = quote?.breakdown;
  if (!breakdown || typeof breakdown !== "object") {
    return <p className="text-sm text-muted-foreground">No pricing available.</p>;
  }

  const rows: { key: keyof Breakdown; label: string }[] = [
    { key: "baseCost", label: "Base transloading" },
    { key: "accessories", label: "Accessories" },
    { key: "handling", label: "Handling" },
    { key: "afterHoursFee", label: "After-hours fee" },
    { key: "storage", label: "Storage" },
    { key: "labor", label: "Labor" },
  ];

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/2">Line item</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const value = breakdown[row.key];
            if (typeof value !== "number") return null;
            return (
              <TableRow key={row.key as string}>
                <TableCell>{row.label}</TableCell>
                <TableCell className="text-right">
                  {currency.format(value)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

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
