import Link from "next/link";

export default function DashboardIndex() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Dashboard</h1>
      <p className="mb-4">Open the dashboard inbox or other tools.</p>
      <div className="space-x-2">
        <Link href="/dashboard/inbox" className="text-blue-600 hover:underline">Inbox</Link>
        <Link href="/dashboard/logs" className="text-blue-600 hover:underline">Logs</Link>
        <Link href="/dashboard/pricing-rules" className="text-blue-600 hover:underline">Pricing Rules</Link>
      </div>
    </div>
  );
}
