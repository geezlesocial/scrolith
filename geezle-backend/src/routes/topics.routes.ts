import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { followTopic, listMyTopicFollows, listTopics, unfollowTopic } from '../controllers/topics.controller';

const router = express.Router();

router.get('/', listTopics);
router.get('/follows/me', authMiddleware, listMyTopicFollows);
router.post('/:topicId/follow', authMiddleware, followTopic);
router.delete('/:topicId/follow', authMiddleware, unfollowTopic);

export default router;
