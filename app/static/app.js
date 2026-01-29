const $ = (id) => document.getElementById(id);

// Base path for all API calls (injected by server, e.g. "/albums" or "")
const BASE_PATH = window.BASE_PATH || "";

const state = {
  albums: [],
  activeAlbum: null, // {id,title}
  photos: [],
  // Top quick preview
  quick: { open: false, index: 0 },
  // Album view selection
  albumIndex: 0,
  // Slideshow
  slide: { open: false, playing: true, speed: 7, timer: null, overlayTimer: null, fromTopView: false },
  // Album list visibility
  albumListHidden: false,
};

async function api(path, opts = {}) {
  const res = await fetch(BASE_PATH + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j.detail || JSON.stringify(j);
    } catch {
      detail = await res.text();
    }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

function imgUrl(kind, albumId, photoName) {
  if (kind === "thumbnail") return `${BASE_PATH}/thumbnails/${encodeURIComponent(albumId)}/${encodeURIComponent(photoName)}`;
  if (kind === "preview") return `${BASE_PATH}/previews/${encodeURIComponent(albumId)}/${encodeURIComponent(photoName)}`;
  return `${BASE_PATH}/download/${encodeURIComponent(albumId)}/${encodeURIComponent(photoName)}`;
}

function setVisible(el, visible) {
  el.style.display = visible ? "" : "none";
}

function showLogin(errMsg = "") {
  setVisible($("loginView"), true);
  setVisible($("appView"), false);
  $("loginError").textContent = errMsg;
  $("loginError").style.display = errMsg ? "" : "none";
  setTimeout(() => $("loginUsername").focus(), 0);
}

function showApp() {
  setVisible($("loginView"), false);
  setVisible($("appView"), true);
  showTopView();
}

function showTopView() {
  setVisible($("topView"), true);
  setVisible($("albumView"), false);
  closeQuickPreview();
  closeSlideshow(false);
  updateAlbumListVisibility();
}

function toggleAlbumList() {
  state.albumListHidden = !state.albumListHidden;
  updateAlbumListVisibility();
}

function updateAlbumListVisibility() {
  const topView = $("topView");
  if (!topView) return;
  if (state.albumListHidden) {
    topView.classList.add("albumListHidden");
  } else {
    topView.classList.remove("albumListHidden");
  }
}

function showAlbumView() {
  setVisible($("topView"), false);
  setVisible($("albumView"), true);
  closeQuickPreview();
  closeSlideshow(false);
}

function renderAlbums() {
  const list = $("albumList");
  list.innerHTML = "";
  for (const a of state.albums) {
    const div = document.createElement("div");
    div.className = "albumItem" + (state.activeAlbum?.id === a.id ? " active" : "");
    div.textContent = a.title;
    div.onclick = async () => {
      await selectAlbum(a.id, false);
    };
    div.ondblclick = async () => {
      await selectAlbum(a.id, true);
    };
    list.appendChild(div);
  }
}

function renderThumbGrid() {
  const grid = $("thumbGrid");
  grid.innerHTML = "";
  const albumId = state.activeAlbum?.id;
  if (!albumId) return;
  for (let i = 0; i < state.photos.length; i++) {
    const name = state.photos[i];
    const div = document.createElement("div");
    div.className = "thumb";
    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = imgUrl("thumbnail", albumId, name);
    const cap = document.createElement("div");
    cap.className = "cap";
    cap.textContent = name;
    div.appendChild(img);
    div.appendChild(cap);
    div.onclick = () => openQuickPreview(i);
    grid.appendChild(div);
  }
}

function renderThumbStrip() {
  const strip = $("thumbStrip");
  strip.innerHTML = "";
  const albumId = state.activeAlbum?.id;
  if (!albumId) return;
  for (let i = 0; i < state.photos.length; i++) {
    const name = state.photos[i];
    const div = document.createElement("div");
    div.className = "thumb" + (i === state.albumIndex ? " selected" : "");
    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = imgUrl("thumbnail", albumId, name);
    const cap = document.createElement("div");
    cap.className = "cap";
    cap.textContent = name;
    div.appendChild(img);
    div.appendChild(cap);
    div.onclick = () => setAlbumIndex(i);
    strip.appendChild(div);
  }
}

function updatePreviewImage() {
  const albumId = state.activeAlbum?.id;
  if (!albumId || state.photos.length === 0) return;
  const name = state.photos[state.albumIndex];
  $("previewImg").src = imgUrl("preview", albumId, name);
  $("downloadBtn").onclick = () => window.open(imgUrl("download", albumId, name), "_blank");
  $("albumTitle").textContent = `${state.activeAlbum.title} — ${name}`;
  // update strip selection style
  renderThumbStrip();
  // ensure selected thumbnail is visible (use setTimeout to ensure DOM is updated)
  setTimeout(() => {
    const strip = $("thumbStrip");
    const el = strip?.children[state.albumIndex];
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, 0);
}

function setAlbumIndex(i) {
  if (state.photos.length === 0) return;
  state.albumIndex = (i + state.photos.length) % state.photos.length;
  updatePreviewImage();
  // scrolling is handled in updatePreviewImage()
}

async function selectAlbum(albumId, goAlbumView) {
  const album = state.albums.find((a) => a.id === albumId);
  if (!album) return;
  state.activeAlbum = album;
  renderAlbums();
  $("appTitle").textContent = album.title;
  state.photos = await api(`/album/${encodeURIComponent(albumId)}/contents`);
  renderThumbGrid();
  state.albumIndex = 0;
  if (goAlbumView) {
    showAlbumView();
    renderThumbStrip();
    updatePreviewImage();
  }
}

function openQuickPreview(index) {
  state.quick.open = true;
  state.quick.index = index;
  setVisible($("quickPreview"), true);
  renderQuickPreview();
}

function closeQuickPreview() {
  state.quick.open = false;
  setVisible($("quickPreview"), false);
}

function renderQuickPreview() {
  const albumId = state.activeAlbum?.id;
  if (!albumId || state.photos.length === 0) return;
  const name = state.photos[state.quick.index];
  $("quickImg").src = imgUrl("preview", albumId, name);
  $("quickTitle").textContent = `${state.activeAlbum.title} — ${name}`;
  $("quickDownloadBtn").onclick = () =>
    window.open(imgUrl("download", albumId, name), "_blank");
}

function quickPrev() {
  if (!state.quick.open) return;
  state.quick.index = (state.quick.index - 1 + state.photos.length) % state.photos.length;
  renderQuickPreview();
}

function quickNext() {
  if (!state.quick.open) return;
  state.quick.index = (state.quick.index + 1) % state.photos.length;
  renderQuickPreview();
}


function enterAlbumViewFromTop(index) {
  state.albumIndex = index;
  $("albumLeftHeader").textContent = `Thumbnails — ${state.activeAlbum.title}`;
  showAlbumView();
  renderThumbStrip();
  updatePreviewImage();
}

function showOverlay() {
  if (!state.slide.open) return;
  $("slideOverlay").classList.remove("hidden");
  clearTimeout(state.slide.overlayTimer);
  state.slide.overlayTimer = setTimeout(() => {
    $("slideOverlay").classList.add("hidden");
  }, 5000);
}

function toast(msg, ms = 900) {
  const el = $("slideToast");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), ms);
}

