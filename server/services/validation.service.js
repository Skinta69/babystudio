const MAX_RESULTS = Number(process.env.MAX_RESULTS || 12);

function badRequest(message, details) {
  const err = new Error(message);
  err.status = 400;
  err.details = details;
  return err;
}

function cleanText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function parseJobs(body) {
  if (body.jobs) {
    try {
      const parsed = JSON.parse(body.jobs);
      if (!Array.isArray(parsed)) {
        throw new Error("jobs must be an array");
      }
      return parsed;
    } catch {
      throw badRequest("Trường jobs không hợp lệ.");
    }
  }

  return [{
    conceptId: body.conceptId,
    conceptName: body.conceptName,
    poseName: body.poseName
  }];
}

export function validateGenerateRequest({ file, body }) {
  if (!file) {
    throw badRequest("Vui lòng upload ảnh bé với field babyPhoto.");
  }

  const jobs = parseJobs(body)
    .map((job) => ({
      conceptId: cleanText(job.conceptId),
      conceptName: cleanText(job.conceptName),
      poseName: cleanText(job.poseName)
    }))
    .filter((job) => job.conceptId || job.conceptName || job.poseName);

  if (!jobs.length) {
    throw badRequest("Vui lòng chọn concept và pose.");
  }

  if (jobs.length > MAX_RESULTS) {
    throw badRequest(`Tối đa ${MAX_RESULTS} ảnh cho mỗi lần tạo.`);
  }

  for (const job of jobs) {
    if (!job.conceptId) throw badRequest("Thiếu conceptId.");
    if (!job.conceptName) throw badRequest("Thiếu conceptName.");
    if (!job.poseName) throw badRequest("Thiếu poseName.");
  }

  return { jobs };
}
