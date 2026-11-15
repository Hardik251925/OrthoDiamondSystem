import { z } from 'zod';

/** hospitalIds may arrive from multipart as a JSON array string, comma list, or repeated field. */
const idList = z.preprocess((v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s.startsWith('[')) {
      try {
        return JSON.parse(s);
      } catch {
        return s;
      }
    }
    return s ? s.split(',').map((x) => x.trim()) : [];
  }
  return v;
}, z.array(z.uuid('Invalid hospital id')).min(1, 'Select at least one hospital').max(10));

export const registerDoctorSchema = z.object({
  fullName: z.string().trim().min(3, 'Enter your full name').max(120),
  email: z.email('Enter a valid email').max(160),
  specialisation: z.string().trim().min(2).max(120),
  councilRegNo: z.string().trim().min(3, 'Enter your registration number').max(40),
  stateCouncil: z.string().trim().min(2, 'Select your state medical council').max(120),
  hospitalIds: idList,
});
export type RegisterDoctorInput = z.infer<typeof registerDoctorSchema>;

export const listDoctorsQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const idParam = z.object({ id: z.uuid() });
export const rejectSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(500) });
