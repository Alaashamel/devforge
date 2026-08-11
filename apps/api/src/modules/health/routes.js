import { Router } from 'express';
import * as controller from './controller.js';

export const healthRouter = Router();

healthRouter.get('/', controller.liveness);
healthRouter.get('/live', controller.liveness);
healthRouter.get('/ready', controller.readiness);
