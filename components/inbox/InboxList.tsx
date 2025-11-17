import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
type InboxEmail = {
	id: string;
	from: string;
	subject?: string | null;
	date?: string;
	status?: string;
};

interface Props {
	emails: InboxEmail[];
	selected: string | null;
	onSelect: (id: string) => void;
}

export default function InboxList({ emails, selected, onSelect }: Props) {
	return (
		<div className="p-3 space-y-2">
			{emails.map((email) => (
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
						<span className="text-xs text-gray-500">{email.date}</span>
					</div>
				</Card>
			))}
		</div>
	);
}