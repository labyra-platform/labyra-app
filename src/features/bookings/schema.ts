import { z } from 'zod';
import { MAX_ADVANCE_MS, MAX_DURATION_MS, MIN_DURATION_MS } from './constants';

export const bookingFormSchema = z
  .object({
    equipmentId: z.string().min(1, 'Equipment is required'),
    equipmentName: z.string().optional(),
    startAt: z.coerce.number().int(),
    endAt: z.coerce.number().int(),
    purpose: z.string().min(1, 'Purpose is required').max(500),
    status: z.enum(['pending', 'approved', 'in_progress', 'completed', 'cancelled']),
    notes: z.string().max(2000).optional()
  })
  .refine((data) => data.endAt > data.startAt, {
    message: 'End time must be after start time',
    path: ['endAt']
  })
  .refine((data) => data.endAt - data.startAt >= MIN_DURATION_MS, {
    message: 'too_short',
    path: ['endAt']
  })
  .refine((data) => data.endAt - data.startAt <= MAX_DURATION_MS, {
    message: 'too_long',
    path: ['endAt']
  })
  .refine((data) => data.startAt <= Date.now() + MAX_ADVANCE_MS, {
    message: 'too_far_ahead',
    path: ['startAt']
  });

export type BookingFormValues = z.infer<typeof bookingFormSchema>;
