const concepts = [
  {
    id: "royal",
    name: "Royal Baby",
    desc: "Trang phục hoàng gia, phông nền cổ điển",
    poses: ["Ngồi chính diện", "Nằm nghiêng", "Cầm gấu bông"]
  },
  {
    id: "flower",
    name: "Flower Garden",
    desc: "Vườn hoa mềm mại, ánh sáng tự nhiên",
    poses: ["Ngồi giữa hoa", "Nằm trên thảm hoa", "Nhìn nghiêng"]
  },
  {
    id: "moon",
    name: "Moon Dream",
    desc: "Concept trăng sao, tone mộng mơ",
    poses: ["Ngủ trên trăng", "Ôm gối sao", "Nhìn lên ánh trăng"]
  },
  {
    id: "minimal",
    name: "Minimal Studio",
    desc: "Studio sạch, cao cấp, ít đạo cụ",
    poses: ["Chân dung gần", "Ngồi trên ghế", "Nằm trên khăn trắng"]
  }
];

const state = {
  file: null,
  previewUrl: null,
  selectedConceptIds: new Set(),
  selectedPoseKeys: new Set(),
  progressTimer: null
};

const els = {
  form: document.getElementById("generateForm"),
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("babyPhoto"),
  previewWrap: document.getElementById("previewWrap"),
  previewImage: document.getElementById("previewImage"),
  removePhoto: document.getElementById("removePhoto"),
  conceptList: document.getElementById("conceptList"),
  poseList: document.getElementById("poseList"),
  jobCount: document.getElementById("jobCount"),
  generateBtn: document.getElementById("generateBtn"),
  idleState: document.getElementById("idleState"),
  loadingState: document.getElementById("loadingState"),
  loadingText: document.getElementById("loadingText"),
  progressBar: document.getElementById("progressBar"),
  errorState: document.getElementById("errorState"),
  errorText: document.getElementById("errorText"),
  resultState: document.getElementById("resultState"),
  resultCount: document.getElementById("resultCount"),
  resultGrid: document.getElementById("resultGrid"),
  resetBtn: document.getElementById("resetBtn")
};

function getSelectedConcepts() {
  return concepts.filter((concept) => state.selectedConceptIds.has(concept.id));
}

function getJobs() {
  const jobs = [];

  for (const concept of getSelectedConcepts()) {
    concept.poses.forEach((poseName, index) => {
      const poseKey = `${concept.id}:${index}`;
      if (state.selectedPoseKeys.has(poseKey)) {
        jobs.push({
          conceptId: concept.id,
          conceptName: concept.name,
          poseName
        });
      }
    });
  }

  return jobs;
}

function renderConcepts() {
  els.conceptList.innerHTML = "";

  concepts.forEach((concept) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `choice ${state.selectedConceptIds.has(concept.id) ? "active" : ""}`;
    button.innerHTML = `<strong>${concept.name}</strong><span>${concept.desc}</span>`;

    button.addEventListener("click", () => {
      if (state.selectedConceptIds.has(concept.id)) {
        state.selectedConceptIds.delete(concept.id);
        concept.poses.forEach((_, index) => {
          state.selectedPoseKeys.delete(`${concept.id}:${index}`);
        });
      } else {
        state.selectedConceptIds.add(concept.id);
      }

      renderAll();
    });

    els.conceptList.appendChild(button);
  });
}

