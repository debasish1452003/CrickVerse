import { Router } from "express";
import {
  getMatches,
  updateScrapedMatches,
} from "../controllers/match.controller.js";
import { startScraper } from "../jobs/scraper.job.js";

const router = Router();
router.get("/", getMatches);
export default router;
