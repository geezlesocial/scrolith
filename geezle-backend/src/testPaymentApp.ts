import express from 'express';
import bodyParser from 'body-parser';
import paymentRoutes from './routes/payment.routes';

const app = express();

// Ensure create-intent route receives parsed JSON but leave the webhook route to use raw body
const jsonParser = bodyParser.json();
app.post('/api/payments/create-intent', jsonParser, (req, res, next) => next());

// Mount payment routes (router contains express.raw for `/webhook`)
app.use('/api/payments', paymentRoutes);

export default app;
