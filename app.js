import { firebaseConfig, firebaseEnabled, firestoreCollection } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  doc as firestoreDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const INCHES_PER_FOOT = 12;
const SNAP = 1 / INCHES_PER_FOOT;
const EDGE_HIT_PX = 10;
const CLICK_WINDOW_MS = 320;
const STORAGE_KEY = "booth-designer-state-v2";
const ROOM_PARAM = "room";
const EXPORT_PADDING_FEET = 1;
const EXPORT_PIXELS_PER_FOOT = 160;
const EXPORT_MAX_DIMENSION = 12000;

const defaultState = () => ({
  booth: { width: 60, length: 20 },
  sections: [],
  selectedSectionId: null,
  nextSectionId: 1,
  camera: { x: 80, y: 80, zoom: 18 },
  interaction: null,
  colorTargetId: null,
  lastRightClick: { id: null, time: 0 },
  lastLeftClick: { id: null, time: 0 },
});

const state = defaultState();

const collaboration = {
  roomId: null,
  app: null,
  db: null,
  roomRef: null,
  unsubscribe: null,
  connected: false,
  enabled: false,
  clientId: window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 12),
  lastSnapshotJson: null,
  isApplyingRemote: false,
};

const svg = document.getElementById("designerSvg");
const cameraLayer = document.getElementById("cameraLayer");
const boothLayer = document.getElementById("boothLayer");
const sectionsLayer = document.getElementById("sectionsLayer");
const overlayLayer = document.getElementById("overlayLayer");
const boothSizeButton = document.getElementById("boothSizeButton");
const deleteSectionBtn = document.getElementById("deleteSectionBtn");
const resetLayoutBtn = document.getElementById("resetLayoutBtn");
const shareSessionBtn = document.getElementById("shareSessionBtn");
const copySessionBtn = document.getElementById("copySessionBtn");
const exportImageBtn = document.getElementById("exportImageBtn");
const saveStatus = document.getElementById("saveStatus");
const sessionStatus = document.getElementById("sessionStatus");
const boothSizeDialog = document.getElementById("boothSizeDialog");
const boothSizeForm = document.getElementById("boothSizeForm");
const boothWidthInput = document.getElementById("boothWidthInput");
const boothLengthInput = document.getElementById("boothLengthInput");
const cancelBoothSizeBtn = document.getElementById("cancelBoothSizeBtn");
const sectionEditDialog = document.getElementById("sectionEditDialog");
const sectionEditForm = document.getElementById("sectionEditForm");
const sectionNameInput = document.getElementById("sectionNameInput");
const sectionWidthInput = document.getElementById("sectionWidthInput");
const sectionHeightInput = document.getElementById("sectionHeightInput");
const cancelSectionEditBtn = document.getElementById("cancelSectionEditBtn");
const colorPickerPopover = document.getElementById("colorPickerPopover");
const sectionColorInput = document.getElementById("sectionColorInput");

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundToSnap(value) {
  return Math.round(value / SNAP) * SNAP;
}

function roundDimension(value) {
  return Math.max(SNAP, roundToSnap(value));
}

function feetToInchesLabel(valueFeet) {
  return `${Math.round(valueFeet * INCHES_PER_FOOT)}"`;
}

function sectionSizeLabel(section) {
  return `${feetToInchesLabel(section.width)} x ${feetToInchesLabel(section.height)}`;
}

function formatBoothSize() {
  return `${state.booth.width} ft x ${state.booth.length} ft`;
}

function setSaveStatus(message) {
  saveStatus.textContent = message;
}

function setSessionStatus(message) {
  sessionStatus.textContent = message;
}

