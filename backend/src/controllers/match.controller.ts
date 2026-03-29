import type { Request, Response } from "express";
export const getMatches = (req: Request, res: Response) => {
  res.json([{ team1: "MI", team2: "CSK", score: "150/3" }]);
};
