export interface Email {
  id: string;
  from: string;
  subject: string;
  body: string;
  date: string;
}

export const inboxData: Email[] = [
  {
    id: "1",
    from: "customer@example.com",
    subject: "Request for Quote: 40 Pallet Units",
    body: "Hi, we need 40 palletized units on 40x48 pallets, fragile, urgent.",
    date: "2025-11-14 09:32 AM",
  },
  {
    id: "2",
    from: "shipments@logiusa.com",
    subject: "Follow-up on Last Shipment",
    body: "Hello team, can you confirm storage rates for last week’s cargo?",
    date: "2025-11-13 02:18 PM",
  },
];
