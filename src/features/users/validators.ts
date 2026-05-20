/**
 * User-management input schemas.
 *
 * Separate from `src/lib/validations/auth.ts`:
 *  - `validations/auth.ts` is the *self-service* schema (login + a generic
 *    create with password). Reused by the login form.
 *  - This file is the *admin-side* schema. Admins don't type passwords —
 *    the server generates a temporary one on create / reset and returns it
 *    once for out-of-band sharing. So no `password` field appears here.
 *
 * `branchValuesSchema` is shared so the admin can't sneak in arbitrary
 * sheet names or extreme strings.
 */
import { z } from 'zod';
import { ROLES } from '@/src/features/auth/constants';

// A single sheet-tab name. Constraints chosen to match how Google Sheets
// tab names look in this CRM (short-ish, no surrounding whitespace).
const branchNameSchema = z
  .string()
  .trim()
  .min(1, 'Branch name cannot be empty')
  .max(80, 'Branch name is too long');

const branchListSchema = z
  .array(branchNameSchema)
  .max(50, 'Too many branches')
  // Dedupe while preserving order.
  .transform((arr) => Array.from(new Set(arr)));

/** Admin → Create user. Password is generated server-side. */
export const adminCreateUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.email('Enter a valid email').trim().toLowerCase(),
  role: z.enum(ROLES),
  allowed_branches: branchListSchema.default([]),
});

/** Admin → Update user. Every field optional; at least one required. */
export const adminUpdateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    role: z.enum(ROLES).optional(),
    allowed_branches: branchListSchema.optional(),
    is_active: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.role !== undefined ||
      v.allowed_branches !== undefined ||
      v.is_active !== undefined,
    { message: 'No fields to update' },
  );

/** Admin → Reset password. Currently no body needed (server generates). */
export const resetPasswordSchema = z.object({}).strict();

export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
