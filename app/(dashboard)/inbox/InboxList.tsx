import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Email } from "./data";

interface Props {
	emails: Email[];
	selected: string | null;
	onSelect: (id: string) => void;
}

export default function InboxList({ emails, selected, onSelect }: Props) {
	return (
		<div className="p-3 space-y-2">
			{emails.map((email: Email) => (
				<Card
					key={email.id}
					onClick={() => onSelect(email.id)}
					className={`p-3 cursor-pointer hover:bg-gray-100 transition border ${
						selected === email.id ? "bg-gray-100" : ""
					}`}
				>
					<div className="font-semibold">{email.from}</div>
					<div className="text-sm text-gray-600">{email.subject}</div>
					<div className="flex justify-between mt-1">
						<Badge>{(email as any).status}</Badge>
						<span className="text-xs text-gray-500">
							{new Date((email as any).createdAt || email.date).toLocaleDateString()}
						</span>
					</div>
				</Card>
			))}
		</div>
	);
}
