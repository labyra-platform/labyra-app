/**
 * Bookings types: equipment reservations.
 * @phase R160-data-2
 */

export type BookingStatus = 'pending' | 'approved' | 'in_progress' | 'completed' | 'cancelled';

export interface Booking {
  schemaVersion: 1;
  id: string;
  tenantId: string;

  equipmentId: string;
  equipmentName?: string; // denormalized for display

  userId: string;
  userName?: string; // denormalized

  startAt: number; // epoch ms
  endAt: number;

  purpose: string;
  status: BookingStatus;
  notes?: string;

  createdAt: number;
  updatedAt: number;
}