function formatTimestamp() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function isHostedSessionCapable() {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

function isTypingTarget(target) {
  if (!target) {
    return false;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function hasOpenDialog() {
  return Boolean(document.querySelector("dialog[open]"));
}

function normalizeSection(section) {
  return {
    id: Number(section.id),
    name: typeof section.name === "string" ? section.name : "Section",
    color: typeof section.color === "string" ? section.color : "#2d6cdf",
    x: roundToSnap(Number(section.x) || 0),
    y: roundToSnap(Number(section.y) || 0),
    width: roundDimension(Number(section.width) || 1),
    height: roundDimension(Number(section.height) || 1),
  };
}

function buildSnapshot() {
  return {
    booth: {
      width: Math.max(1, Math.round(Number(state.booth.width) || 60)),
      length: Math.max(1, Math.round(Number(state.booth.length) || 20)),
    },
    sections: state.sections.map((section) => ({ ...section })),
    nextSectionId: state.nextSectionId,
    camera: { ...state.camera },
  };
}

function applySnapshot(snapshot) {
  state.booth.width = Math.max(1, Math.round(Number(snapshot?.booth?.width) || 60));
  state.booth.length = Math.max(1, Math.round(Number(snapshot?.booth?.length) || 20));
  state.sections = Array.isArray(snapshot?.sections) ? snapshot.sections.map(normalizeSection) : [];
  state.nextSectionId = Math.max(
    Number(snapshot?.nextSectionId) || 1,
    state.sections.reduce((maxId, section) => Math.max(maxId, section.id + 1), 1)
  );

  if (snapshot?.camera && Number.isFinite(snapshot.camera.zoom)) {
    state.camera.x = Number(snapshot.camera.x) || 80;
    state.camera.y = Number(snapshot.camera.y) || 80;
    state.camera.zoom = clamp(Number(snapshot.camera.zoom) || 18, 6, 64);
  }

  fitSectionsToBooth();
}

function persistLocalSnapshot(snapshot = buildSnapshot(), message) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    setSaveStatus(message || `Autosaved locally at ${formatTimestamp()}.`);
  } catch (error) {
    console.error(error);
    setSaveStatus("Autosave could not write to local storage in this browser.");
  }
}

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    applySnapshot(JSON.parse(raw));
    setSaveStatus("Autosave restored from your previous session.");
  } catch (error) {
    console.error(error);
    setSaveStatus("Saved layout could not be restored, so a fresh layout was loaded.");
  }
}

