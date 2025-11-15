import { prisma } from "@/lib/prisma";
import { calculateTransloadingCost } from "@/business/pricing";

export const revalidate = 0;


export default async function AiInspectorPage({
	searchParams,
}: {
	searchParams?: { id?: string } | Promise<{ id?: string } | undefined>;
}) {
	// In newer Next.js versions `searchParams` may be a Promise and must be awaited
	const resolvedSearch = await searchParams;
	const id = resolvedSearch?.id;

	const email = id
		? await prisma.email.findUnique({ where: { id } })
		: await prisma.email.findFirst({ orderBy: { createdAt: "desc" } });

	if (!email) {
		return <div className="p-8">No emails found.</div>;
	}

	// Prefer normalizedJson, fall back to inferredJson or try to derive minimal input
	const storedNormalized = (email.normalizedJson ?? email.inferredJson) as any;

	// Enforce product rule: seal and billOfLading must be true for pricing/display.
	// Force them to true unconditionally so older records with explicit false are corrected for presentation and pricing.
	const normalized = {
		...storedNormalized,
		seal: true,
		billOfLading: true,
	};

	let computed: any = null;
	let computeError: string | null = null;
	try {
		if (normalized && typeof normalized === "object") {
			computed = calculateTransloadingCost(normalized as any);
		} else {
			computeError = "No normalized input available to compute pricing.";
		}
	} catch (err: any) {
		computeError = err?.message || String(err);
	}

	return (
		// page container: allow vertical scrolling so large JSON/pricing sections can be viewed
		<div className="p-8 overflow-y-auto h-full">
			<h1 className="text-2xl font-bold mb-4">AI Breakdown</h1>

			<div className="mb-6">
				<div className="font-medium">Email</div>
				<div className="mt-2 p-3 bg-white border rounded">
					<div className="text-sm font-medium">Subject</div>
					<div className="text-sm text-gray-700">{email.subject || "(no subject)"}</div>
					<div className="text-sm font-medium mt-2">From</div>
					<div className="text-sm text-gray-700">{email.senderEmail || email.senderName || "unknown"}</div>
				</div>
			</div>

			<div className="mb-6">
				<div className="font-medium">Extracted JSON</div>
				<pre className="bg-gray-50 p-3 rounded mt-2 text-sm">{JSON.stringify(email.extractedJson, null, 2)}</pre>
			</div>

			<div className="mb-6">
				<div className="font-medium">Normalized (internal input)</div>
				<pre className="bg-gray-50 p-3 rounded mt-2 text-sm">{JSON.stringify(normalized, null, 2)}</pre>
				{storedNormalized && JSON.stringify(storedNormalized) !== JSON.stringify(normalized) && (
					<div className="mt-2 text-sm text-gray-500">Stored normalized differed; seal and billOfLading have been enforced to true for pricing. Raw stored normalized:</div>
				)}
				{storedNormalized && JSON.stringify(storedNormalized) !== JSON.stringify(normalized) && (
					<pre className="bg-gray-100 p-2 rounded mt-2 text-xs text-gray-700">{JSON.stringify(storedNormalized, null, 2)}</pre>
				)}
			</div>

			<div className="mb-6">
				<div className="font-medium">Pricing / Computed Quote</div>
				{computeError ? (
					<div className="p-3 bg-yellow-50 border rounded mt-2 text-sm text-red-700">{computeError}</div>
				) : (
					<pre className="bg-gray-50 p-3 rounded mt-2 text-sm max-h-[40vh] overflow-auto">{JSON.stringify(computed, null, 2)}</pre>
				)}
			</div>

			<div>
				<div className="font-medium">AI drafted quote</div>
				<pre className="bg-gray-50 p-3 rounded mt-2 text-sm">{email.aiResponse || "(no draft)"}</pre>
			</div>
		</div>
	);
}
