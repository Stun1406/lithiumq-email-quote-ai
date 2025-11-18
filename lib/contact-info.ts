export interface SenderContactDetails {
  name: string;
  company: string;
  phone: string;
  email: string;
}

interface DeriveParams {
  emailText: string;
  senderEmail?: string | null;
  extractedContact?: Record<string, any> | null;
}

const DUMMY_CONTACT: SenderContactDetails = {
  name: "Primary Logistics Contact",
  company: "LithiumQ Logistics",
  phone: "(555) 010-0000",
  email: "operations@lithiumq.com",
};

const PHONE_REGEX = /(\+?\d[\d\s().-]{6,}\d)/;

function titleCase(value: string | null | undefined) {
  if (!value) return null;
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function guessNameFromEmail(email?: string | null) {
  if (!email) return null;
  const local = email.split("@")[0];
  if (!local) return null;
  return titleCase(local);
}

function guessCompanyFromEmail(email?: string | null) {
  if (!email) return null;
  const domain = email.split("@")[1];
  if (!domain) return null;
  const company = domain.split(".")[0];
  return titleCase(company);
}

function findPhoneInText(text?: string | null) {
  if (!text) return null;
  const match = text.match(PHONE_REGEX);
  if (!match) return null;
  return match[0].replace(/\s+/g, " ").trim();
}

export function deriveSenderContactDetails({
  emailText,
  senderEmail,
  extractedContact,
}: DeriveParams): SenderContactDetails {
  const normalized = extractedContact || {};
  const aiContactName =
    normalized.contact_name ||
    normalized.contactName ||
    normalized.sender_name ||
    normalized.senderName;
  const aiCompany =
    normalized.company_name ||
    normalized.companyName ||
    normalized.business_name ||
    normalized.businessName;
  const aiPhone =
    normalized.phone ||
    normalized.phone_number ||
    normalized.phoneNumber ||
    normalized.contact_phone ||
    normalized.contactPhone;
  const aiEmail =
    normalized.email ||
    normalized.email_address ||
    normalized.emailAddress ||
    normalized.contact_email ||
    normalized.contactEmail;

  const derivedEmail = aiEmail || senderEmail || DUMMY_CONTACT.email;
  const derivedName =
    titleCase(aiContactName) ||
    guessNameFromEmail(derivedEmail) ||
    DUMMY_CONTACT.name;
  const derivedCompany =
    titleCase(aiCompany) || guessCompanyFromEmail(derivedEmail) || DUMMY_CONTACT.company;
  const derivedPhone = aiPhone || findPhoneInText(emailText) || DUMMY_CONTACT.phone;

  return {
    name: derivedName,
    company: derivedCompany,
    phone: derivedPhone,
    email: derivedEmail,
  };
}

export function formatSenderContactBlock(details: SenderContactDetails) {
  return [
    "---",
    "Sender details on file:",
    `Company: ${details.company}`,
    `Contact: ${details.name}`,
    `Phone: ${details.phone}`,
    `Email: ${details.email}`,
  ].join("\n");
}
