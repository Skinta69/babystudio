import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

export const paths = {
  root: rootDir,
  public: path.join(rootDir, "public"),
  uploads: path.join(rootDir, "uploads"),
  temp: path.join(rootDir, "temp")
};
