import { getAuth } from 'firebase/auth';

// ─── INTERFEJSY I MODELE DANYCH ─────────────────────────────────────────────

export interface Address {
  province: string;
  zipCode: string;
  city: string;
  street: string;
  number: string;
}

export interface Order {
  id: string;
  amount: number;   // kwota netto w zł
  date: string;     // YYYY-MM-DD
  note?: string;    // opcjonalne uwagi do zamówienia
}

export interface Client {
  id: string;
  companyName: string;
  type: 'zakład' | 'sklep' | 'agencja' | 'inne';
  nip: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: Address;
  lastContactAt: string | null;
  createdAt: string;
  updatedAt: string;
  relationshipColor?: string;
  route?: string;
  salesEnabled?: boolean;
  orders?: Order[];
  // Dane z Białej listy VAT (Ministerstwo Finansów)
  vatStatus?: string;   // 'Czynny' | 'Zwolniony' | 'Niezarejestrowany'
  regon?: string;
  bankAccount?: string; // rachunek zgłoszony do białej listy
  // Migawka faktur pobranych z Fakturowni
  fakturowniaInvoices?: FakturowniaInvoice[];
  fakturowniaSyncedAt?: string;
  files?: ClientFile[];
}

export interface ClientFile {
  id: string;
  name: string;
  url: string;
  size?: string;
  uploadedAt: string;
}

export interface FakturowniaInvoice {
  id: number;
  number: string;
  issueDate: string;
  sellDate: string;
  paymentTo: string;
  priceNet: number;
  priceGross: number;
  currency: string;
  status: string;
  kind: string;
}

export interface FakturowniaClientInfo {
  id: number;
  name: string;
  taxNo: string;
  email: string;
  phone: string;
  person: string;
  street: string;
  city: string;
  postCode: string;
  bankAccount: string;
}

export interface FakturowniaLookup {
  client: FakturowniaClientInfo;
  invoices: FakturowniaInvoice[];
}

export interface ClientFormData {
  companyName: string;
  type: 'zakład' | 'sklep' | 'agencja' | 'inne';
  nip: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: Address;
  relationshipColor?: string;
  route?: string;
  salesEnabled?: boolean;
  orders?: Order[];
  vatStatus?: string;
  regon?: string;
  bankAccount?: string;
  fakturowniaInvoices?: FakturowniaInvoice[];
  fakturowniaSyncedAt?: string;
  files?: ClientFile[];
}

export interface NipData {
  nip: string;
  companyName: string;
  regon: string;
  vatStatus: string;          // Czynny / Zwolniony / Niezarejestrowany
  managingPerson: string;     // z pola representatives MF (może być puste)
  bankAccount: string;        // pierwszy rachunek z białej listy
  bankAccounts: string[];     // wszystkie zgłoszone rachunki
  address: string;            // surowy adres (working/residence)
  parsedAddress: Address;     // rozbity na ulicę/nr/kod/miasto (province puste)
}

