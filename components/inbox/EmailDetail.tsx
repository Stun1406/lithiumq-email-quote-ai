import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
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
	const { body: aiQuoteBody, pricingNote } = splitAiQuoteResponse(
		email.aiResponse
	);

	return (
		<div className="p-4 space-y-4">
			{/* Original Email */}
			<Card className="p-4">
				<h2 className="font-bold text-lg mb-2">Customer Email</h2>
				<p>{email.body}</p>
			</Card>

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
