export type DriverStatus = 'free' | 'busy' | 'offline';
export type TripStatus =
  | 'pending'
  | 'assigned'
  | 'en_route'
  | 'on_board'
  | 'completed'
  | 'cancelled';
export type TripSource = 'admin' | 'client_app';

export interface Driver {
  id: string;
  name: string;
  taxiNumber: string;
  phone: string;
  status: DriverStatus;
  lat: number | null;
  lng: number | null;
  lastSeenAt: string | null;
}

export interface Trip {
  id: string;
  source: TripSource;
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffAddress: string;
  status: TripStatus;
  driverId: string | null;
  createdAt: string;
  assignedAt: string | null;
}
