import { prisma } from "@/lib/prisma";
import {
	calculateTransloadingCost,
	calculateDrayagePricing,
} from "@/business/pricing";
import PricingBreakdownTable, {
	PricingQuote,
} from "@/components/PricingBreakdownTable";
import { splitAiQuoteResponse } from "@/lib/aiResponse";
import {
	getPricingJsonString,
	PRICING_TERMS_NAME,
} from "@/business/pricing-data";
import { Badge } from "@/components/ui/badge";

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

	const storedNormalized = (email.normalizedJson ?? email.inferredJson) as any;
	const serviceType =
		storedNormalized?.serviceType || (email.quoteJson as any)?.serviceType || "transloading";

	const normalized =
		serviceType === "drayage"
			? storedNormalized || {}
			: {
					...storedNormalized,
					seal: true,
					billOfLading: true,
			  };

	let computed: any = null;
	let computeError: string | null = null;
	try {
		if (normalized && typeof normalized === "object") {
			if (serviceType === "drayage" && normalized?.drayage) {
				computed = calculateDrayagePricing(normalized.drayage);
			} else {
				computed = calculateTransloadingCost(normalized as any);
			}
		} else {
			computeError = "No normalized input available to compute pricing.";
		}
	} catch (err: any) {
		computeError = err?.message || String(err);
	}

	const quote = (email.quoteJson ?? null) as PricingQuote | null;
	const drayageMeta =
		(serviceType === "drayage" && (quote as any)?.metadata) ||
		normalized?.drayage ||
		null;
	const { body: quoteBody, pricingNote } = splitAiQuoteResponse(email.aiResponse);
	const pricingTermsJson = getPricingJsonString();

	return (
		// page container: allow vertical scrolling so large JSON/pricing sections can be viewed
		<div className="p-8 overflow-y-auto h-full">
			<h1 className="text-2xl font-bold mb-4">AI Breakdown</h1>

			<div className="mb-6 space-y-3">
				<div className="font-medium flex items-center gap-2">
					Email <Badge variant={serviceType === "drayage" ? "default" : "outline"}>{serviceType}</Badge>
				</div>
				<div className="p-3 bg-white border rounded">
					<div className="text-sm font-medium">Subject</div>
					<div className="text-sm text-gray-700">{email.subject || "(no subject)"}</div>
					<div className="text-sm font-medium mt-2">From</div>
					<div className="text-sm text-gray-700">{email.senderEmail || email.senderName || "unknown"}</div>
				</div>
				{serviceType === "drayage" && drayageMeta && (
					<div className="p-3 bg-blue-50 border border-blue-100 rounded text-sm grid grid-cols-1 sm:grid-cols-2 gap-2">
						<Info label="Container">{drayageMeta.containerSize || drayageMeta.container_size || "—"}</Info>
						<Info label="Weight (lbs)">{drayageMeta.containerWeightLbs || drayageMeta.container_weight_lbs || "—"}</Info>
						<Info label="Miles">{drayageMeta.miles || drayageMeta.miles_to_travel || "—"}</Info>
						<Info label="Ship-by">{drayageMeta.shipByDate || drayageMeta.ship_by_date || drayageMeta.requested_ship_by || "—"}</Info>
						<Info label="Origin">{drayageMeta.origin || drayageMeta.origin_city || "—"}</Info>
						<Info label="Destination">{drayageMeta.destination || drayageMeta.destination_city || "—"}</Info>
					</div>
				)}
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
				<pre className="bg-gray-50 p-3 rounded mt-2 text-sm max-h-[40vh] overflow-auto">
					{quoteBody || "(no draft)"}
				</pre>

				<div className="mt-4">
					<div className="font-medium text-sm mb-2">Pricing summary</div>
					<PricingBreakdownTable quote={quote} note={pricingNote} />
					{serviceType !== "drayage" && (
						<div className="mt-4">
							<div className="font-medium text-sm mb-2">{PRICING_TERMS_NAME}</div>
							<pre className="bg-gray-50 p-3 rounded text-xs whitespace-pre-wrap max-h-[30vh] overflow-auto">
								{pricingTermsJson}
							</pre>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col text-blue-900">
			<span className="text-xs uppercase text-blue-700 font-semibold">{label}</span>
			<span>{children}</span>
		</div>
	);
}
