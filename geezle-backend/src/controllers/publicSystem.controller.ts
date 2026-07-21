import { Request, Response } from 'express';
import { getSystemControls } from '../services/systemControls.service';

/** Public, unauthenticated system control snapshot for FE shells. */
export const getPublicSystemStatus = async (_req: Request, res: Response) => {
  try {
    const controls = await getSystemControls();
    return res.json({
      success: true,
      data: {
        maintenanceMode: controls.maintenanceMode,
        registrationsEnabled: controls.registrationsEnabled,
        kycEnforced: controls.kycEnforced,
        admin2FA: controls.admin2FA,
        maintenancePage: controls.maintenanceMode ? controls.maintenancePage : null
      }
    });
  } catch (e: any) {
    return res.json({
      success: true,
      data: {
        maintenanceMode: false,
        registrationsEnabled: true,
        kycEnforced: false,
        admin2FA: false,
        maintenancePage: null
      }
    });
  }
};
