export enum AppMode {
  TREE = 'TREE',       // Fist: Gather into a tree
  SCATTER = 'SCATTER', // Open Palm: Explode/float
  INSPECT = 'INSPECT'  // Pinch/Grab: Look at a photo
}

export type ParticleType = 'SPHERE' | 'CUBE' | 'PHOTO';

export interface ParticleData {
  id: number;
  type: ParticleType;
  color: string;
  photoUrl?: string;
  initialPos: [number, number, number]; // Random scatter pos
  treePos: [number, number, number];    // Organized tree pos
  scale: number;
  rotationSpeed: [number, number, number];
}

export interface HandGestureState {
  isHandDetected: boolean;
  gesture: 'FIST' | 'OPEN' | 'PINCH' | 'NONE';
  handPosition: { x: number; y: number }; // Normalized 0-1
}
