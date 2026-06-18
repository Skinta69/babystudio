import "dotenv/config";
import { createApp } from "./server/app.js";

const port = Number(process.env.PORT || 3000);
const app = createApp();

app.listen(port, () => {
  console.log(`BabyStudio is running at http://localhost:${port}`);
});
