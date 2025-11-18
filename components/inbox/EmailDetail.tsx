import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PricingBreakdownTable, {
	PricingQuote,
} from "@/components/PricingBreakdownTable";
import { splitAiQuoteResponse } from "@/lib/aiResponse";

export default function EmailDetail({ emailId }: { emailId: string }) {
	const [email, setEmail] = useState<any | null>(null);

	async function load() {
		const res = await fetch(`/api/emails/${emailId}`);
		const data = await res.json();
		setEmail(data.email || data);
	}

	useEffect(() => {
		load();
	}, [emailId]);

	if (!email) return <div className="p-4 text-gray-500">Loading...</div>;

	const quote = (email.cost || email.quoteJson || null) as PricingQuote | null;
	const normalized = email.normalized || email.normalizedJson || {};
	const serviceType =
		normalized?.serviceType || (quote as any)?.serviceType || "transloading";
	const drayageMeta =
		normalized?.drayage ||
		(quote as any)?.metadata ||
		email?.inferredJson?.drayage ||
		null;
	const { body: aiQuoteBody, pricingNote } = splitAiQuoteResponse(
		email.aiResponse
	);

	return (
		<div className="p-4 space-y-4">
			{/* Original Email */}
			<Card className="p-4">
				<h2 className="font-bold text-lg mb-2">Customer Email</h2>
				<div className="flex items-center gap-2 mb-2">
					<span className="text-sm text-gray-500">{email.senderEmail || email.senderName || "unknown"}</span>
					<Badge variant={serviceType === "drayage" ? "default" : "outline"}>
						{serviceType === "drayage" ? "Drayage" : "Transloading"}
					</Badge>
				</div>
				<p>{email.body}</p>
			</Card>

			{serviceType === "drayage" && drayageMeta && (
				<Card className="p-4">
					<h3 className="font-semibold text-sm uppercase text-blue-700 mb-3">Drayage Summary</h3>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
						<Info label="Container">{drayageMeta.containerSize || drayageMeta.container_size || "—"}</Info>
						<Info label="Weight (lbs)">{drayageMeta.containerWeightLbs || drayageMeta.container_weight_lbs || "—"}</Info>
						<Info label="Miles">{drayageMeta.miles || drayageMeta.miles_to_travel || "—"}</Info>
						<Info label="Ship-by">{drayageMeta.shipByDate || drayageMeta.ship_by_date || drayageMeta.requested_ship_by || "—"}</Info>
						<Info label="Origin">{drayageMeta.origin || drayageMeta.origin_city || "—"}</Info>
						<Info label="Destination">{drayageMeta.destination || drayageMeta.destination_city || "—"}</Info>
					</div>
				</Card>
			)}

			{/* AI Panels - native details/summary fallback */}
			<div className="w-full space-y-2">
				<details className="bg-white p-2 rounded">
					<summary className="font-medium cursor-pointer">Extracted Information</summary>
					<pre className="text-sm bg-gray-100 p-3 rounded mt-2">{JSON.stringify(email.extracted || email.extractedJson, null, 2)}</pre>
				</details>

				<details className="bg-white p-2 rounded">
					<summary className="font-medium cursor-pointer">Normalized Data</summary>
					<pre className="text-sm bg-gray-100 p-3 rounded mt-2">{JSON.stringify(email.normalized || email.normalizedJson, null, 2)}</pre>
				</details>

				<details className="bg-white p-2 rounded">
					<summary className="font-medium cursor-pointer">Pricing Breakdown</summary>
					<pre className="text-sm bg-gray-100 p-3 rounded mt-2">{JSON.stringify(email.cost || email.quoteJson, null, 2)}</pre>
				</details>
			</div>

			{/* Quote Email */}
			<Card className="p-4 space-y-4">
				<h2 className="font-bold text-lg">AI Quote Email</h2>
				<pre className="whitespace-pre-wrap text-sm">
					{aiQuoteBody || "(no draft)"}
				</pre>
				<PricingBreakdownTable quote={quote} note={pricingNote} />
			</Card>
		</div>
	);
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col">
			<span className="text-xs uppercase text-gray-500">{label}</span>
			<span className="text-sm text-gray-900">{children}</span>
		</div>
	);
}
