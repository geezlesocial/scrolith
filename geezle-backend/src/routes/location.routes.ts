import express from 'express';
import {
  resolveLocation,
  reverseLocationLookup,
  searchLocationOptions
} from '../controllers/location.controller';

const router = express.Router();

router.get('/search', searchLocationOptions);
router.get('/reverse', reverseLocationLookup);
router.post('/resolve', resolveLocation);

export default router;