function getSvgPoint(clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function screenToWorld(clientX, clientY) {
  const point = getSvgPoint(clientX, clientY);
  return {
    x: (point.x - state.camera.x) / state.camera.zoom,
    y: (point.y - state.camera.y) / state.camera.zoom,
  };
}

function isPointInsideBooth(point) {
  return point.x >= 0 && point.y >= 0 && point.x <= state.booth.width && point.y <= state.booth.length;
}

function getSectionById(id) {
  return state.sections.find((section) => section.id === id) || null;
}

function pushSharedState(message) {
  if (!collaboration.roomRef || collaboration.isApplyingRemote) {
    return;
  }

  const snapshot = buildSnapshot();
  const snapshotJson = JSON.stringify(snapshot);
  collaboration.lastSnapshotJson = snapshotJson;

  setDoc(
    collaboration.roomRef,
    {
      snapshot,
      snapshotJson,
      updatedAt: serverTimestamp(),
      updatedBy: collaboration.clientId,
    },
    { merge: true }
  ).catch((error) => {
    console.error(error);
    setSaveStatus("Live save failed. Check your Firebase config and Firestore rules.");
  });

  persistLocalSnapshot(snapshot, message || `Live layout synced at ${formatTimestamp()}.`);
}

function pullSharedState(snapshotData, message) {
  if (!snapshotData) {
    return false;
  }

  const raw = typeof snapshotData.snapshotJson === "string"
    ? snapshotData.snapshotJson
    : JSON.stringify(snapshotData.snapshot || {});

  try {
    collaboration.isApplyingRemote = true;
    collaboration.lastSnapshotJson = raw;
    applySnapshot(snapshotData.snapshot || JSON.parse(raw));
    render();
    persistLocalSnapshot(buildSnapshot(), message || `Live layout updated at ${formatTimestamp()}.`);
    return true;
  } catch (error) {
    console.error(error);
    setSaveStatus("A shared layout update could not be applied.");
    return false;
  } finally {
    collaboration.isApplyingRemote = false;
  }
}

function persistState(message) {
  if (collaboration.enabled && collaboration.roomRef) {
    pushSharedState(message);
    return;
  }

  persistLocalSnapshot(buildSnapshot(), message);
}

function saveAndRender(message) {
  persistState(message);
  render();
}

function setSelectedSection(id) {
  state.selectedSectionId = id;
  deleteSectionBtn.disabled = !id;
  render();
}

function createSection(rect) {
  const sectionId = state.nextSectionId++;
  const section = {
    id: sectionId,
    name: `Section ${sectionId}`,
    color: "#2d6cdf",
    x: roundToSnap(rect.x),
    y: roundToSnap(rect.y),
    width: roundDimension(rect.width),
    height: roundDimension(rect.height),
  };

  section.x = clamp(section.x, 0, state.booth.width - section.width);
  section.y = clamp(section.y, 0, state.booth.length - section.height);
  state.sections.push(section);
  state.selectedSectionId = section.id;
  saveAndRender();
}

function duplicateSection(id) {
  const source = getSectionById(id);
  if (!source) {
    return;
  }

  const copyId = state.nextSectionId++;
  const copy = {
    ...source,
    id: copyId,
    name: `${source.name} Copy`,
    x: clamp(roundToSnap(source.x + 1), 0, state.booth.width - source.width),
    y: clamp(roundToSnap(source.y + 1), 0, state.booth.length - source.height),
  };

  state.sections.push(copy);
  state.selectedSectionId = copy.id;
  saveAndRender();
}

function removeSelectedSection() {
  if (!state.selectedSectionId) {
    return;
  }
  state.sections = state.sections.filter((section) => section.id !== state.selectedSectionId);
  state.selectedSectionId = null;
  deleteSectionBtn.disabled = true;
  saveAndRender();
}

function openSectionEditor(sectionId) {
  const section = getSectionById(sectionId);
  if (!section) {
    return;
  }

  state.selectedSectionId = sectionId;
  sectionEditForm.dataset.sectionId = String(sectionId);
  sectionNameInput.value = section.name;
  sectionWidthInput.value = String(Math.round(section.width * INCHES_PER_FOOT));
  sectionHeightInput.value = String(Math.round(section.height * INCHES_PER_FOOT));
  deleteSectionBtn.disabled = false;
  render();
  sectionEditDialog.showModal();
}

function applySectionEdit() {
  const sectionId = Number(sectionEditForm.dataset.sectionId);
  const section = getSectionById(sectionId);
  if (!section) {
    return;
  }

  const requestedWidth = roundDimension(Number(sectionWidthInput.value) / INCHES_PER_FOOT);
  const requestedHeight = roundDimension(Number(sectionHeightInput.value) / INCHES_PER_FOOT);
  section.name = sectionNameInput.value.trim() || section.name;
  section.width = clamp(requestedWidth, SNAP, state.booth.width);
  section.height = clamp(requestedHeight, SNAP, state.booth.length);
  section.x = clamp(section.x, 0, state.booth.width - section.width);
  section.y = clamp(section.y, 0, state.booth.length - section.height);
  saveAndRender();
}

function fitSectionsToBooth() {
  state.sections = state.sections
    .map((section) => {
      const width = Math.min(roundDimension(section.width), state.booth.width);
      const height = Math.min(roundDimension(section.height), state.booth.length);
      return {
        ...section,
        x: clamp(roundToSnap(section.x), 0, state.booth.width - width),
        y: clamp(roundToSnap(section.y), 0, state.booth.length - height),
        width,
        height,
      };
    })
    .filter((section) => section.width >= SNAP && section.height >= SNAP);

  if (state.selectedSectionId && !getSectionById(state.selectedSectionId)) {
    state.selectedSectionId = null;
  }
}

function getResizeEdges(section, worldPoint) {
  const threshold = EDGE_HIT_PX / state.camera.zoom;
  return {
    left: Math.abs(worldPoint.x - section.x) <= threshold,
    right: Math.abs(worldPoint.x - (section.x + section.width)) <= threshold,
    top: Math.abs(worldPoint.y - section.y) <= threshold,
    bottom: Math.abs(worldPoint.y - (section.y + section.height)) <= threshold,
  };
}

function getInteractionType(section, worldPoint) {
  const edges = getResizeEdges(section, worldPoint);
  if (edges.left || edges.right || edges.top || edges.bottom) {
    return { mode: "resize", edges };
  }
  return { mode: "move", edges };
}

function normalizeRect(start, current) {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const width = roundToSnap(Math.abs(current.x - start.x));
  const height = roundToSnap(Math.abs(current.y - start.y));
  return {
    x: clamp(roundToSnap(x), 0, state.booth.width),
    y: clamp(roundToSnap(y), 0, state.booth.length),
    width: clamp(width, 0, state.booth.width),
    height: clamp(height, 0, state.booth.length),
  };
}

function renderBooth() {
  boothLayer.innerHTML = "";

  const boothBase = document.createElementNS(SVG_NS, "rect");
  boothBase.setAttribute("x", "0");
  boothBase.setAttribute("y", "0");
  boothBase.setAttribute("width", String(state.booth.width));
  boothBase.setAttribute("height", String(state.booth.length));
  boothBase.setAttribute("fill", "var(--booth-fill)");
  boothBase.setAttribute("opacity", "0.36");
  boothBase.setAttribute("pointer-events", "none");
  boothLayer.appendChild(boothBase);

  const boothRect = document.createElementNS(SVG_NS, "rect");
  boothRect.setAttribute("x", "0");
  boothRect.setAttribute("y", "0");
  boothRect.setAttribute("width", String(state.booth.width));
  boothRect.setAttribute("height", String(state.booth.length));
  boothRect.setAttribute("fill", "url(#majorGrid)");
  boothRect.setAttribute("stroke", "var(--booth-stroke)");
  boothRect.setAttribute("stroke-width", "0.12");
  boothRect.dataset.role = "booth";
  boothLayer.appendChild(boothRect);
}

function renderSections() {
  sectionsLayer.innerHTML = "";
  overlayLayer.innerHTML = "";

  state.sections.forEach((section) => {
    const group = document.createElementNS(SVG_NS, "g");
    group.dataset.sectionId = String(section.id);

    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(section.x));
    rect.setAttribute("y", String(section.y));
    rect.setAttribute("width", String(section.width));
    rect.setAttribute("height", String(section.height));
    rect.setAttribute("rx", "0.3");
    rect.setAttribute("fill", section.color);
    rect.setAttribute("fill-opacity", state.selectedSectionId === section.id ? "0.9" : "0.82");
    rect.setAttribute("stroke", "rgba(16,16,16,0.35)");
    rect.setAttribute("stroke-width", "0.08");
    rect.dataset.sectionId = String(section.id);
    rect.dataset.role = "section";
    group.appendChild(rect);

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", String(section.x + section.width / 2));
    label.setAttribute("y", String(section.y + section.height / 2));
    label.setAttribute("class", "section-label section-label-outline");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dominant-baseline", "middle");

    const nameLine = document.createElementNS(SVG_NS, "tspan");
    nameLine.setAttribute("x", String(section.x + section.width / 2));
    nameLine.setAttribute("dy", "-0.45em");
    nameLine.textContent = section.name;

    const sizeLine = document.createElementNS(SVG_NS, "tspan");
    sizeLine.setAttribute("x", String(section.x + section.width / 2));
    sizeLine.setAttribute("dy", "1.25em");
    sizeLine.textContent = sectionSizeLabel(section);

    label.appendChild(nameLine);
    label.appendChild(sizeLine);
    group.appendChild(label);
    sectionsLayer.appendChild(group);

    if (state.selectedSectionId === section.id) {
      const outline = document.createElementNS(SVG_NS, "rect");
      outline.setAttribute("x", String(section.x));
      outline.setAttribute("y", String(section.y));
      outline.setAttribute("width", String(section.width));
      outline.setAttribute("height", String(section.height));
      outline.setAttribute("class", "selection-outline");
      overlayLayer.appendChild(outline);
    }
  });
}

