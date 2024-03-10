// Express server router
import { Router } from 'express';
import AppController from '../controllers/AppController';

const router = Router();

// assign route handlers in router
router.get('/status', AppController.getStatus);
router.get('/stats', AppController.getStats);

export default router;