function renderPoses() {
  els.poseList.innerHTML = "";
  const selectedConcepts = getSelectedConcepts();

  if (!selectedConcepts.length) {
    els.poseList.innerHTML = `
      <div class="choice">
        <strong>Chọn concept trước</strong>
        <span>Pose sẽ hiện sau khi có concept.</span>
      </div>
    `;
    return;
  }

  selectedConcepts.forEach((concept) => {
    concept.poses.forEach((poseName, index) => {
      const poseKey = `${concept.id}:${index}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `choice ${state.selectedPoseKeys.has(poseKey) ? "active" : ""}`;
      button.innerHTML = `<strong>${poseName}</strong><span>${concept.name}</span>`;

      button.addEventListener("click", () => {
        if (state.selectedPoseKeys.has(poseKey)) {
          state.selectedPoseKeys.delete(poseKey);
        } else {
          state.selectedPoseKeys.add(poseKey);
        }

        renderAll();
      });

      els.poseList.appendChild(button);
    });
  });
}

function renderPhotoPreview() {
  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
  }

  if (!state.file) {
    els.previewWrap.classList.add("hidden");
    els.previewImage.removeAttribute("src");
    return;
  }

  state.previewUrl = URL.createObjectURL(state.file);
  els.previewImage.src = state.previewUrl;
  els.previewWrap.classList.remove("hidden");
}

function updateSubmitState() {
  const count = getJobs().length;
  els.jobCount.textContent = String(count);
  els.generateBtn.disabled = !state.file || count === 0;
}

function renderAll() {
  renderConcepts();
  renderPoses();
  renderPhotoPreview();
  updateSubmitState();
}

function setVisible(active) {
  [els.idleState, els.loadingState, els.errorState, els.resultState].forEach((el) => {
    el.classList.add("hidden");
  });
  active.classList.remove("hidden");
}

function startProgress() {
  let progress = 12;
  els.progressBar.style.width = `${progress}%`;
  els.loadingText.textContent = "Đang upload ảnh và gửi yêu cầu AI.";

  clearInterval(state.progressTimer);
  state.progressTimer = setInterval(() => {
    progress = Math.min(progress + Math.random() * 8, 88);
    els.progressBar.style.width = `${progress}%`;

    if (progress > 35) {
      els.loadingText.textContent = "AI đang giữ khuôn mặt bé và dựng concept studio.";
    }

    if (progress > 65) {
      els.loadingText.textContent = "Đang hoàn thiện ánh sáng, trang phục và chi tiết ảnh.";
    }
  }, 900);
}

function stopProgress(done = false) {
  clearInterval(state.progressTimer);
  state.progressTimer = null;
  els.progressBar.style.width = done ? "100%" : "0%";
}

function buildFormData() {
  const jobs = getJobs();
  const firstJob = jobs[0];
  const formData = new FormData();

  formData.append("babyPhoto", state.file);
  formData.append("conceptId", firstJob.conceptId);
  formData.append("conceptName", firstJob.conceptName);
  formData.append("poseName", firstJob.poseName);
  formData.append("jobs", JSON.stringify(jobs));

  return formData;
}

function renderResults(results) {
  els.resultGrid.innerHTML = "";
  els.resultCount.textContent = `${results.length} ảnh studio đã tạo`;

  results.forEach((result) => {
    const card = document.createElement("article");
    card.className = "result-card";
    card.innerHTML = `
      <img src="${result.imageUrl}" alt="${result.conceptName} - ${result.poseName}">
      <div class="result-body">
        <strong>${result.conceptName}</strong>
        <span>${result.poseName}</span>
        <a class="download" href="${result.imageUrl}" download>Tải ảnh</a>
      </div>
    `;
    els.resultGrid.appendChild(card);
  });
}

async function submitGenerate(event) {
  event.preventDefault();

  setVisible(els.loadingState);
  startProgress();
  els.generateBtn.disabled = true;

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      body: buildFormData()
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "API tạo ảnh thất bại.");
    }

    stopProgress(true);
    renderResults(data.results || []);
    setVisible(els.resultState);
  } catch (err) {
    stopProgress(false);
    els.errorText.textContent = err.message;
    setVisible(els.errorState);
  } finally {
    updateSubmitState();
  }
}

function setFile(file) {
  if (!file) return;

  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) {
    els.errorText.textContent = "Ảnh phải là JPG, PNG hoặc WEBP.";
    setVisible(els.errorState);
    return;
  }

  if (file.size > 12 * 1024 * 1024) {
    els.errorText.textContent = "Ảnh vượt quá 12MB.";
    setVisible(els.errorState);
    return;
  }

  state.file = file;
  renderAll();
}

els.fileInput.addEventListener("change", (event) => {
  setFile(event.target.files?.[0]);
});

els.removePhoto.addEventListener("click", () => {
  state.file = null;
  els.fileInput.value = "";
  renderAll();
});

els.dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  els.dropzone.classList.add("dragover");
});

els.dropzone.addEventListener("dragleave", () => {
  els.dropzone.classList.remove("dragover");
});

els.dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  els.dropzone.classList.remove("dragover");
  setFile(event.dataTransfer.files?.[0]);
});

els.form.addEventListener("submit", submitGenerate);

els.resetBtn.addEventListener("click", () => {
  setVisible(els.idleState);
  els.resultGrid.innerHTML = "";
});

renderAll();