function updateDraftOverlay() {
  overlayLayer.innerHTML = "";

  if (!state.interaction || state.interaction.type !== "create") {
    if (state.selectedSectionId) {
      const selected = getSectionById(state.selectedSectionId);
      if (selected) {
        const outline = document.createElementNS(SVG_NS, "rect");
        outline.setAttribute("x", String(selected.x));
        outline.setAttribute("y", String(selected.y));
        outline.setAttribute("width", String(selected.width));
        outline.setAttribute("height", String(selected.height));
        outline.setAttribute("class", "selection-outline");
        overlayLayer.appendChild(outline);
      }
    }
    return;
  }

  const rect = state.interaction.draftRect;
  if (!rect) {
    return;
  }

  const draft = document.createElementNS(SVG_NS, "rect");
  draft.setAttribute("x", String(rect.x));
  draft.setAttribute("y", String(rect.y));
  draft.setAttribute("width", String(rect.width));
  draft.setAttribute("height", String(rect.height));
  draft.setAttribute("fill", "rgba(45,108,223,0.18)");
  draft.setAttribute("stroke", "#2d6cdf");
  draft.setAttribute("stroke-width", "0.1");
  draft.setAttribute("stroke-dasharray", "0.35 0.2");
  overlayLayer.appendChild(draft);
}

function renderCamera() {
  cameraLayer.setAttribute("transform", `translate(${state.camera.x} ${state.camera.y}) scale(${state.camera.zoom})`);
}

function renderHud() {
  boothSizeButton.textContent = formatBoothSize();
  deleteSectionBtn.disabled = !state.selectedSectionId;
  copySessionBtn.disabled = !collaboration.roomId;
  shareSessionBtn.textContent = collaboration.roomId ? "New Live Room" : "Share Live Link";
}

function render() {
  renderCamera();
  renderBooth();
  renderSections();
  renderHud();
}

