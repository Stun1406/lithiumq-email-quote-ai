import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const revalidate = 0;

export default async function LogsPage() {
	const logs = await prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 });

	return (
		<div className="p-8">
			<h1 className="text-2xl font-bold mb-4">Logs</h1>
			{logs.length === 0 ? (
				<div>No logs yet.</div>
			) : (
				<div className="space-y-2">
					{logs.map((l) => (
						<div key={l.id} className="p-3 border rounded bg-white">
							<div className="text-sm text-gray-600">{new Date(l.createdAt).toLocaleString()}</div>
							<div className="font-medium">{l.type}</div>
							<div className="text-sm text-gray-800 mt-1">{l.message}</div>
							<div className="mt-2 text-xs text-gray-500">Email: <Link href={`/dashboard/inbox`}>{l.emailId}</Link></div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
