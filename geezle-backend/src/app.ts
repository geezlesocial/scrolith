import express from 'express';
import cors from 'cors';
import freelancerRoutes from './modules/freelancer/freelancer.routes';
import clientRoutes from './modules/client/client.routes';
import { errorHandler } from './middlewares/errorHandler';

export const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_, res) => res.json({ ok: true }));

app.use('/api/freelancer', freelancerRoutes);
app.use('/api/client', clientRoutes);

app.use(errorHandler);

export default app;