function closeColorPicker() {
  colorPickerPopover.hidden = true;
  state.colorTargetId = null;
}

function openColorPicker(sectionId, clientX, clientY) {
  const section = getSectionById(sectionId);
  if (!section) {
    return;
  }

  state.colorTargetId = sectionId;
  sectionColorInput.value = section.color;
  colorPickerPopover.hidden = false;
  colorPickerPopover.style.left = `${clientX + 12}px`;
  colorPickerPopover.style.top = `${clientY + 12}px`;
  setSelectedSection(sectionId);
}

function openBoothDialog() {
  boothWidthInput.value = String(state.booth.width);
  boothLengthInput.value = String(state.booth.length);
  boothSizeDialog.showModal();
}

function resetLayout() {
  const fresh = defaultState();
  state.booth = fresh.booth;
  state.sections = fresh.sections;
  state.selectedSectionId = null;
  state.nextSectionId = fresh.nextSectionId;
  state.camera = fresh.camera;
  state.interaction = null;
  state.colorTargetId = null;
  state.lastRightClick = fresh.lastRightClick;
  state.lastLeftClick = fresh.lastLeftClick;
  closeColorPicker();
  saveAndRender("Layout reset and saved.");
}

function moveSelectedSectionBy(dx, dy) {
  const section = getSectionById(state.selectedSectionId);
  if (!section) {
    return;
  }

  const nextX = clamp(roundToSnap(section.x + dx), 0, state.booth.width - section.width);
  const nextY = clamp(roundToSnap(section.y + dy), 0, state.booth.length - section.height);

  if (nextX === section.x && nextY === section.y) {
    return;
  }

  section.x = nextX;
  section.y = nextY;
  saveAndRender();
}

function getRoomIdFromUrl() {
  const roomId = new URL(window.location.href).searchParams.get(ROOM_PARAM);
  return roomId ? roomId.trim() : null;
}

function setRoomIdInUrl(roomId) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set(ROOM_PARAM, roomId);
  window.history.replaceState({}, "", nextUrl);
}

function destroyCollaboration() {
  if (collaboration.unsubscribe) {
    collaboration.unsubscribe();
  }

  collaboration.roomRef = null;
  collaboration.unsubscribe = null;
  collaboration.connected = false;
  collaboration.enabled = false;
  collaboration.lastSnapshotJson = null;
}

async function ensureCollaboration(roomId) {
  if (!roomId) {
    return false;
  }

  if (!isHostedSessionCapable()) {
    collaboration.roomId = roomId;
    setSessionStatus("Live rooms need the app to be opened from an http(s) URL.");
    renderHud();
    return false;
  }

  if (!firebaseEnabled) {
    collaboration.roomId = roomId;
    setSessionStatus("Firebase is not configured yet. Fill in firebase-config.js, publish again, then open this room URL.");
    renderHud();
    return false;
  }

  if (collaboration.enabled && collaboration.roomId === roomId) {
    return true;
  }

  destroyCollaboration();
  collaboration.roomId = roomId;
  copySessionBtn.disabled = false;
  setSessionStatus(`Connecting to Firebase room ${roomId}...`);
  renderHud();

  try {
    if (!collaboration.app) {
      collaboration.app = initializeApp(firebaseConfig);
      collaboration.db = getFirestore(collaboration.app);
    }

    const roomRef = firestoreDoc(collaboration.db, firestoreCollection, roomId);
    collaboration.roomRef = roomRef;
    collaboration.enabled = true;

    collaboration.unsubscribe = onSnapshot(
      roomRef,
      (roomSnapshot) => {
        collaboration.connected = true;

        if (!roomSnapshot.exists()) {
          pushSharedState("Live room created and ready to share.");
          setSessionStatus(`Firebase room ${roomId} is ready. Anyone with this URL can edit.`);
          return;
        }

        const roomData = roomSnapshot.data();
        const incomingJson = typeof roomData.snapshotJson === "string"
          ? roomData.snapshotJson
          : JSON.stringify(roomData.snapshot || {});

        if (incomingJson && incomingJson !== collaboration.lastSnapshotJson) {
          pullSharedState(roomData);
        }

        setSessionStatus(`Firebase room ${roomId} is synced. Anyone with this URL can edit.`);
      },
      (error) => {
        console.error(error);
        collaboration.connected = false;
        collaboration.enabled = false;
        setSessionStatus("Firebase sync was blocked. Check Firestore rules and that your site is served over https.");
      }
    );

    setSessionStatus(`Firebase room ${roomId} is connecting...`);
    return true;
  } catch (error) {
    console.error(error);
    setSessionStatus("Firebase collaboration could not start. Check firebase-config.js and your Firestore setup.");
    collaboration.enabled = false;
    return false;
  }
}

