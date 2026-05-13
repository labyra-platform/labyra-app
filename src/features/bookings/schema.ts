import { z } from 'zod';

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
  });

export type BookingFormValues = z.infer<typeof bookingFormSchema>;
