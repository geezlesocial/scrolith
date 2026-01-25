import express from 'express';
import bodyParser from 'body-parser';
import gcoinRoutes from './routes/gcoin.routes';
import communityRoutes from './routes/community';
import { authMiddleware } from './middleware/auth.middleware';

const app = express();
app.use(bodyParser.json());
// mount routes with auth middleware similar to server
app.use('/api/gcoin', gcoinRoutes);
app.use('/api/community', communityRoutes);

export default app;
