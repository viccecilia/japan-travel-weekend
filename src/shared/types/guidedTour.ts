export type GuidedTourBranch = 'default' | 'meal-first' | 'sightseeing-first';

export type GuidedTourTrigger = {
  enterRadiusMeters: number;
  notifyOnce: boolean;
};

export type GuidedTourNode = {
  id: string;
  area: 'kiyomizu' | 'arashiyama';
  name: string;
  shortInstruction: string;
  latitude: number;
  longitude: number;
  trigger: GuidedTourTrigger;
  estimatedMinutes: number;
  kind: 'dropoff' | 'walk' | 'landmark' | 'food' | 'admission' | 'pickup';
  branches: GuidedTourBranch[];
  verificationStatus: 'map-checked' | 'field-check-required';
  photos: {
    owned: { url: string; alt: string; capturedAt?: string } | null;
    google: { placeId?: string; textQuery: string } | null;
    fallbackUrl: string;
  };
};

export type GuidedTourPlan = {
  id: string;
  title: string;
  version: number;
  nodes: GuidedTourNode[];
};

export type GuidedTourPosition = { latitude: number; longitude: number; accuracy?: number };

export type GuidedTourProgress = {
  current: GuidedTourNode;
  next: GuidedTourNode | null;
  currentIndex: number;
  distanceMeters: number;
  reached: boolean;
};
