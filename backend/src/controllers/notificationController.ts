import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { sendPushNotification } from '../utils/fcm';

export const testFirebaseNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token, title, body } = req.body;

    if (!token) {
      res.status(400).json({ success: false, message: 'Device token is required' });
      return;
    }

    const result = await sendPushNotification(
      token,
      title || 'Test Notification',
      body || 'This is a test notification from Welcome Tech CRM',
      { type: 'test' }
    );

    res.status(200).json({
      success: true,
      message: 'Test notification sent successfully',
      data: result,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to send test notification',
    });
  }
};
