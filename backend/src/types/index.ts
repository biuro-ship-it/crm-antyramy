import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email: string;
  };
}

export interface Address {
  province: string;
  zipCode: string;
  city: string;
  street: string;
  number: string;
}

export interface Client {
  id?: string;
  companyName: string;
  type: 'zakład' | 'sklep' | 'agencja' | 'inne';
  contactPerson: string;
  email: string;
  phone: string;
  address: Address;
  lastContactAt: string | null;
  createdAt: string;
  updatedAt: string;
  relationshipColor?: string; // DODANE: Kolor relacji klienta
}

export interface Interaction {
  id?: string;
  contactDate: string;
  channel: 'telefon' | 'mail' | 'spotkanie' | 'inne';
  notes: string;
  tradeNotes?: string;
  products?: string[];
  createdBy: string;
  createdAt: string;
}

export interface Product {
  id?: string;
  name: string;
  code: string;
  priceNetto: number;
  imageUrl: string;
  createdAt: string;
  updatedAt?: string;
}

export interface FollowUp {
  id?: string;
  clientId: string;
  clientName: string;
  dueDate: string;
  reminderText: string;
  status: 'zaplanowane' | 'zrealizowane' | 'przesunięte';
  createdAt: string;
  completedAt?: string;
}

export interface EmailTemplateVersion {
  body: string;
  subject: string;
  savedAt: string;
}

export interface EmailTemplate {
  id?: string;
  name: string;
  category: string;
  subject: string;
  body: string;
  currentVersion: number;
  versions: Record<string, EmailTemplateVersion>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplateFormData {
  name: string;
  category: string;
  subject: string;
  body: string;
}

export interface SupplierFile {
  id: string;
  name: string;
  url: string;
  size?: string;
  uploadedAt: string;
}

export interface SupplierAddress {
  street: string;
  zipCode: string;
  city: string;
}

export interface SupplierContactNames {
  company: string;
  sales: string;
  owner: string;
}

export interface SupplierAgreements {
  discount: string;
  paymentTerm: string;
  deliveryFreq: string;
}

export interface Supplier {
  id?: string;
  companyName: string;
  category: string;
  email: string;
  phoneCompany: string;
  phoneSales: string;
  phoneOwner: string;
  whatsapp?: string;
  messenger?: string;
  notes: string;
  relationshipColor: string;
  files: SupplierFile[];
  lastContactAt?: string | null;
  createdAt: string;
  updatedAt: string;
  
  address?: SupplierAddress;
  contactNames?: SupplierContactNames;
  agreements?: SupplierAgreements;
}