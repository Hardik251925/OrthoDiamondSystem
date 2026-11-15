import type { Role } from '@prisma/client';

export interface AuthContext {
  userId: string;
  role: Role;
  /** May see prices and place orders (approved doctor, hospital buyer, admin staff). */
  isApproved: boolean;
  doctorId?: string;
  hospitalId?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      /** Phone proven by OTP, set only by requireRegistrationToken */
      registrationPhone?: string;
    }
  }
}

export {};
