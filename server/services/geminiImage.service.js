/**
 * geminiImage.service.js
 *
 * Gemini image generation service for BabyStudio.
 *
 * ROOT CAUSE OF 429:
 *   The env var GEMINI_IMAGE_MODEL was set to "gemini-2.5-flash-preview-image"
 *   on Render. The -preview- variant has limit: 0 on the free tier (quota was
 *   revoked Dec 2025). The stable model string is "gemini-2.5-flash-image"
 *   (no "preview" in the name). Both are now paid-only for API access.
 *
 * STRATEGY:
 *   1. Primary:  gemini-2.5-flash-image  (stable, paid, ~$0.039/image)
 *   2. Fallback: gemini-2.0-flash-exp     (has limited free-tier IPM quota)
 *   3. If both fail with 429 → return friendly error with instructions.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");

// ─── Startup validation & logging ────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

console.log("[GeminiImage] ── Startup configuration ──────────────────────");
console.log(
  `[GeminiImage] GEMINI_API_KEY   : ${GEMINI_API_KEY ? "✓ present (" + GEMINI_API_KEY.slice(0, 8) + "...)" : "✗ MISSING — set this in Render → Environment"}`
);
console.log(`[GeminiImage] GEMINI_IMAGE_MODEL: ${GEMINI_IMAGE_MODEL}`);

// Warn immediately if the old broken model string is configured
if (GEMINI_IMAGE_MODEL.includes("preview")) {
  console.warn(
    "[GeminiImage] ⚠ WARNING: Model name contains 'preview'. " +
      "Preview image models (gemini-2.5-flash-preview-image) have quota limit:0 on the free tier. " +
      'Change GEMINI_IMAGE_MODEL to "gemini-2.5-flash-image" in Render environment variables.'
  );
}
console.log("[GeminiImage] ─────────────────────────────────────────────────");

// ─── Model fallback chain ────────────────────────────────────────────────────

/**
 * Ordered list of models to try.
 * gemini-2.0-flash-exp supports image generation and has a small free-tier
 * IPM allowance (2 images/min) which is useful for low-traffic apps and dev.
 * gemini-2.5-flash-image is the stable paid model ($0.039/image).
 */
const MODEL_FALLBACK_CHAIN = [
  GEMINI_IMAGE_MODEL,
  // Only add fallbacks that are different from the primary
  ...(GEMINI_IMAGE_MODEL !== "gemini-2.5-flash-image"
    ? ["gemini-2.5-flash-image"]
    : []),
  ...(GEMINI_IMAGE_MODEL !== "gemini-2.0-flash-exp"
    ? ["gemini-2.0-flash-exp"]
    : []),
];

// Deduplicate
const MODELS_TO_TRY = [...new Set(MODEL_FALLBACK_CHAIN)];
console.log(
  "[GeminiImage] Fallback chain   :",
  MODELS_TO_TRY.join(" → ")
);

// ─── Error classification ────────────────────────────────────────────────────

function classifyGeminiError(err) {
  const msg = (err.message || "").toLowerCase();
  const status = err.status || err.httpStatus || (err.response && err.response.status);

  if (status === 429 || msg.includes("429") || msg.includes("quota") || msg.includes("resource exhausted")) {
    return "QUOTA_EXCEEDED";
  }
  if (status === 400 || msg.includes("400") || msg.includes("invalid") || msg.includes("bad request")) {
    return "BAD_REQUEST";
  }
  if (status === 403 || msg.includes("403") || msg.includes("forbidden") || msg.includes("permission")) {
    return "PERMISSION_DENIED";
  }
  if (status === 404 || msg.includes("404") || msg.includes("not found")) {
    return "MODEL_NOT_FOUND";
  }
  if (msg.includes("image") && msg.includes("not support")) {
    return "IMAGE_NOT_SUPPORTED";
  }
  return "UNKNOWN";
}

// ─── Core generation function ────────────────────────────────────────────────

