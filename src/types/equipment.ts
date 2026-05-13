/**
 * Equipment types: lab instruments and devices.
 * @phase R160-data-2
 */

export type EquipmentCategory =
  | 'reactor'
  | 'measurement'
  | 'furnace'
  | 'computer'
  | 'spectrometer'
  | 'microscope'
  | 'other';

export type EquipmentStatus = 'available' | 'in_use' | 'maintenance' | 'broken' | 'retired';

export interface Equipment {
  schemaVersion: 1;
  id: string;
  tenantId: string;

  equipmentCode: string;
  name: string;
  description?: string;

  category: EquipmentCategory;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;

  location?: string;
  status: EquipmentStatus;

  purchasedAt?: number;
  lastMaintenanceAt?: number;
  nextMaintenanceAt?: number;
  notes?: string;

  createdAt: number;
  updatedAt: number;
  createdBy: string;
}