export interface Interaction {
  id: string;
  contactDate: string;
  channel: 'telefon' | 'mail' | 'spotkanie' | 'inne';
  notes: string;
  tradeNotes?: string;
  products?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface InteractionFormData {
  contactDate: string;
  channel: 'telefon' | 'mail' | 'spotkanie' | 'inne';
  notes: string;
  tradeNotes: string;
  products: string[];
}

export interface Product {
  id: string;
  name: string;
  code: string;
  priceNetto: number;
  imageUrl: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ProductFormData {
  name: string;
  code: string;
  priceNetto: number;
  imageUrl: string;
}

export interface FollowUp {
  id: string;
  clientId: string;
  clientName: string;
  dueDate: string;
  reminderText: string;
  status: 'zaplanowane' | 'zrealizowane' | 'przesunięte';
  createdAt: string;
  completedAt?: string;
  googleEventId?: string;
  syncedAt?: string;
  syncError?: string;
}

export type KanbanColumn = 'todo' | 'doing' | 'done';
export type KanbanColor = 'default' | 'blue' | 'yellow' | 'red' | 'green';

export interface KanbanTask {
  id: string;
  title: string;
  description?: string;
  column: KanbanColumn;
  order: number;
  clientId?: string;
  clientName?: string;
  color?: KanbanColor;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface KanbanTaskFormData {
  title: string;
  description?: string;
  column: KanbanColumn;
  order?: number;
  clientId?: string;
  clientName?: string;
  color?: KanbanColor;
  dueDate?: string;
}

export interface FollowUpFormData {
  clientName: string;
  dueDate: string;
  reminderText: string;
}

export interface PromotionSendData {
  title: string;
  subject: string;
  content: string;
  productIds: string[];
  clientIds: string[];
}

export interface PromotionSendResult {
  sent: number;
  failed: Array<{ email: string; error: string }>;
  total: number;
}

export interface EmailTemplateVersion {
  body: string;
  subject: string;
  savedAt: string;
}

export interface EmailTemplate {
  id: string;
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

export type NoteColor = 'blue' | 'yellow' | 'red' | 'green' | 'default';

export interface NoteAttachment {
  name: string;
  url: string;
  type: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  attachments: NoteAttachment[];
  color: NoteColor;
  isImportant: boolean;
  isUrgent: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface NoteFormData {
  title: string;
  content: string;
  color: NoteColor;
  isImportant: boolean;
  isUrgent: boolean;
  attachments: NoteAttachment[];
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

export interface SupplierFile {
  id: string;
  name: string;
  url: string;
  size?: string;
  uploadedAt: string;
}

export interface SupplierMaterial {
  id: string;
  name: string;
  unit: 'szt' | 'm²' | 'ark.' | 'kpl';
  price: number; // cena netto za jednostkę
}

export interface Supplier {
  id: string;
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
  materials?: SupplierMaterial[];
  lastContactAt?: string | null;
  createdAt: string;
  updatedAt: string;

  address?: SupplierAddress;
  contactNames?: SupplierContactNames;
  agreements?: SupplierAgreements;
}

export type SupplierFormData = Omit<Supplier, 'id' | 'createdAt' | 'updatedAt' | 'lastContactAt'>;

// ─── KONFIGURACJA API ────────────────────────────────────────────────────────

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const CLIENTS_URL = `${API_URL}/api/clients`;
const SUPPLIERS_URL = `${API_URL}/api/suppliers`;

const getHeaders = async () => {
  const auth = getAuth();
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
};

// ─── KLIENCI ─────────────────────────────────────────────────────────────────

export const getClients = async (): Promise<Client[]> => {
  const headers = await getHeaders();
  const response = await fetch(CLIENTS_URL, { headers });
  if (!response.ok) throw new Error('Nie udało się pobrać listy klientów z serwera');
  return response.json();
};

export const createClient = async (data: ClientFormData): Promise<Client> => {
  const headers = await getHeaders();
  const response = await fetch(CLIENTS_URL, { method: 'POST', headers, body: JSON.stringify(data) });
  if (!response.ok) throw new Error('Nie udało się zapisać klienta');
  return response.json();
};

export const updateClient = async (id: string, data: ClientFormData): Promise<Client> => {
  const headers = await getHeaders();
  const response = await fetch(`${CLIENTS_URL}/${id}`, { method: 'PUT', headers, body: JSON.stringify(data) });
  if (!response.ok) throw new Error('Nie udało się zaktualizować danych klienta');
  return response.json();
};

export const deleteClient = async (id: string): Promise<void> => {
  const headers = await getHeaders();
  const response = await fetch(`${CLIENTS_URL}/${id}`, { method: 'DELETE', headers });
  if (!response.ok) throw new Error('Nie udało się usunąć klienta');
};

// Rozbija adres z Białej listy MF ("ULICA 74, 03-301 WARSZAWA") na pola.
// Województwa MF nie podaje — zostaje puste.
export const parseNipAddress = (raw: string): Address => {
  const empty: Address = { province: '', zipCode: '', city: '', street: '', number: '' };
  if (!raw) return empty;

  const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
  // Ostatni fragment zwykle zawiera kod pocztowy i miasto: "03-301 WARSZAWA"
  let zipCode = '', city = '';
  const cityPart = parts.length > 1 ? parts[parts.length - 1] : '';
  const zipMatch = cityPart.match(/(\d{2}-\d{3})\s+(.+)/);
  if (zipMatch) {
    zipCode = zipMatch[1];
    city = zipMatch[2].trim();
  } else if (parts.length === 1) {
    // Brak przecinka — spróbuj wyłuskać kod z całości
    const m = raw.match(/(\d{2}-\d{3})\s+([^\d,]+)/);
    if (m) { zipCode = m[1]; city = m[2].trim(); }
  }

  // Fragment z ulicą i numerem: wszystko przed częścią z kodem
  const streetPart = parts.length > 1 ? parts.slice(0, parts.length - 1).join(', ') : raw.replace(/\d{2}-\d{3}.*/, '').trim();
  let street = streetPart, number = '';
  // Numer to końcowy token typu "74", "12A", "12/3", "12A/3"
  const numMatch = streetPart.match(/^(.*?)[\s]+(\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)?)\s*$/);
  if (numMatch) {
    street = numMatch[1].trim();
    number = numMatch[2].trim();
  }
  return { province: '', zipCode, city, street, number };
};

export const getNipData = async (nip: string): Promise<NipData> => {
  const nipClean = nip.replace(/[-\s]/g, '');
  if (!/^\d{10}$/.test(nipClean)) throw new Error('NIP musi mieć 10 cyfr');
  const today = new Date().toISOString().split('T')[0];
  const response = await fetch(
    `https://wl-api.mf.gov.pl/api/search/nip/${nipClean}?date=${today}`,
    { headers: { 'Accept': 'application/json' } }
  );
  if (response.status === 404) throw new Error('Nie znaleziono firmy o podanym NIP w rejestrze VAT');
  if (!response.ok) throw new Error('Błąd połączenia z bazą Ministerstwa Finansów');
  const data = await response.json() as {
    result?: {
      subject?: {
        name?: string;
        regon?: string;
        statusVat?: string;
        workingAddress?: string;
        residenceAddress?: string;
        accountNumbers?: string[];
        representatives?: { companyName?: string; firstName?: string; lastName?: string }[];
      };
    };
  };
  const subject = data?.result?.subject;
  if (!subject) throw new Error('Nie znaleziono firmy o podanym NIP');

  // Pierwsza osoba reprezentująca (MF podaje pełne dane, gdy je ma — często puste u spółek)
  const rep = subject.representatives?.[0];
  const managingPerson = rep
    ? [rep.firstName, rep.lastName].filter(Boolean).join(' ').trim() || (rep.companyName || '')
    : '';

  const address = subject.workingAddress || subject.residenceAddress || '';
  const bankAccounts = subject.accountNumbers || [];

  return {
    nip: nipClean,
    companyName: subject.name || '',
    regon: subject.regon || '',
    vatStatus: subject.statusVat || '',
    managingPerson,
    bankAccount: bankAccounts[0] || '',
    bankAccounts,
    address,
    parsedAddress: parseNipAddress(address),
  };
};

// ─── FAKTUROWNIA (tylko odczyt, przez backend) ───────────────────────────────

/** Pobiera z Fakturowni dane klienta i jego faktury po NIP. */
export const fakturowniaLookup = async (nip: string): Promise<FakturowniaLookup> => {
  const nipClean = nip.replace(/[-\s]/g, '');
  if (!/^\d{10}$/.test(nipClean)) throw new Error('NIP musi mieć 10 cyfr');
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/api/fakturownia/lookup/${nipClean}`, { headers });
  if (response.status === 404) throw new Error('Nie znaleziono klienta o tym NIP w Fakturowni');
  if (response.status === 503) throw new Error('Integracja z Fakturownią nie jest skonfigurowana');
  if (!response.ok) throw new Error('Błąd komunikacji z Fakturownią');
  return response.json();
};

/** Otwiera PDF faktury w nowej karcie (token zostaje po stronie backendu). */
export const openFakturowniaPdf = async (invoiceId: number): Promise<void> => {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/api/fakturownia/invoice/${invoiceId}/pdf`, { headers });
  if (!response.ok) throw new Error('Nie udało się pobrać PDF faktury');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

export const getClientInteractions = async (clientId: string): Promise<Interaction[]> => {
  const headers = await getHeaders();
  const response = await fetch(`${CLIENTS_URL}/${clientId}/interactions`, { headers });
  if (!response.ok) throw new Error('Nie udało się pobrać historii kontaktów');
  return response.json();
};

export const createClientInteraction = async (clientId: string, data: InteractionFormData): Promise<Interaction> => {
  const headers = await getHeaders();
  const response = await fetch(`${CLIENTS_URL}/${clientId}/interactions`, { method: 'POST', headers, body: JSON.stringify(data) });
  if (!response.ok) throw new Error('Nie udało się zapisać kontaktu');
  return response.json();
};

export const updateClientInteraction = async (clientId: string, interactionId: string, data: InteractionFormData): Promise<Interaction> => {
  const headers = await getHeaders();
  const response = await fetch(`${CLIENTS_URL}/${clientId}/interactions/${interactionId}`, { method: 'PUT', headers, body: JSON.stringify(data) });
  if (!response.ok) throw new Error('Nie udało się zaktualizować notatki');
  return response.json();
};

export const uploadImage = async (file: File): Promise<string> => {
  const auth = getAuth();
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const formData = new FormData();
  formData.append('image', file);
  const response = await fetch(`${API_URL}/api/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  });
  if (!response.ok) throw new Error('Nie udało się wgrać pliku');
  const data = await response.json() as { imageUrl: string };
  return data.imageUrl;
};

// Upload dokumentu klienta (PDF / obraz / DOCX) — ten sam endpoint co uploadImage.
export const uploadFile = uploadImage;

export const getProductsList = async (): Promise<Product[]> => {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/api/products`, { headers });
  if (!response.ok) throw new Error('Nie udało się pobrać produktów');
  return response.json();
};

export const createProduct = async (data: ProductFormData): Promise<Product> => {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/api/products`, { method: 'POST', headers, body: JSON.stringify(data) });
  if (!response.ok) throw new Error('Nie udało się dodać produktu');
  return response.json();
};

export const updateProduct = async (id: string, data: ProductFormData): Promise<Product> => {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/api/products/${id}`, { method: 'PUT', headers, body: JSON.stringify(data) });
  if (!response.ok) throw new Error('Nie udało się zaktualizować produktu');
  return response.json();
};

export const deleteProduct = async (id: string): Promise<void> => {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/api/products/${id}`, { method: 'DELETE', headers });
  if (!response.ok) throw new Error('Nie udało się usunąć produktu');
};

const FOLLOWUPS_URL = `${API_URL}/api/followups`;

export const getFollowUpSummary = async (): Promise<FollowUp[]> => {
  const headers = await getHeaders();
  const response = await fetch(`${FOLLOWUPS_URL}/summary`, { headers });
  if (!response.ok) throw new Error('Błąd pobierania zadań');
  return response.json();
};

// Follow-upy z przedziału dat (widok kalendarza) — wszystkie statusy
export const getFollowUpsRange = async (from: string, to: string): Promise<FollowUp[]> => {
  const headers = await getHeaders();
  const response = await fetch(`${FOLLOWUPS_URL}/range?from=${from}&to=${to}`, { headers });
  if (!response.ok) throw new Error('Błąd pobierania zadań z kalendarza');
  return response.json();
};

export const createFollowUp = async (clientId: string, data: FollowUpFormData): Promise<FollowUp> => {
  const headers = await getHeaders();
  const response = await fetch(`${FOLLOWUPS_URL}/client/${clientId}`, { method: 'POST', headers, body: JSON.stringify(data) });
  if (!response.ok) throw new Error('Błąd dodawania przypomnienia');
  return response.json();
};

export const updateFollowUpStatus = async (id: string, status: 'zrealizowane' | 'przesunięte'): Promise<void> => {
  const headers = await getHeaders();
  const response = await fetch(`${FOLLOWUPS_URL}/${id}/status`, { method: 'PATCH', headers, body: JSON.stringify({ status }) });
  if (!response.ok) throw new Error('Błąd zmiany statusu zadania');
};

export const sendPromotion = async (data: PromotionSendData): Promise<PromotionSendResult> => {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/api/promotions/send`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Błąd wysyłki' })) as { error: string };
    throw new Error(err.error || 'Błąd wysyłki promocji');
  }
  return response.json();
};

export const previewPromotionPdf = async (
  title: string,
  content: string,
  productIds: string[]
): Promise<void> => {
  const auth = getAuth();
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  const response = await fetch(`${API_URL}/api/promotions/preview-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ title, content, productIds }),
  });
  if (!response.ok) throw new Error('Błąd generowania podglądu PDF');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

const TEMPLATES_URL = `${API_URL}/api/email-templates`;

export const getEmailTemplates = async (): Promise<EmailTemplate[]> => {
  const headers = await getHeaders();
  const response = await fetch(TEMPLATES_URL, { headers });
  if (!response.ok) throw new Error('Nie udało się pobrać szablonów maili');
  return response.json();
};

export const createEmailTemplate = async (data: EmailTemplateFormData): Promise<EmailTemplate> => {
  const headers = await getHeaders();
  const response = await fetch(TEMPLATES_URL, { method: 'POST', headers, body: JSON.stringify(data) });
  if (!response.ok) throw new Error('Nie udało się zapisać szablonu');
  return response.json();
};

export const updateEmailTemplate = async (id: string, data: EmailTemplateFormData): Promise<EmailTemplate> => {
  const headers = await getHeaders();
  const response = await fetch(`${TEMPLATES_URL}/${id}`, { method: 'PUT', headers, body: JSON.stringify(data) });
  if (!response.ok) throw new Error('Nie udało się zaktualizować szablonu');
  return response.json();
};

export const deleteEmailTemplate = async (id: string): Promise<void> => {
  const headers = await getHeaders();
  const response = await fetch(`${TEMPLATES_URL}/${id}`, { method: 'DELETE', headers });
  if (!response.ok) throw new Error('Nie udało się usunąć szablonu');
};

export const sendEmailFromTemplate = async (
  id: string,
  payload: { to: string; subject: string; body: string }
): Promise<void> => {
  const headers = await getHeaders();
  const response = await fetch(`${TEMPLATES_URL}/${id}/send`, { method: 'POST', headers, body: JSON.stringify(payload) });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Błąd wysyłki' })) as { error: string };
    throw new Error(err.error || 'Błąd wysyłki maila');
  }
};

const NOTES_URL = `${API_URL}/api/notes`;

export const getNotes = async (): Promise<Note[]> => {
  const headers = await getHeaders();
  const response = await fetch(NOTES_URL, { headers });
  if (!response.ok) throw new Error('Błąd pobierania notatek');
  return response.json();
};

export const createNote = async (data: NoteFormData): Promise<Note> => {
  const headers = await getHeaders();
  const response = await fetch(NOTES_URL, { method: 'POST', headers, body: JSON.stringify(data) });
  if (!response.ok) throw new Error('Nie udało się dodać notatki');
  return response.json();
};

export const updateNote = async (id: string, data: NoteFormData): Promise<Note> => {
  const headers = await getHeaders();
  const response = await fetch(`${NOTES_URL}/${id}`, { method: 'PUT', headers, body: JSON.stringify(data) });
  if (!response.ok) throw new Error('Nie udało się zaktualizować notatki');
  return response.json();
};

export const deleteNote = async (id: string): Promise<void> => {
  const headers = await getHeaders();
  const response = await fetch(`${NOTES_URL}/${id}`, { method: 'DELETE', headers });
  if (!response.ok) throw new Error('Nie udało się usunąć notatki');
};

// ─── DOSTAWCY (API) ─────────────────────────────────────────────────────────────────

export const getSuppliers = async (): Promise<Supplier[]> => {
  const headers = await getHeaders();
  const response = await fetch(SUPPLIERS_URL, { headers });
  if (!response.ok) throw new Error('Nie udało się pobrać dostawców');
  return response.json();
};

export const createSupplier = async (data: SupplierFormData): Promise<Supplier> => {
  const headers = await getHeaders();
  const response = await fetch(SUPPLIERS_URL, { method: 'POST', headers, body: JSON.stringify(data) });
  if (!response.ok) throw new Error('Nie udało się dodać dostawcy');
  return response.json();
};

export const updateSupplier = async (id: string, data: SupplierFormData): Promise<Supplier> => {
  const headers = await getHeaders();
  const response = await fetch(`${SUPPLIERS_URL}/${id}`, { method: 'PUT', headers, body: JSON.stringify(data) });
  if (!response.ok) throw new Error('Nie udało się zaktualizować dostawcy');
  return response.json();
};

export const deleteSupplier = async (id: string): Promise<void> => {
  const headers = await getHeaders();
  const response = await fetch(`${SUPPLIERS_URL}/${id}`, { method: 'DELETE', headers });
  if (!response.ok) throw new Error('Nie udało się usunąć dostawcy');
};

export const getSupplierInteractions = async (supplierId: string): Promise<Interaction[]> => {
  const headers = await getHeaders();
  const response = await fetch(`${SUPPLIERS_URL}/${supplierId}/interactions`, { headers });
  if (!response.ok) throw new Error('Nie udało się pobrać historii dostawcy');
  return response.json();
};

export const createSupplierInteraction = async (supplierId: string, data: InteractionFormData): Promise<Interaction> => {
  const headers = await getHeaders();
  const response = await fetch(`${SUPPLIERS_URL}/${supplierId}/interactions`, { method: 'POST', headers, body: JSON.stringify(data) });
  if (!response.ok) throw new Error('Nie udało się dodać notatki');
  return response.json();
};

export const updateSupplierInteraction = async (supplierId: string, interactionId: string, data: InteractionFormData): Promise<Interaction> => {
  const headers = await getHeaders();
  const response = await fetch(`${SUPPLIERS_URL}/${supplierId}/interactions/${interactionId}`, { method: 'PUT', headers, body: JSON.stringify(data) });
  if (!response.ok) throw new Error('Nie udało się zaktualizować notatki');
  return response.json();
};

// ─── ARCHIWUM ────────────────────────────────────────────────────────────────

// Pełna kopia: ZIP z dane.json (odtwarzalny zrzut Firestore) + folder zdjecia/.
// Pobranie przez fetch + token (endpoint jest pod auth) → blob.
export const downloadArchiveZip = async (): Promise<Blob> => {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/api/archive/zip`, { headers });
  if (!response.ok) throw new Error('Nie udało się pobrać archiwum z serwera');
  return response.blob();
};

// Zagnieżdżony, odtwarzalny zrzut Firestore (ten sam kształt co dane.json w ZIP-ie):
// kolekcja → { [docId]: { ...pola, _sub_interactions?: [...] } }. Klucz _meta to nie kolekcja.
export interface ArchiveDump {
  _meta?: { timestamp: string; version: number };
  clients: Record<string, any>;
  suppliers: Record<string, any>;
  products: Record<string, any>;
  followups: Record<string, any>;
  notes: Record<string, any>;
  emailTemplates: Record<string, any>;
}

// Pełne dane jako JSON (do przycisku „Pobierz JSON" i do budowy Excela na froncie).
export const getArchiveData = async (): Promise<ArchiveDump> => {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/api/archive`, { headers });
  if (!response.ok) throw new Error('Nie udało się pobrać danych archiwum z serwera');
  return response.json();
};

// ─── KANBAN (API) ─────────────────────────────────────────────────────────────

const KANBAN_URL = `${API_URL}/api/kanban`;

export const getKanbanTasks = async (): Promise<KanbanTask[]> => {
  const headers = await getHeaders();
  const response = await fetch(KANBAN_URL, { headers });
  if (!response.ok) throw new Error('Nie udało się pobrać zadań');
  return response.json();
};

export const createKanbanTask = async (data: KanbanTaskFormData): Promise<KanbanTask> => {
  const headers = await getHeaders();
  const response = await fetch(KANBAN_URL, { method: 'POST', headers, body: JSON.stringify(data) });
  if (!response.ok) throw new Error('Nie udało się dodać zadania');
  return response.json();
};

export const updateKanbanTask = async (id: string, data: KanbanTaskFormData): Promise<KanbanTask> => {
  const headers = await getHeaders();
  const response = await fetch(`${KANBAN_URL}/${id}`, { method: 'PUT', headers, body: JSON.stringify(data) });
  if (!response.ok) throw new Error('Nie udało się zaktualizować zadania');
  return response.json();
};

export const moveKanbanTask = async (id: string, column: KanbanColumn, order: number): Promise<void> => {
  const headers = await getHeaders();
  const response = await fetch(`${KANBAN_URL}/${id}/move`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ column, order }),
  });
  if (!response.ok) throw new Error('Nie udało się przenieść zadania');
};

export const deleteKanbanTask = async (id: string): Promise<void> => {
  const headers = await getHeaders();
  const response = await fetch(`${KANBAN_URL}/${id}`, { method: 'DELETE', headers });
  if (!response.ok) throw new Error('Nie udało się usunąć zadania');
};

// ─── SETTINGS ────────────────────────────────────────────────────────────────

export interface ColorLabels {
  clients: { default: string; lilac: string; cream: string; pink: string; mint: string };
  notes:   { default: string; blue: string; yellow: string; red: string; green: string };
}

const SETTINGS_URL = `${API_URL}/api/settings`;

export const getColorLabels = async (): Promise<ColorLabels> => {
  const headers = await getHeaders();
  const res = await fetch(`${SETTINGS_URL}/colorLabels`, { headers });
  if (!res.ok) throw new Error('Błąd pobierania etykiet');
  return res.json();
};

export const saveColorLabels = async (data: ColorLabels): Promise<ColorLabels> => {
  const headers = await getHeaders();
  const res = await fetch(`${SETTINGS_URL}/colorLabels`, {
    method: 'PUT', headers, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Błąd zapisu etykiet');
  return res.json();
};