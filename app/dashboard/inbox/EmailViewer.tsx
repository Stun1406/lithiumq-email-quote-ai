import { Email } from "./data";

interface Props {
  email: Email | null;
}

export default function EmailViewer({ email }: Props) {
  if (!email) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Select an email to view.
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <h2 className="text-xl font-bold">{email.subject}</h2>
      <p className="text-sm text-gray-500 mt-1">{email.from}</p>
      <hr className="my-4" />
      <p className="text-gray-800 whitespace-pre-wrap">{email.body}</p>
    </div>
  );
}