function createRoomId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

async function copySessionUrl() {
  if (!collaboration.roomId) {
    return;
  }

  const url = window.location.href;

  try {
    await navigator.clipboard.writeText(url);
    setSessionStatus("Live session URL copied to your clipboard.");
  } catch (error) {
    console.error(error);
    setSessionStatus(`Copy failed. Share this URL manually: ${url}`);
  }
}

async function startSharedSession() {
  const roomId = createRoomId();
  setRoomIdInUrl(roomId);
  const enabled = await ensureCollaboration(roomId);
  if (enabled) {
    await copySessionUrl();
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildExportSvgMarkup() {
  const padding = EXPORT_PADDING_FEET;
  const width = state.booth.width + padding * 2;
  const height = state.booth.length + padding * 2;
  const viewBox = `${-padding} ${-padding} ${width} ${height}`;

  const sectionMarkup = state.sections
    .map((section) => {
      const centerX = section.x + section.width / 2;
      const centerY = section.y + section.height / 2;
      return `
        <g>
          <rect x="${section.x}" y="${section.y}" width="${section.width}" height="${section.height}" rx="0.3" fill="${escapeXml(section.color)}" fill-opacity="0.88" stroke="rgba(16,16,16,0.35)" stroke-width="0.08" />
          <text x="${centerX}" y="${centerY}" class="section-label section-label-outline" text-anchor="middle" dominant-baseline="middle">
            <tspan x="${centerX}" dy="-0.45em">${escapeXml(section.name)}</tspan>
            <tspan x="${centerX}" dy="1.25em">${escapeXml(sectionSizeLabel(section))}</tspan>
          </text>
        </g>
      `;
    })
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="Booth designer export">
      <defs>
        <pattern id="minorGridExport" width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 1" fill="none" class="grid-line-minor" />
        </pattern>
        <pattern id="majorGridExport" width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill="url(#minorGridExport)"></rect>
          <path d="M 5 0 L 0 0 0 5" fill="none" class="grid-line-major" />
        </pattern>
        <style>
          .grid-line-minor { stroke: rgba(112, 91, 61, 0.13); stroke-width: 0.03; }
          .grid-line-major { stroke: rgba(112, 91, 61, 0.24); stroke-width: 0.06; }
          .section-label {
            font-family: Consolas, "Courier New", monospace;
            font-size: 0.72px;
            fill: #ffffff;
          }
          .section-label-outline {
            stroke: rgba(20,18,15,0.35);
            stroke-width: 0.16px;
            paint-order: stroke;
          }
        </style>
      </defs>
      <rect x="${-padding}" y="${-padding}" width="${width}" height="${height}" fill="#f3e6d2" />
      <rect x="0" y="0" width="${state.booth.width}" height="${state.booth.length}" fill="#f9f3e8" opacity="0.36" />
      <rect x="0" y="0" width="${state.booth.width}" height="${state.booth.length}" fill="url(#majorGridExport)" stroke="#85694a" stroke-width="0.12" />
      ${sectionMarkup}
    </svg>
  `.trim();
}

async function exportLayoutAsImage() {
  exportImageBtn.disabled = true;

  try {
    const svgMarkup = buildExportSvgMarkup();
    const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const exportWidthFeet = state.booth.width + EXPORT_PADDING_FEET * 2;
    const exportHeightFeet = state.booth.length + EXPORT_PADDING_FEET * 2;
    const scale = Math.min(
      EXPORT_PIXELS_PER_FOOT,
      EXPORT_MAX_DIMENSION / Math.max(exportWidthFeet, exportHeightFeet)
    );
    const canvas = document.createElement("canvas");

    canvas.width = Math.round(exportWidthFeet * scale);
    canvas.height = Math.round(exportHeightFeet * scale);

    await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const context = canvas.getContext("2d");
        context.fillStyle = "#f3e6d2";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(svgUrl);
        resolve();
      };
      image.onerror = reject;
      image.src = svgUrl;
    });

    const downloadUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `booth-layout-${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
    setSaveStatus(`Exported PNG at ${canvas.width} x ${canvas.height}.`);
  } catch (error) {
    console.error(error);
    setSaveStatus("Export failed in this browser.");
  } finally {
    exportImageBtn.disabled = false;
  }
}

svg.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const mouse = getSvgPoint(event.clientX, event.clientY);
    const worldBefore = screenToWorld(event.clientX, event.clientY);
    const zoomFactor = event.deltaY < 0 ? 1.08 : 0.92;
    const nextZoom = clamp(state.camera.zoom * zoomFactor, 6, 64);
    state.camera.zoom = nextZoom;
    state.camera.x = mouse.x - worldBefore.x * nextZoom;
    state.camera.y = mouse.y - worldBefore.y * nextZoom;
    persistState();
    render();
  },
  { passive: false }
);