/**
 * generateBabyImage
 * @param {Buffer} imageBuffer   - The uploaded baby photo
 * @param {string} mimeType      - e.g. "image/jpeg"
 * @param {string} concept       - Theme/concept string (e.g. "underwater")
 * @param {string} pose          - Pose descriptor (e.g. "sitting")
 * @returns {Promise<{imageBase64: string, mimeType: string, modelUsed: string}>}
 */
async function generateBabyImage(imageBuffer, mimeType, concept, pose) {
  if (!GEMINI_API_KEY) {
    throw Object.assign(
      new Error(
        "GEMINI_API_KEY is not set. Add it in Render → Your Service → Environment."
      ),
      { code: "MISSING_API_KEY", statusCode: 500 }
    );
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

  const prompt = buildPrompt(concept, pose);
  console.log(`[GeminiImage] ── New generation request ──────────────────────`);
  console.log(`[GeminiImage] Concept   : ${concept}`);
  console.log(`[GeminiImage] Pose      : ${pose}`);
  console.log(`[GeminiImage] Prompt    : ${prompt}`);
  console.log(`[GeminiImage] Image     : ${imageBuffer.length} bytes (${mimeType})`);

  let lastError = null;

  for (const modelName of MODELS_TO_TRY) {
    console.log(`[GeminiImage] Trying model: ${modelName}`);

    try {
      const result = await callGeminiModel(genAI, modelName, imageBuffer, mimeType, prompt);
      console.log(`[GeminiImage] ✓ Success with model: ${modelName}`);
      return { ...result, modelUsed: modelName };
    } catch (err) {
      const errorType = classifyGeminiError(err);
      console.error(`[GeminiImage] ✗ Model ${modelName} failed`);
      console.error(`[GeminiImage]   Error type   : ${errorType}`);
      console.error(`[GeminiImage]   Status       : ${err.status || err.httpStatus || "unknown"}`);
      console.error(`[GeminiImage]   Message      : ${err.message}`);

      if (errorType === "QUOTA_EXCEEDED") {
        console.warn(
          `[GeminiImage]   → Quota exceeded on ${modelName}. ` +
            (MODELS_TO_TRY.indexOf(modelName) < MODELS_TO_TRY.length - 1
              ? "Trying next model in fallback chain..."
              : "No more fallbacks available.")
        );
        lastError = Object.assign(err, { errorType, modelName });
        continue; // try next model
      }

      if (errorType === "MODEL_NOT_FOUND") {
        console.warn(
          `[GeminiImage]   → Model not found: ${modelName}. Trying next in chain...`
        );
        lastError = Object.assign(err, { errorType, modelName });
        continue;
      }

      if (errorType === "IMAGE_NOT_SUPPORTED") {
        console.error(
          `[GeminiImage]   → Model ${modelName} does not support image generation output. ` +
            "This model can only analyze images, not generate them. Trying next..."
        );
        lastError = Object.assign(err, { errorType, modelName });
        continue;
      }

      // For BAD_REQUEST, PERMISSION_DENIED and UNKNOWN — don't fallback, surface immediately
      lastError = Object.assign(err, { errorType, modelName });
      break;
    }
  }

  // All models failed — throw a structured error
  throw buildFinalError(lastError);
}

// ─── Gemini API call ─────────────────────────────────────────────────────────

async function callGeminiModel(genAI, modelName, imageBuffer, mimeType, prompt) {
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseModalities: ["Text", "Image"],
    },
  });

  const imagePart = {
    inlineData: {
      data: imageBuffer.toString("base64"),
      mimeType: mimeType,
    },
  };

  const textPart = { text: prompt };

  console.log(`[GeminiImage]   Sending request to Gemini API...`);
  const startMs = Date.now();

  const response = await model.generateContent([textPart, imagePart]);

  console.log(`[GeminiImage]   API responded in ${Date.now() - startMs}ms`);

  return extractImageFromResponse(response, modelName);
}

