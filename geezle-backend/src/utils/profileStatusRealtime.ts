import { Request } from 'express';
import prisma from './prismaClient';
import { serializeClientHiringStatus } from '../services/clientHiringStatus.service';
import { serializeProfessionalAvailability } from '../services/professionalAvailability.service';

/**
 * Broadcast only the public projection of profile hiring signals. The client
 * uses this event to refresh already-rendered avatars without exposing private
 * availability configuration or requiring a feed reload.
 */
export const emitPublicProfileStatus = async (
  req: Request,
  userId: string,
  eventName: 'profile:availability_updated' | 'profile:hiring_updated'
) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        professionalAvailability: true,
        clientHiringStatus: true
      }
    });
    if (!user) return;

    const availability = serializeProfessionalAvailability(user.professionalAvailability, { publicOnly: true });
    const hiring = serializeClientHiringStatus(user.clientHiringStatus, {
      publicOnly: true,
      targetRole: user.role
    });
    const payload = {
      userId,
      availability,
      hiring,
      availableForHire: Boolean(availability),
      weAreHiring: Boolean(hiring)
    };
    const app = req.app as any;
    const sockets = [app.get?.('communityIo'), app.get?.('io')].filter(Boolean);
    const emitted = new Set<any>();
    sockets.forEach((socket) => {
      if (emitted.has(socket) || typeof socket.emit !== 'function') return;
      emitted.add(socket);
      socket.emit(eventName, payload);
    });
  } catch (error) {
    // Realtime propagation must never make a successful profile update fail.
    console.warn('[profile-status] realtime broadcast failed', error);
  }
};
