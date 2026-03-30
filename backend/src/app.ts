import express from "express";
import cors from "cors";
import matchRoutes from "./routes/match.routes.js";
import morgan from "morgan";
import type { Application, Response, Request } from "express";
import { errorHandler } from "./middleware/error.middleware.js";
import { startScraper } from "./jobs/scraper.job.js";
import { getMatches } from "./controllers/match.controller.js";

const app: Application = express();

//#region [GLOBAL MIDDLEWARES]
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use("/api/matches", getMatches);
app.use(errorHandler);
//#endregion

//#region [HEALTH CHECK]
app.get("/", (req: Request, res: Response) => {
  res.send("CrickVerse App is running");
});
//#endregion

//#region [TEST ROUTER]

app.get("/api/test", (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Backend connected successfully",
  });
});
//#endregion

app.get("/api/hello", (req, res) => {
  res.json({
    message: "Namaste CrickMedia 🙏",
  });
});

export default app;
