import cors from "cors";
import express from "express";
import fs from "node:fs";
import { paths } from "./config/paths.js";
import generateRoutes from "./routes/generate.routes.js";

function ensureRuntimeDirs() {
  fs.mkdirSync(paths.uploads, { recursive: true });
  fs.mkdirSync(paths.temp, { recursive: true });
}

export function createApp() {
  ensureRuntimeDirs();

  const app = express();

  app.use(cors({
    origin: process.env.CLIENT_ORIGIN || true
  }));

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(paths.public));
  app.use("/results", express.static(paths.temp));

  app.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      service: "BabyStudio API",
      provider: "Gemini"
    });
  });

  app.use("/api", generateRoutes);

  app.use((req, res) => {
    res.status(404).json({
      ok: false,
      error: "Không tìm thấy endpoint."
    });
  });

  app.use((err, req, res, next) => {
    console.error(err);

    const status = err.status || err.statusCode || 500;
    const message = status >= 500
      ? "Máy chủ đang bận. Vui lòng thử lại sau."
      : err.message;

    res.status(status).json({
      ok: false,
      error: message,
      details: process.env.NODE_ENV === "development"
        ? (err.details || err.message)
        : undefined
    });
  });

  return app;
}
