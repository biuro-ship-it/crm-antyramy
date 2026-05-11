import { getAuth } from 'firebase/auth';

// --- INTERFEJSY I MODELE DANYCH ---

export interface Address {
  province: string;
  zipCode: string;
  city: string;
  street: string;
  number: string;
}

export interface Client {
  id: string;
  companyName: string;
  type: 'hurt' | 'sklep';
  contactPerson: string;
  email: string;
  phone: string;
  address: Address;
  lastContactAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientFormData {
  companyName: string;
  type: 'hurt' | 'sklep';
  contactPerson: string;
  email: string;
  phone: string;
  address: Address;
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
}

export interface FollowUpFormData {
  clientName: string;
  dueDate: string;
  reminderText: string;
}

// --- KONFIGURACJA API ---

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const CLIENTS_URL = `${API_URL}/api/clients`;

const getHeaders = async () => {
  const auth = getAuth();
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
};

// --- KLIENCI ---

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

// --- INTERAKCJE ---

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

// --- PRODUKTY ---

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

// --- FOLLOW-UPS ---

const FOLLOWUPS_URL = `${API_URL}/api/followups`;

export const getFollowUpSummary = async (): Promise<FollowUp[]> => {
  const headers = await getHeaders();
  const response = await fetch(`${FOLLOWUPS_URL}/summary`, { headers });
  if (!response.ok) throw new Error('Błąd pobierania zadań');
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
