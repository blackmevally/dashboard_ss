import { Router } from 'express';
import { discoverPatients } from './patientService.js';

export const patientRouter = Router();

patientRouter.post('/discover', async (req, res, next) => {
  try {
    const result = await discoverPatients({
      limit: req.body?.limit,
      offset: req.body?.offset
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});