svg.addEventListener("pointerdown", (event) => {
  closeColorPicker();
  const targetSectionId = event.target.dataset.sectionId ? Number(event.target.dataset.sectionId) : null;
  const onBooth = event.target.dataset.role === "booth";

  if (event.button === 0) {
    if (targetSectionId) {
      const section = getSectionById(targetSectionId);
      if (!section) {
        return;
      }
      const world = screenToWorld(event.clientX, event.clientY);
      const interactionInfo = getInteractionType(section, world);
      state.interaction = {
        type: interactionInfo.mode,
        sectionId: targetSectionId,
        startPointer: world,
        startRect: { ...section },
        edges: interactionInfo.edges,
        moved: false,
      };
      setSelectedSection(targetSectionId);
    } else if (onBooth) {
      const world = screenToWorld(event.clientX, event.clientY);
      if (!isPointInsideBooth(world)) {
        return;
      }
      state.interaction = {
        type: "create",
        start: {
          x: clamp(roundToSnap(world.x), 0, state.booth.width),
          y: clamp(roundToSnap(world.y), 0, state.booth.length),
        },
        draftRect: null,
      };
      setSelectedSection(null);
      updateDraftOverlay();
    } else {
      setSelectedSection(null);
    }
  }

  if (event.button === 2 && onBooth) {
    state.interaction = {
      type: "pan",
      startClient: { x: event.clientX, y: event.clientY },
      startCamera: { ...state.camera },
    };
  }
});

svg.addEventListener("pointermove", (event) => {
  if (!state.interaction) {
    return;
  }

  if (state.interaction.type === "pan") {
    state.camera.x = state.interaction.startCamera.x + (event.clientX - state.interaction.startClient.x);
    state.camera.y = state.interaction.startCamera.y + (event.clientY - state.interaction.startClient.y);
    renderCamera();
    return;
  }

  const world = screenToWorld(event.clientX, event.clientY);

  if (state.interaction.type === "create") {
    state.interaction.draftRect = normalizeRect(state.interaction.start, {
      x: clamp(world.x, 0, state.booth.width),
      y: clamp(world.y, 0, state.booth.length),
    });
    updateDraftOverlay();
    return;
  }

  const section = getSectionById(state.interaction.sectionId);
  if (!section) {
    return;
  }

  state.interaction.moved =
    state.interaction.moved ||
    Math.abs(world.x - state.interaction.startPointer.x) > SNAP / 2 ||
    Math.abs(world.y - state.interaction.startPointer.y) > SNAP / 2;

  if (state.interaction.type === "move") {
    const dx = roundToSnap(world.x - state.interaction.startPointer.x);
    const dy = roundToSnap(world.y - state.interaction.startPointer.y);
    section.x = clamp(roundToSnap(state.interaction.startRect.x + dx), 0, state.booth.width - section.width);
    section.y = clamp(roundToSnap(state.interaction.startRect.y + dy), 0, state.booth.length - section.height);
    render();
    return;
  }

  if (state.interaction.type === "resize") {
    let left = state.interaction.startRect.x;
    let top = state.interaction.startRect.y;
    let right = state.interaction.startRect.x + state.interaction.startRect.width;
    let bottom = state.interaction.startRect.y + state.interaction.startRect.height;

    if (state.interaction.edges.left) {
      left = clamp(roundToSnap(world.x), 0, right - SNAP);
    }
    if (state.interaction.edges.right) {
      right = clamp(roundToSnap(world.x), left + SNAP, state.booth.width);
    }
    if (state.interaction.edges.top) {
      top = clamp(roundToSnap(world.y), 0, bottom - SNAP);
    }
    if (state.interaction.edges.bottom) {
      bottom = clamp(roundToSnap(world.y), top + SNAP, state.booth.length);
    }

    section.x = left;
    section.y = top;
    section.width = roundDimension(right - left);
    section.height = roundDimension(bottom - top);
    render();
  }
});

