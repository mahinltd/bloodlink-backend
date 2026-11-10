import { z } from 'zod';
import { donorFormSchema } from '../users/users.validation.js';

const phoneRegex = /^01[3-9]\d{8}$/;

const email = z.email().max(120);
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const consents = z.object({
  termsAccepted: z.literal(true),
  contactAllowed: z.literal(true),
  noBloodSelling: z.literal(true),
});

export const registerSchema = z.object({
  body: z
    .object({
      role: z.enum(['donor', 'requester']),
      name: z.string().trim().min(2).max(80),
      phone: z.string().regex(phoneRegex, 'Invalid Bangladeshi phone number'),
      email,
      password,
      language: z.enum(['bn', 'en']).default('bn'),
      consents,
      donor: donorFormSchema.nullish(),
    })
    .superRefine((data, ctx) => {
      if (data.role === 'donor' && !data.donor) {
        ctx.addIssue({ code: 'custom', path: ['donor'], message: 'Donor details are required for donor registration' });
      }
    }),
});

export const verifyEmailSchema = z.object({
  body: z.object({ email, code: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits') }),
});

export const resendOtpSchema = z.object({
  body: z.object({
    email,
    purpose: z.enum(['verify_email', 'reset_password']).default('verify_email'),
  }),
});

export const loginSchema = z.object({
  body: z.object({ email, password: z.string().min(1) }),
});

export const refreshSchema = z.object({
  body: z.object({ refreshToken: z.string().optional() }).default({}),
});

export const forgotPasswordSchema = z.object({
  body: z.object({ email }),
});

export const verifyResetOtpSchema = z.object({
  body: z.object({ email, code: z.string().regex(/^\d{6}$/) }),
});

export const resetPasswordSchema = z.object({
  body: z.object({ resetToken: z.string().min(10), newPassword: password }),
});

export const changePasswordSchema = z.object({
  body: z.object({ oldPassword: z.string().min(1), newPassword: password }),
});