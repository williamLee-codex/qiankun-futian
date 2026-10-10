import type { ServerLand } from "./farmV2SceneAdapter";
import type { PotGrade } from "./potRuntime";
export interface ScenePublicState {
  pots: { species: number; grade: PotGrade }[];
  decor: { catalogId: string; slot: number | null }[];
  activeFormation: string | null;
  activeFormationExpiresAt?: number | null;
  pets?: {
    owned: string[];
    activePetId: string | null;
    activeUntil: number | null;
  };
}
export interface FarmV2PublicCave extends ScenePublicState {
  ownerId: string;
  readOnly: true;
  lingyun: number;
  lands: ServerLand[];
}
