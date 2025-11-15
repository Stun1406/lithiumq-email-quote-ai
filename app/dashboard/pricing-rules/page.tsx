import { calculateTransloadingCost } from '@/business/pricing';

export default function PricingRulesPage() {
	const sample = {
		containerSize: '40' as const,
		palletized: true,
		pieces: 1200,
		pallets: 30,
		shrinkWrap: true,
		seal: false,
		billOfLading: false,
		afterHours: 'weekday' as const,
		heightInches: 48,
		storageDays: 5,
		workers: 2,
		extraHours: 1,
	};

	const cost = calculateTransloadingCost(sample as any);

	return (
		<div className="p-8">
			<h1 className="text-2xl font-bold mb-4">Pricing Rules</h1>
			<p className="mb-4">This page demonstrates the deterministic pricing engine.</p>

			<div className="mb-6">
				<h2 className="font-medium">Sample Input</h2>
				<pre className="bg-gray-50 p-3 rounded mt-2">{JSON.stringify(sample, null, 2)}</pre>
			</div>

			<div>
				<h2 className="font-medium">Sample Output (total + breakdown)</h2>
				<pre className="bg-gray-50 p-3 rounded mt-2">{JSON.stringify(cost, null, 2)}</pre>
			</div>
		</div>
	);
}
