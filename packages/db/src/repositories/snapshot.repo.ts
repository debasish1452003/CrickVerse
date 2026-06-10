import type { Prisma } from "@prisma/client";
import { prisma } from "../client";

export interface SaveSnapshotInput {
  pageType: string;
  url: string;
  paramsHash: string;
  payload: unknown;
  httpStatus?: number;
}

/** Store a raw __NEXT_DATA__ payload (a new versioned row each fetch). */
export async function saveSnapshot(input: SaveSnapshotInput): Promise<string> {
  const snap = await prisma.rawSnapshot.create({
    data: {
      pageType: input.pageType,
      url: input.url,
      paramsHash: input.paramsHash,
      payload: input.payload as Prisma.InputJsonValue,
      httpStatus: input.httpStatus ?? 200,
    },
  });
  return snap.id;
}

/** Return the most recent snapshot for (pageType, paramsHash) if within maxAgeMs. */
export async function findFreshSnapshot(
  pageType: string,
  paramsHash: string,
  maxAgeMs: number,
): Promise<{ id: string; payload: unknown; fetchedAt: Date } | null> {
  const snap = await prisma.rawSnapshot.findFirst({
    where: { pageType, paramsHash },
    orderBy: { fetchedAt: "desc" },
  });
  if (!snap) return null;
  if (Date.now() - snap.fetchedAt.getTime() > maxAgeMs) return null;
  return { id: snap.id, payload: snap.payload, fetchedAt: snap.fetchedAt };
}