window.addEventListener("pointerup", () => {
  if (!state.interaction) {
    return;
  }

  const completedInteraction = state.interaction;

  if (completedInteraction.type === "create") {
    const draft = completedInteraction.draftRect;
    state.interaction = null;
    if (draft && draft.width >= SNAP && draft.height >= SNAP) {
      createSection(draft);
    } else {
      render();
    }
    updateDraftOverlay();
    return;
  }

  state.interaction = null;
  updateDraftOverlay();

  if (completedInteraction.type === "pan") {
    persistState();
    return;
  }

  if (completedInteraction.moved) {
    persistState();
    return;
  }

  const now = Date.now();
  if (
    state.lastLeftClick.id === completedInteraction.sectionId &&
    now - state.lastLeftClick.time <= CLICK_WINDOW_MS
  ) {
    state.lastLeftClick = { id: null, time: 0 };
    openSectionEditor(completedInteraction.sectionId);
    return;
  }

  state.lastLeftClick = { id: completedInteraction.sectionId, time: now };
});

svg.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  const sectionId = event.target.dataset.sectionId ? Number(event.target.dataset.sectionId) : null;

  if (!sectionId) {
    state.lastRightClick = { id: null, time: 0 };
    return;
  }

  const now = Date.now();
  if (state.lastRightClick.id === sectionId && now - state.lastRightClick.time <= CLICK_WINDOW_MS) {
    state.lastRightClick = { id: null, time: 0 };
    duplicateSection(sectionId);
    closeColorPicker();
    return;
  }

  state.lastRightClick = { id: sectionId, time: now };
  openColorPicker(sectionId, event.clientX, event.clientY);
});

boothSizeButton.addEventListener("dblclick", () => {
  openBoothDialog();
});

boothSizeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.booth.width = Math.max(1, Math.round(Number(boothWidthInput.value)));
  state.booth.length = Math.max(1, Math.round(Number(boothLengthInput.value)));
  fitSectionsToBooth();
  boothSizeDialog.close();
  saveAndRender();
});

cancelBoothSizeBtn.addEventListener("click", () => {
  boothSizeDialog.close();
});

sectionEditForm.addEventListener("submit", (event) => {
  event.preventDefault();
  applySectionEdit();
  sectionEditDialog.close();
});

cancelSectionEditBtn.addEventListener("click", () => {
  sectionEditDialog.close();
});

deleteSectionBtn.addEventListener("click", () => {
  removeSelectedSection();
});

resetLayoutBtn.addEventListener("click", () => {
  resetLayout();
});

shareSessionBtn.addEventListener("click", async () => {
  await startSharedSession();
});

copySessionBtn.addEventListener("click", async () => {
  await copySessionUrl();
});

exportImageBtn.addEventListener("click", async () => {
  await exportLayoutAsImage();
});

sectionColorInput.addEventListener("input", (event) => {
  if (!state.colorTargetId) {
    return;
  }
  const section = getSectionById(state.colorTargetId);
  if (!section) {
    return;
  }
  section.color = event.target.value;
  saveAndRender();
});

window.addEventListener("keydown", (event) => {
  if ((event.key === "Delete" || event.key === "Backspace") && state.selectedSectionId) {
    if (!isTypingTarget(document.activeElement) && !hasOpenDialog()) {
      event.preventDefault();
      removeSelectedSection();
    }
    return;
  }

  if (event.key === "Escape") {
    state.interaction = null;
    closeColorPicker();
    updateDraftOverlay();
    return;
  }

  if (!state.selectedSectionId || isTypingTarget(document.activeElement) || hasOpenDialog()) {
    return;
  }

  const step = event.shiftKey ? 1 : SNAP;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveSelectedSectionBy(-step, 0);
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    moveSelectedSectionBy(step, 0);
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSelectedSectionBy(0, -step);
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSelectedSectionBy(0, step);
  }
});

window.addEventListener("click", (event) => {
  if (!colorPickerPopover.hidden && !colorPickerPopover.contains(event.target)) {
    closeColorPicker();
  }
});

window.addEventListener("resize", () => {
  render();
});

window.addEventListener("beforeunload", () => {
  destroyCollaboration();
});

loadSavedState();
render();
persistLocalSnapshot();

const initialRoomId = getRoomIdFromUrl();
if (initialRoomId) {
  collaboration.roomId = initialRoomId;
  ensureCollaboration(initialRoomId);
} else if (isHostedSessionCapable()) {
  setSessionStatus(
    firebaseEnabled
      ? "This layout is local until you create a live room link."
      : "Fill in firebase-config.js and publish again to enable shared rooms."
  );
} else {
  setSessionStatus("Open this app from a hosted URL to collaborate live.");
}

renderHud();
