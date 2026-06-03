import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import * as productsService from '../services/products';

const router = Router();
router.use(authenticate);

const ProductSchema = z.object({
  name: z.string().min(1, 'Nazwa produktu jest wymagana'),
  code: z.string().optional().default(''),
  priceNetto: z.number().min(0, 'Cena nie może być ujemna'),
  imageUrl: z.string().optional().default(''),
});

router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const products = await productsService.getProducts();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Błąd pobierania produktów' });
  }
});

router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = ProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const product = await productsService.createProduct(parsed.data);
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: 'Błąd dodawania produktu' });
  }
});

router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const parsed = ProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const product = await productsService.updateProduct(id, parsed.data);
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Błąd aktualizacji produktu' });
  }
});

router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    await productsService.deleteProduct(id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Błąd usuwania produktu' });
  }
});

export default router;