// ─── Response extraction ─────────────────────────────────────────────────────

function extractImageFromResponse(response, modelName) {
  const candidates = response?.response?.candidates || [];

  if (!candidates.length) {
    console.error("[GeminiImage]   No candidates in response:", JSON.stringify(response?.response, null, 2));
    throw new Error("Gemini returned no candidates in response.");
  }

  const parts = candidates[0]?.content?.parts || [];
  console.log(`[GeminiImage]   Response parts (${parts.length}):`, parts.map((p) => p.text ? "text" : p.inlineData ? "image" : "unknown"));

  const imagePart = parts.find((p) => p.inlineData);
  if (!imagePart) {
    // Log the full text response for debugging
    const textPart = parts.find((p) => p.text);
    if (textPart) {
      console.error("[GeminiImage]   Model returned text only (no image):", textPart.text.slice(0, 500));
    }
    throw Object.assign(
      new Error(
        `Model ${modelName} did not return an image. It returned text only. ` +
          "This model may not support image generation output. " +
          "Check that responseModalities includes 'Image'."
      ),
      { status: 400, errorType: "IMAGE_NOT_SUPPORTED" }
    );
  }

  const { data, mimeType } = imagePart.inlineData;
  console.log(
    `[GeminiImage]   Image extracted: ${mimeType}, ${Math.round((data.length * 3) / 4 / 1024)}KB`
  );

  return { imageBase64: data, mimeType };
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(concept, pose) {
  return (
    `You are a professional baby photography AI. ` +
    `Transform the provided baby photo into a high-quality studio photograph. ` +
    `Theme/concept: "${concept}". ` +
    `Baby pose: "${pose}". ` +
    `Keep the baby's face, skin tone, and features identical to the original photo. ` +
    `Use professional studio lighting. ` +
    `Output ONLY the transformed image, no text.`
  );
}

// ─── Final error builder ──────────────────────────────────────────────────────

function buildFinalError(lastError) {
  const errorType = lastError?.errorType || classifyGeminiError(lastError);

  if (errorType === "QUOTA_EXCEEDED") {
    return Object.assign(
      new Error(
        "Image generation quota exceeded on all available Gemini models. " +
          "The free tier quota for gemini-2.5-flash-preview-image is 0 requests/day (removed Dec 2025). " +
          "Fix options: " +
          "(1) Enable billing in Google AI Studio and set GEMINI_IMAGE_MODEL=gemini-2.5-flash-image ($0.039/image). " +
          "(2) Use gemini-2.0-flash-exp which has a small free IPM allowance (2 images/min). " +
          "(3) Switch to OpenAI DALL-E 3 via OPENAI_API_KEY."
      ),
      {
        code: "QUOTA_EXCEEDED",
        statusCode: 429,
        userMessage:
          "Image generation is temporarily unavailable due to API quota limits. " +
          "Please try again later or contact support.",
        models: MODELS_TO_TRY,
      }
    );
  }

  if (errorType === "PERMISSION_DENIED") {
    return Object.assign(
      new Error(
        "Gemini API key does not have permission to use image generation. " +
          "Ensure your GEMINI_API_KEY is valid and billing is enabled for image models."
      ),
      {
        code: "PERMISSION_DENIED",
        statusCode: 403,
        userMessage: "API key configuration error. Please contact support.",
      }
    );
  }

  if (errorType === "BAD_REQUEST") {
    return Object.assign(
      new Error(`Gemini rejected the request: ${lastError?.message}`),
      {
        code: "BAD_REQUEST",
        statusCode: 400,
        userMessage:
          "The image or prompt was rejected by the AI. Please try a different photo or concept.",
      }
    );
  }

  return Object.assign(
    new Error(`Gemini image generation failed: ${lastError?.message || "Unknown error"}`),
    {
      code: "GEMINI_ERROR",
      statusCode: 500,
      userMessage: "Image generation failed. Please try again.",
    }
  );
}

module.exports = { generateBabyImage };