function updateSlideImage() {
  const albumId = state.activeAlbum?.id;
  const titleEl = $("slidePhotoTitle");
  if (!albumId || state.photos.length === 0) {
    if (titleEl) titleEl.textContent = "";
    return;
  }
  const name = state.photos[state.albumIndex];
  const img = $("slideImg");
  if (img) {
    img.src = imgUrl("download", albumId, name);
  }
  if (titleEl) titleEl.textContent = name || "";
}

function slidePrev() {
  if (!state.slide.open) return;
  setAlbumIndex(state.albumIndex - 1);
  updateSlideImage();
}

function slideNext() {
  if (!state.slide.open) return;
  setAlbumIndex(state.albumIndex + 1);
  updateSlideImage();
}

function setSlidePlaying(playing) {
  state.slide.playing = playing;
  const btn = $("slidePausePlayBtn");
  if (btn) {
    const name = playing ? "pause" : "play";
    btn.innerHTML = `<i data-lucide="${name}"></i>`;
    if (window.lucide) window.lucide.createIcons({ root: btn });
  }

  if (state.slide.timer) {
    clearInterval(state.slide.timer);
    state.slide.timer = null;
  }
  if (playing && state.slide.open) {
    state.slide.timer = setInterval(() => {
      if (state.slide.open && state.slide.playing) {
        slideNext();
      }
    }, state.slide.speed * 1000);
  }
}

function openSlideshow(fromTopView = false) {
  state.slide.open = true;
  state.slide.fromTopView = fromTopView;
  setVisible($("slideshow"), true);
  updateSlideImage();
  setSlidePlaying(true);
  showOverlay();
}

