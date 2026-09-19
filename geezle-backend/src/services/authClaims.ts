import { Role } from '@prisma/client';

export type AuthClaimInput = {
  id: string;
  email: string;
  role: Role;
};

/** Preserve the database role verbatim in the JWT; ANALYST is not remapped. */
export const buildAuthClaims = ({ id, email, role }: AuthClaimInput) => ({ id, email, role });
