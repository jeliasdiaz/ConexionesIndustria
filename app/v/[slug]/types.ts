import type { FormValues } from './_steps/student-form';

export type PublicEvent = {
  slug: string;
  name: string;
  place: string;
  date: string;
  teacher: string;
  description: string;
  deadline: string;
  opensAt: string | null;
  state: 'open' | 'not_open' | 'closed';
  signatureMode: 'photo' | 'none';
  requireEmail: boolean;
  domains: string[];
  templates: { id: string; name: string; audience: string }[];
  turnstileSiteKey: string | null;
};

// Los PDF vencen (lib/shared/retention): `expires_at` es hasta cuándo se pueden
// descargar; después se borran, junto con los datos sensibles (`data_purged`).
export type Doc = { id: string; name: string; expires_at: string };
export type Submission = { id: string; status: string; created_at: string; corrected: boolean; documents: Doc[]; documents_expired: boolean; data_purged: boolean };
export type SubmissionStatus = { status: string; exhausted: boolean; documents: Doc[]; documents_expired: boolean; data_purged: boolean };
// `corrections_left`: cuántas veces más puede corregir (null sin envío); en 0, `can_correct` es false.
export type Session = { active: true; email: string | null; submission: Submission | null; can_correct: boolean; corrections_left: number | null; prefill: FormValues | null };
export type SessionResponse = Session | { active: false };
export type LegalText = { template_id: string; name: string; html: string; legal_sha256: string };
export type ApiError = { code: string; message: string; fields?: Record<string, string> };

export type Step = 'loading' | 'start' | 'email' | 'code' | 'home' | 'age' | 'minor' | 'form' | 'legal' | 'signature' | 'sending';
