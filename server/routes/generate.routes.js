import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import multer from "multer";
import { paths } from "../config/paths.js";
import { generateStudioImages } from "../services/geminiImage.service.js";
import { validateGenerateRequest } from "../services/validation.service.js";

const router = express.Router();
const maxFileSizeMb = Number(process.env.MAX_FILE_SIZE_MB || 12);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, paths.uploads);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: maxFileSizeMb * 1024 * 1024,
    files: 1
  },
  fileFilter(req, file, cb) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      const err = new Error("Ảnh phải là JPG, PNG hoặc WEBP.");
      err.status = 400;
      cb(err);
      return;
    }
    cb(null, true);
  }
});

router.post("/generate", upload.single("babyPhoto"), async (req, res, next) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      const err = new Error("Thiếu GEMINI_API_KEY trong biến môi trường.");
      err.status = 500;
      throw err;
    }

    const payload = validateGenerateRequest({
      file: req.file,
      body: req.body
    });

    const results = await generateStudioImages({
      babyPhoto: req.file,
      jobs: payload.jobs
    });

    res.json({
      ok: true,
      count: results.length,
      results
    });
  } catch (err) {
    next(err);
  } finally {
    if (req.file?.path) {
      fs.unlink(req.file.path).catch(() => {});
    }
  }
});

export default router;
