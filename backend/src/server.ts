import app from "./app.js";
import dotenv from "dotenv";
import { PORT } from "./config/env.js";

dotenv.config(); 

//#region [SERVER STARTING]
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost: ${PORT}`);
});
//#endregion
