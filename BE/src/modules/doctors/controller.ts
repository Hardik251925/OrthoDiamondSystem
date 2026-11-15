import type { Request, Response } from 'express';
import { ok } from '../../lib/envelope';
import { badRequest } from '../../lib/errors';
import { parseOrThrow } from '../../lib/validate';
import { privateRelPath, removePrivateFile } from '../../lib/upload';
import { doctorService } from './service';
import { registerDoctorSchema } from './schema';

export const CERT_FOLDER = 'certificates';

export const doctorController = {
  async register(req: Request, res: Response) {
    const relPath = req.file ? privateRelPath(CERT_FOLDER, req.file.filename) : undefined;
    try {
      const input = parseOrThrow(registerDoctorSchema, req.body);
      if (!relPath) {
        throw badRequest('VALIDATION_ERROR', 'Certificate photo is required', [
          { field: 'certificate', message: 'Upload your registration certificate' },
        ]);
      }
      const result = await doctorService.register(req.registrationPhone!, input, relPath, req.headers['user-agent']);
      ok(res, result, undefined, 201);
    } catch (err) {
      removePrivateFile(relPath);
      throw err;
    }
  },
  async me(req: Request, res: Response) {
    ok(res, await doctorService.me(req.auth!.userId));
  },
  async list(req: Request, res: Response) {
    const { items, meta } = await doctorService.list(req.query as never);
    ok(res, items, meta);
  },
  async get(req: Request, res: Response) {
    ok(res, await doctorService.get(req.params.id!));
  },
  async approve(req: Request, res: Response) {
    ok(res, await doctorService.review(req.params.id!, req.auth!.userId, 'APPROVED', null, req.ip));
  },
  async reject(req: Request, res: Response) {
    ok(res, await doctorService.review(req.params.id!, req.auth!.userId, 'REJECTED', req.body.reason, req.ip));
  },
};
