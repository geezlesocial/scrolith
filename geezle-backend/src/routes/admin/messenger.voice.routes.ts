import express from 'express';
import {
  getOrCreateMessengerVoiceConfig,
  updateMessengerVoiceConfig,
  isMessengerVoiceSchemaMissingError
} from '../../services/messengerVoice.service';

const router = express.Router();

router.get('/config', async (_req, res) => {
  try {
    const config = await getOrCreateMessengerVoiceConfig();
    return res.json({
      success: true,
      data: config,
      ...(config?._schemaMissing
        ? {
            message:
              'Messenger voice tables are not ready. Run the latest backend migration for voice calls/notes.'
          }
        : {})
    });
  } catch (error: any) {
    if (isMessengerVoiceSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Messenger voice tables are not ready. Run the latest backend migration for voice calls/notes.',
        code: 'MESSENGER_VOICE_SCHEMA_MISSING'
      });
    }
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load messenger voice config' });
  }
});

router.put('/config', async (req, res) => {
  try {
    const actorId = String((req as any)?.user?.id || '').trim() || null;
    const config = await updateMessengerVoiceConfig(req.body || {}, actorId);
    return res.json({ success: true, data: config, message: 'Messenger voice config saved.' });
  } catch (error: any) {
    if (isMessengerVoiceSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Messenger voice tables are not ready. Run the latest backend migration for voice calls/notes.',
        code: 'MESSENGER_VOICE_SCHEMA_MISSING'
      });
    }
    return res.status(500).json({ success: false, error: error?.message || 'Failed to save messenger voice config' });
  }
});

export default router;
