import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { paths } from "../config/paths.js";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function withRetry(fn, attempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === attempts || !shouldRetry(err.status || 500)) break;
      await sleep(1000 * attempt * attempt);
    }
  }

  throw lastError;
}

function buildPrompt(job) {
  return [
    "Edit the uploaded baby photo into a professional studio portrait.",
    "The uploaded photo is the primary identity reference.",
    "Preserve the baby's exact identity, face shape, eyes, nose, mouth, skin tone, age, hair, and natural expression.",
    "Do not replace the child, invent a different face, beautify the facial structure, or make the baby older.",
    `Studio concept: ${job.conceptName}.`,
    `Pose and composition: ${job.poseName}.`,
    "Only change the outfit, background, props, lighting, and studio styling as needed.",
    "Keep the baby fully clothed in tasteful child-safe styling.",
    "Create realistic premium studio photography with natural skin texture, soft professional light, sharp facial detail, and a vertical portrait composition.",
    "Return one finished image and no explanatory text."
  ].join(" ");
}

function apiError(status, payload) {
  const providerMessage = payload?.error?.message;
  const err = new Error(providerMessage || "Gemini không thể tạo ảnh.");
  err.status = status || 502;
  return err;
}

async function callGemini({ imageBase64, mimeType, prompt }) {
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;

  return withRetry(async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: imageBase64
              }
            }
          ]
        }],
        generationConfig: {
          responseModalities: ["IMAGE"]
        }
      }),
      signal: AbortSignal.timeout(
        Number(process.env.GEMINI_TIMEOUT_MS || 180000)
      )
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw apiError(response.status, payload);
    return payload;
  });
}

function getImagePart(responseData) {
  const parts = responseData?.candidates?.[0]?.content?.parts || [];
  return parts.find((part) => part.inlineData?.data);
}

async function generateOneImage({ babyPhoto, job, imageBase64 }) {
  const response = await callGemini({
    imageBase64,
    mimeType: babyPhoto.mimetype,
    prompt: buildPrompt(job)
  });

  const imagePart = getImagePart(response);
  if (!imagePart) {
    throw apiError(502, {
      error: { message: "Gemini không trả về dữ liệu ảnh hợp lệ." }
    });
  }

  const outputMimeType = imagePart.inlineData.mimeType || "image/png";
  const extension = outputMimeType.includes("jpeg") ? "jpg" : "png";
  const filename = `${Date.now()}-${crypto.randomUUID()}.${extension}`;

  await fsp.writeFile(
    path.join(paths.temp, filename),
    Buffer.from(imagePart.inlineData.data, "base64")
  );

  return {
    id: crypto.randomUUID(),
    conceptId: job.conceptId,
    conceptName: job.conceptName,
    poseName: job.poseName,
    imageUrl: `/results/${filename}`
  };
}

export async function generateStudioImages({ babyPhoto, jobs }) {
  const imageBase64 = (await fsp.readFile(babyPhoto.path)).toString("base64");
  const results = [];

  for (const job of jobs) {
    results.push(await generateOneImage({ babyPhoto, job, imageBase64 }));
  }

  return results;
}
