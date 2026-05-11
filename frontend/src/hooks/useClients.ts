import { useState, useCallback } from 'react';
import { Client, ClientFormData, getClients, createClient as apiCreateClient, updateClient as apiUpdateClient, deleteClient as apiDeleteClient } from '../services/api';

export const useClients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getClients();
      setClients(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wystąpił błąd podczas pobierania klientów z serwera.');
    } finally {
      setLoading(false);
    }
  }, []);

  const createClient = async (data: ClientFormData) => {
    const newClient = await apiCreateClient(data);
    setClients(prev => [...prev, newClient]);
    return newClient;
  };

  const updateClient = async (id: string, data: ClientFormData) => {
    const updated = await apiUpdateClient(id, data);
    setClients(prev => prev.map(c => c.id === id ? updated : c));
    return updated;
  };

  const removeClient = async (id: string) => {
    await apiDeleteClient(id);
    setClients(prev => prev.filter(c => c.id !== id));
  };

  return { clients, loading, error, fetchClients, createClient, updateClient, removeClient };
};
