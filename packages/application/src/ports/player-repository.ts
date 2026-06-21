import type {
  CareerPlayerRow,
  CanonicalPlayerRow,
} from "@crickverse/domain";
import type { CareerPlayerListItem } from "../dto/player-dto";

export type CareerPlayerListRow = Omit<CareerPlayerListItem, "photoUrl" | "role">;

export interface PlayerProfileRow {
  cricsheetId: string;
  photoUrl: string | null;
  role: string | null;
  dateOfBirth: string | null;
  birthPlace: string | null;
  battingStyle: string | null;
  bowlingStyle: string | null;
  photoFilePage: string | null;
  photoCredit: string | null;
  photoLicense: string | null;
}

export interface PlayerRepository {
  careerPlayer(cricsheetId: string): Promise<CareerPlayerRow | null>;
  canonicalPlayer(id: string): Promise<CanonicalPlayerRow | null>;
  profile(cricsheetId: string): Promise<PlayerProfileRow | null>;
  profilesByIds(ids: string[]): Promise<Map<string, { photoUrl: string | null; role: string | null }>>;
  photosByIds(ids: string[]): Promise<Map<string, string | null>>;
  topByMetric(by: "runs" | "wickets", limit: number): Promise<CareerPlayerListRow[]>;
  countCareer(q?: string): Promise<number>;
  pageCareer(opts: { q?: string; skip: number; take: number }): Promise<CareerPlayerListRow[]>;
}