function closeSlideshow(returnToPrevious = true) {
  if (!state.slide.open) return;
  const wasFromTopView = state.slide.fromTopView;
  state.slide.open = false;
  if (state.slide.timer) clearInterval(state.slide.timer);
  state.slide.timer = null;
  clearTimeout(state.slide.overlayTimer);
  state.slide.overlayTimer = null;
  setVisible($("slideshow"), false);
  if (returnToPrevious) {
    if (wasFromTopView) {
      showTopView();
    } else {
      showAlbumView();
    }
  }
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

async function initApp() {
  // wiring
  $("loginBtn").onclick = async () => {
    try {
      await api("/login", {
        method: "POST",
        body: JSON.stringify({
          username: $("loginUsername").value,
          password: $("loginPassword").value,
        }),
      });
      await boot();
    } catch (e) {
      showLogin(e.message || "Login failed");
    }
  };
  $("loginPassword").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("loginBtn").click();
  });
  $("loginUsername").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("loginBtn").click();
  });

  $("logoutBtn").onclick = async () => {
    try {
      await api("/logout", { method: "POST", body: "{}" });
    } finally {
      showLogin("");
    }
  };

  // Album list visibility toggle
  $("hideAlbumListBtn").onclick = () => toggleAlbumList();
  $("showAlbumListBtn").onclick = () => toggleAlbumList();

  // Slideshow from top view
  $("topPlayBtn").onclick = () => {
    if (state.activeAlbum && state.photos.length > 0) {
      state.albumIndex = 0;
      openSlideshow(true);  // true = from top view
    }
  };

  // Album view buttons
  $("backBtn").onclick = () => showTopView();
  $("prevBtn").onclick = () => setAlbumIndex(state.albumIndex - 1);
  $("nextBtn").onclick = () => setAlbumIndex(state.albumIndex + 1);
  $("playBtn").onclick = () => {
    openSlideshow();
  };

  // Quick preview modal
  $("quickCloseBtn").onclick = () => closeQuickPreview();
  $("quickPrevBtn").onclick = () => quickPrev();
  $("quickNextBtn").onclick = () => quickNext();
  $("quickPreview").addEventListener("click", (e) => {
    if (e.target.classList.contains("modalBackdrop")) closeQuickPreview();
  });

  // Slideshow overlay + controls
  $("slideshow").addEventListener("mousemove", () => showOverlay());
  $("slidePrevBtn").onclick = () => slidePrev();
  $("slideNextBtn").onclick = () => slideNext();
  $("slidePausePlayBtn").onclick = () => {
    setSlidePlaying(!state.slide.playing);
    toast(state.slide.playing ? "Playing" : "Paused");
    showOverlay();
  };
  $("slideCloseBtn").onclick = () => closeSlideshow(true);

  // Global keys (Top quick preview / Album / Slideshow)
  window.addEventListener("keydown", (e) => {
    if ($("loginView").style.display !== "none") return;

    if (state.slide.open) {
      if (e.key === "Escape") return closeSlideshow(true);
      if (e.key === "ArrowLeft") return slidePrev();
      if (e.key === "ArrowRight") return slideNext();
      if (e.key === " ") {
        e.preventDefault();
        setSlidePlaying(!state.slide.playing);
        toast(state.slide.playing ? "Playing" : "Paused");
        return showOverlay();
      }
      if (e.key === "[") {
        state.slide.speed = clamp(state.slide.speed - 2, 3, 30);
        toast(`Speed: ${state.slide.speed}s`, 1100);
        if (state.slide.playing) setSlidePlaying(true);
        return showOverlay();
      }
      if (e.key === "]") {
        state.slide.speed = clamp(state.slide.speed + 2, 3, 30);
        toast(`Speed: ${state.slide.speed}s`, 1100);
        if (state.slide.playing) setSlidePlaying(true);
        return showOverlay();
      }
      return;
    }

    if (state.quick.open) {
      if (e.key === "Escape") return closeQuickPreview();
      if (e.key === "ArrowLeft") return quickPrev();
      if (e.key === "ArrowRight") return quickNext();
      if (e.key === "Enter") return enterAlbumViewFromTop(state.quick.index);
      return;
    }

    if ($("albumView").style.display !== "none") {
      if (e.key === "Escape") return showTopView();
      if (e.key === "ArrowLeft") return setAlbumIndex(state.albumIndex - 1);
      if (e.key === "ArrowRight") return setAlbumIndex(state.albumIndex + 1);
    }
  });

  // Double click on quick image enters album view
  $("quickImg").ondblclick = () => enterAlbumViewFromTop(state.quick.index);
}

async function boot() {
  try {
    await api("/me");
  } catch {
    return showLogin("");
  }
  showApp();
  state.albums = await api("/albums");
  renderAlbums();
  if (state.albums.length > 0) {
    await selectAlbum(state.albums[0].id, false);
  }
  if (window.lucide) window.lucide.createIcons();
}

initApp().then(boot);

