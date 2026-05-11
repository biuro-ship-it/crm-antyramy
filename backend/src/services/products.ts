import { db } from './firebase';
import { Product } from '../types';

const COLLECTION = 'products';

export const getProducts = async (): Promise<Product[]> => {
  const snapshot = await db.collection(COLLECTION).orderBy('createdAt', 'desc').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
};

export const createProduct = async (data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> => {
  const now = new Date().toISOString();
  const docRef = await db.collection(COLLECTION).add({
    ...data,
    createdAt: now,
    updatedAt: now,
  });
  const doc = await docRef.get();
  return { id: doc.id, ...doc.data() } as Product;
};

export const updateProduct = async (id: string, data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> => {
  const ref = db.collection(COLLECTION).doc(id);
  await ref.update({ ...data, updatedAt: new Date().toISOString() });
  const updated = await ref.get();
  return { id: updated.id, ...updated.data() } as Product;
};

export const deleteProduct = async (id: string): Promise<void> => {
  await db.collection(COLLECTION).doc(id).delete();
};
