export type VehicleId = 'monopattino' | 'scooter' | 'utilitaria' | 'berlina' | 'suv' | 'sportiva';

export interface VehicleDef {
  name: string;
  icon: string;
  desc: string;
  price: number;
  /** metri al secondo (a piedi: 5,2) */
  speed: number;
  /** assicurazione e bollo al mese */
  monthly: number;
  kind: 'kick' | 'scooter' | 'car';
  /** modello Kenney per le auto */
  model?: string;
  /** raggio di ingombro per le collisioni */
  radius: number;
}

export const WALK_SPEED = 5.2;

export const VEHICLES: Record<VehicleId, VehicleDef> = {
  monopattino: {
    name: 'Monopattino', icon: '🛴', desc: 'Leggero ed economico, niente costi fissi.',
    price: 350, speed: 7.8, monthly: 0, kind: 'kick', radius: 0.4,
  },
  scooter: {
    name: 'Scooter', icon: '🛵', desc: 'Agile nel traffico, costa poco da mantenere.',
    price: 1800, speed: 10.5, monthly: 25, kind: 'scooter', radius: 0.5,
  },
  utilitaria: {
    name: 'Utilitaria', icon: '🚗', desc: 'La prima macchina: comoda e veloce.',
    price: 7500, speed: 13, monthly: 70, kind: 'car', model: 'cars/hatchback-sports.glb', radius: 1,
  },
  berlina: {
    name: 'Berlina', icon: '🚙', desc: 'Più scattante e di classe.',
    price: 16000, speed: 14.5, monthly: 110, kind: 'car', model: 'cars/sedan.glb', radius: 1.05,
  },
  suv: {
    name: 'SUV di lusso', icon: '🚐', desc: 'Grande, potente, fa colpo.',
    price: 32000, speed: 15.5, monthly: 180, kind: 'car', model: 'cars/suv-luxury.glb', radius: 1.1,
  },
  sportiva: {
    name: 'Auto sportiva', icon: '🏎️', desc: 'La più veloce della città.',
    price: 75000, speed: 19, monthly: 320, kind: 'car', model: 'cars/race.glb', radius: 1.05,
  },
};

export const VEHICLE_IDS = Object.keys(VEHICLES) as VehicleId[];
