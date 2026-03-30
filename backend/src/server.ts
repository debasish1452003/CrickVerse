import app from "./app.js";
import dotenv from "dotenv";
import { PORT } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { startScraper } from "./jobs/scraper.job.js";

dotenv.config();
startScraper();
connectDB();

//#region [SERVER STARTING]
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost: ${PORT}`);
});
//#endregion
