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
const STORAGE_KEY = "booth-designer-state-v3";
const ROOM_PARAM = "room";
const EXPORT_PADDING_FEET = 1;
const EXPORT_PIXELS_PER_FOOT = 160;
const EXPORT_MAX_DIMENSION = 12000;
const MM_PER_FOOT = 304.8;
const DISPLAY_HEIGHT_FT = 900 / MM_PER_FOOT;
const LIGHT_FRAME_HEIGHT_FT = 2000 / MM_PER_FOOT;
const LIGHT_FRAME_DEPTH_FT = 4 / INCHES_PER_FOOT;
const CELL_OF_FUTURE_HEIGHT_FT = 8;
const SIGN_WIDTH_RATIO = 0.44;
const SIGN_HEIGHT_FT = 1.55;
const SIGN_BOTTOM_CLEARANCE_FT = 4.2;
const MEETING_TABLE_DIAMETER_FT = 600 / MM_PER_FOOT;
const MEETING_TABLE_HEIGHT_FT = 1050 / MM_PER_FOOT;
const MEETING_CHAIR_HEIGHT_FT = 750 / MM_PER_FOOT;
const PREVIEW_VIEWBOX = { width: 1200, height: 420 };
const PREVIEW_SCALE_X = 14;
const PREVIEW_SCALE_Y = 7.4;
const PREVIEW_SCALE_Z = 22;

function getDefaultSections() {
  return [
    { id: 1, name: "Closet", color: "#2d6cdf", x: 0, y: 0, width: 3, height: 4 },
    { id: 2, name: "Backdrop", color: "#2d6cdf", x: 3, y: 0, width: 1, height: 20 },
    { id: 3, name: "S65T & S145-P", color: "#2d6cdf", x: 4, y: 1.1, width: 10, height: 5 },
    { id: 4, name: "S25T", color: "#2d6cdf", x: 14.1, y: 1.1, width: 4, height: roundDimension(28 / INCHES_PER_FOOT) },
    { id: 5, name: "Closet", color: "#2d6cdf", x: 0, y: 16, width: 3, height: 4 },
    { id: 6, name: "Axiom", color: "#2d6cdf", x: 4, y: 13, width: 6, height: 6 },
    { id: 7, name: "Trimos HG1", color: "#2d6cdf", x: 17, y: 7.7, width: 4, height: roundDimension(28 / INCHES_PER_FOOT) },
    { id: 8, name: "Trimos HG2", color: "#2d6cdf", x: 21, y: 7.7, width: 4, height: roundDimension(28 / INCHES_PER_FOOT) },
    { id: 9, name: "Trimos HB1", color: "#2d6cdf", x: 17, y: 11.7, width: 4, height: roundDimension(28 / INCHES_PER_FOOT) },
    { id: 10, name: "Trimos HB2", color: "#2d6cdf", x: 21, y: 11.7, width: 4, height: roundDimension(28 / INCHES_PER_FOOT) },
    { id: 11, name: "Baty FV", color: "#2d6cdf", x: 20, y: 16.7, width: 4, height: roundDimension(28 / INCHES_PER_FOOT) },
    { id: 12, name: "Baty FH", color: "#2d6cdf", x: 24.2, y: 16.7, width: 4, height: roundDimension(28 / INCHES_PER_FOOT) },
    { id: 13, name: "Bowers BG1", color: "#2d6cdf", x: 30, y: 16.7, width: 4, height: roundDimension(28 / INCHES_PER_FOOT) },
    { id: 14, name: "Bowers BG2", color: "#2d6cdf", x: 34, y: 16.7, width: 4, height: roundDimension(28 / INCHES_PER_FOOT) },
    { id: 15, name: "Measur3D", color: "#2d6cdf", x: 30, y: 1.1, width: 4, height: 4 },
    { id: 16, name: "ZCAT", color: "#2d6cdf", x: 36, y: 1.1, width: 4, height: 4 },
    { id: 17, name: "Meeting Area 1", color: "#2d6cdf", x: 30.2, y: 7.1, width: 6, height: 6 },
    { id: 18, name: "Meeting Area 2", color: "#2d6cdf", x: 38.4, y: 7.1, width: 6, height: 6 },
    { id: 19, name: "Cell of Future", color: "#2d6cdf", x: 40, y: 16, width: 8, height: 3 },
    { id: 20, name: "ZCAT Auto", color: "#2d6cdf", x: 49.2, y: 1.1, width: roundDimension(46 / INCHES_PER_FOOT), height: roundDimension(40 / INCHES_PER_FOOT) },
    { id: 21, name: "Fastener Auto", color: "#2d6cdf", x: 56.2, y: 1.1, width: roundDimension(46 / INCHES_PER_FOOT), height: roundDimension(40 / INCHES_PER_FOOT) },
    { id: 22, name: "Extol & Bore Auto", color: "#2d6cdf", x: 51.7, y: 15.7, width: roundDimension(100 / INCHES_PER_FOOT), height: roundDimension(40 / INCHES_PER_FOOT) },
  ].map((section) => normalizeSection(section));
}

const defaultState = () => ({
  booth: { width: 60, length: 20 },
  sections: getDefaultSections(),
  selectedSectionId: null,
  nextSectionId: 23,
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
const preview3dSvg = document.getElementById("preview3dSvg");
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

    const parsed = JSON.parse(raw);
    applySnapshot(parsed);
    if (!Array.isArray(parsed?.sections) || parsed.sections.length === 0) {
      state.sections = getDefaultSections();
      state.nextSectionId = Math.max(
        state.nextSectionId,
        state.sections.reduce((maxId, section) => Math.max(maxId, section.id + 1), 1)
      );
    }
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

function createSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tagName);
  Object.entries(attributes).forEach(([name, value]) => {
    if (value !== undefined && value !== null) {
      element.setAttribute(name, String(value));
    }
  });
  return element;
}

function pointsToPath(points) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function render3dPreview() {
  if (!preview3dSvg) {
    return;
  }

  preview3dSvg.innerHTML = "";
  preview3dSvg.setAttribute("viewBox", `0 0 ${PREVIEW_VIEWBOX.width} ${PREVIEW_VIEWBOX.height}`);

  const defs = createSvgElement("defs");
  defs.appendChild(
    createSvgElement("linearGradient", { id: "floorGradient3d", x1: "0%", y1: "0%", x2: "100%", y2: "100%" })
  );
  defs.lastChild.appendChild(createSvgElement("stop", { offset: "0%", "stop-color": "#efdfc1" }));
  defs.lastChild.appendChild(createSvgElement("stop", { offset: "100%", "stop-color": "#d4bb95" }));
  defs.appendChild(
    createSvgElement("linearGradient", { id: "wallBannerGradient3d", x1: "0%", y1: "0%", x2: "100%", y2: "0%" })
  );
  defs.lastChild.appendChild(createSvgElement("stop", { offset: "0%", "stop-color": "#1e4088" }));
  defs.lastChild.appendChild(createSvgElement("stop", { offset: "100%", "stop-color": "#305fbc" }));
  preview3dSvg.appendChild(defs);

  const scene = createSvgElement("g");
  preview3dSvg.appendChild(scene);

  const originX = PREVIEW_VIEWBOX.width / 2 + (state.booth.length - state.booth.width) * PREVIEW_SCALE_X * 0.18;
  const originY = PREVIEW_VIEWBOX.height * 0.82;

  const project = (x, y, z = 0) => ({
    x: originX + (x - y) * PREVIEW_SCALE_X,
    y: originY + (x + y) * PREVIEW_SCALE_Y - z * PREVIEW_SCALE_Z,
  });

  const appendPolygon = (points, attributes) => {
    scene.appendChild(createSvgElement("polygon", { points: pointsToPath(points), ...attributes }));
  };

  const appendLine = (start, end, attributes) => {
    scene.appendChild(
      createSvgElement("line", { x1: start.x, y1: start.y, x2: end.x, y2: end.y, ...attributes })
    );
  };

  const appendEllipse = (center, rx, ry, attributes) => {
    scene.appendChild(createSvgElement("ellipse", { cx: center.x, cy: center.y, rx, ry, ...attributes }));
  };

  const appendText = (point, label, attributes = {}) => {
    const text = createSvgElement("text", {
      x: point.x,
      y: point.y,
      fill: "#f7f2ea",
      "font-size": 12,
      "font-family": 'Aptos, "Segoe UI", sans-serif',
      "font-weight": 700,
      "text-anchor": "middle",
      ...attributes,
    });
    text.textContent = label;
    scene.appendChild(text);
  };

  const renderPrism = (x, y, width, depth, height, colors, selected = false, zBase = 0) => {
    const p000 = project(x, y, zBase);
    const p100 = project(x + width, y, zBase);
    const p110 = project(x + width, y + depth, zBase);
    const p010 = project(x, y + depth, zBase);
    const p001 = project(x, y, zBase + height);
    const p101 = project(x + width, y, zBase + height);
    const p111 = project(x + width, y + depth, zBase + height);
    const p011 = project(x, y + depth, zBase + height);
    const stroke = selected ? "#ffe28a" : colors.stroke;

    appendPolygon([p010, p110, p111, p011], {
      fill: colors.front,
      stroke,
      "stroke-width": selected ? 2.4 : 1.2,
    });
    appendPolygon([p100, p110, p111, p101], {
      fill: colors.side,
      stroke,
      "stroke-width": selected ? 2.4 : 1.2,
    });
    appendPolygon([p001, p101, p111, p011], {
      fill: colors.top,
      stroke,
      "stroke-width": selected ? 2.4 : 1.2,
    });
  };

  const renderLightFrame = (section, selected) => {
    const postWidth = Math.min(0.16, section.width * 0.12);
    const rearY = section.y + Math.max(section.height - LIGHT_FRAME_DEPTH_FT, 0.08);
    const colors = { top: "#6f95eb", front: "#2b5dc1", side: "#1f4a9c", stroke: "#244b8f" };

    renderPrism(section.x, rearY, postWidth, LIGHT_FRAME_DEPTH_FT, LIGHT_FRAME_HEIGHT_FT, colors, selected);
    renderPrism(section.x + section.width - postWidth, rearY, postWidth, LIGHT_FRAME_DEPTH_FT, LIGHT_FRAME_HEIGHT_FT, colors, selected);
    renderPrism(section.x, rearY, section.width, LIGHT_FRAME_DEPTH_FT, 0.18, colors, selected, LIGHT_FRAME_HEIGHT_FT - 0.18);

    const signWidth = Math.min(section.width * SIGN_WIDTH_RATIO, section.width - postWidth * 1.8);
    const signX = section.x + section.width - signWidth - postWidth * 0.65;
    const signY = rearY + LIGHT_FRAME_DEPTH_FT * 0.18;
    const signColors = { top: "#ffffff", front: "#f5f7fb", side: "#dfe8f6", stroke: "#2b5dc1" };
    renderPrism(
      signX,
      signY,
      signWidth,
      LIGHT_FRAME_DEPTH_FT * 0.8,
      LIGHT_FRAME_HEIGHT_FT - SIGN_BOTTOM_CLEARANCE_FT,
      signColors,
      selected,
      SIGN_BOTTOM_CLEARANCE_FT
    );
  };

  const renderDisplaySurface = (section, selected) => {
    const baseColors = { top: "#ffffff", front: "#ececec", side: "#d8d8d8", stroke: "#c7c7c7" };
    renderPrism(section.x, section.y, section.width, section.height, DISPLAY_HEIGHT_FT, baseColors, selected);

    const faceWidth = section.width * 0.68;
    const faceHeight = DISPLAY_HEIGHT_FT * 0.46;
    const faceX = section.x + (section.width - faceWidth) / 2;
    const faceY = section.y + section.height - 0.01;
    const faceBase = project(faceX, faceY, DISPLAY_HEIGHT_FT * 0.18);
    const faceRight = project(faceX + faceWidth, faceY, DISPLAY_HEIGHT_FT * 0.18);
    const faceTopRight = project(faceX + faceWidth, faceY, DISPLAY_HEIGHT_FT * 0.18 + faceHeight);
    const faceTopLeft = project(faceX, faceY, DISPLAY_HEIGHT_FT * 0.18 + faceHeight);
    appendPolygon([faceBase, faceRight, faceTopRight, faceTopLeft], {
      fill: "#fbfdff",
      stroke: selected ? "#ffe28a" : "#e7edf4",
      "stroke-width": selected ? 2 : 1,
    });
  };

  const renderMonitor = (centerX, centerY, zBase, selected) => {
    const standBottom = project(centerX, centerY, zBase);
    const standTop = project(centerX, centerY, zBase + 0.32);
    appendLine(standBottom, standTop, { stroke: "#1b1b1b", "stroke-width": 3 });
    const screenBottomLeft = project(centerX - 0.8, centerY, zBase + 0.55);
    const screenBottomRight = project(centerX + 0.8, centerY, zBase + 0.55);
    const screenTopRight = project(centerX + 0.8, centerY, zBase + 1.45);
    const screenTopLeft = project(centerX - 0.8, centerY, zBase + 1.45);
    appendPolygon([screenBottomLeft, screenBottomRight, screenTopRight, screenTopLeft], {
      fill: "#121212",
      stroke: selected ? "#ffe28a" : "#0f0f0f",
      "stroke-width": selected ? 2 : 1,
    });
    appendPolygon(
      [
        project(centerX - 0.66, centerY, zBase + 0.7),
        project(centerX + 0.66, centerY, zBase + 0.7),
        project(centerX + 0.66, centerY, zBase + 1.33),
        project(centerX - 0.66, centerY, zBase + 1.33),
      ],
      { fill: "#8cd0ff", opacity: 0.9 }
    );
  };

  const renderMachineBlock = (section, selected) => {
    const isSquare = Math.abs(section.width - section.height) < 0.55;
    const machineWidth = Math.min(section.width * 0.28, isSquare ? 1.05 : 1.4);
    const machineDepth = Math.min(section.height * 0.28, 1.1);
    const machineX = section.x + section.width * 0.2;
    const machineY = section.y + section.height * 0.2;
    const machineColors = { top: "#bfc5cd", front: "#8d949d", side: "#767d86", stroke: "#666d75" };
    renderPrism(machineX, machineY, machineWidth, machineDepth, DISPLAY_HEIGHT_FT * 1.24, machineColors, selected, DISPLAY_HEIGHT_FT);

    if (!isSquare) {
      renderMonitor(section.x + section.width * 0.67, section.y + section.height * 0.47, DISPLAY_HEIGHT_FT, selected);
      const keyboard = [
        project(section.x + section.width * 0.58, section.y + section.height * 0.62, DISPLAY_HEIGHT_FT + 0.02),
        project(section.x + section.width * 0.9, section.y + section.height * 0.62, DISPLAY_HEIGHT_FT + 0.02),
        project(section.x + section.width * 0.9, section.y + section.height * 0.84, DISPLAY_HEIGHT_FT + 0.02),
        project(section.x + section.width * 0.58, section.y + section.height * 0.84, DISPLAY_HEIGHT_FT + 0.02),
      ];
      appendPolygon(keyboard, { fill: "#101010", stroke: "#080808", "stroke-width": 1 });
    }
  };

  const renderDisplay = (section, selected) => {
    renderDisplaySurface(section, selected);
    renderLightFrame(section, selected);
    renderMachineBlock(section, selected);
  };

  const renderWideDisplay = (section, selected) => {
    renderDisplaySurface(section, selected);
    renderLightFrame(section, selected);
    const moduleCount = Math.max(2, Math.round(section.width / 2.8));
    for (let index = 0; index < moduleCount; index += 1) {
      const moduleWidth = Math.min(section.width / (moduleCount + 1), 1.1);
      const moduleX = section.x + 0.5 + index * (section.width - 1) / Math.max(moduleCount - 1, 1);
      renderPrism(
        moduleX,
        section.y + section.height * 0.2,
        moduleWidth,
        Math.min(0.95, section.height * 0.4),
        DISPLAY_HEIGHT_FT * 0.72,
        { top: "#d7dde3", front: "#b4bcc5", side: "#99a2ad", stroke: "#86909a" },
        selected,
        DISPLAY_HEIGHT_FT
      );
    }
  };

  const renderAxiom = (section, selected) => {
    const frameColors = { top: "#a3abb5", front: "#717985", side: "#5e6672", stroke: "#525965" };
    const accentColors = { top: "#5677d6", front: "#315cc1", side: "#274b9a", stroke: "#24478f" };
    const baseHeight = 2.5;
    const bridgeHeight = 3.4;

    renderPrism(section.x + 0.45, section.y + 0.45, section.width - 0.9, section.height - 0.9, baseHeight, {
      top: "#4a4f57",
      front: "#1f2328",
      side: "#171b20",
      stroke: "#101418",
    }, selected);

    renderPrism(section.x + 0.65, section.y + 0.65, section.width - 1.3, section.height - 1.3, 0.32, {
      top: "#5d6169",
      front: "#8d939b",
      side: "#7a828c",
      stroke: "#656d77",
    }, selected, baseHeight);

    renderPrism(section.x + section.width - 1.05, section.y + 0.52, 0.62, section.height - 1.04, bridgeHeight, frameColors, selected, baseHeight);
    renderPrism(section.x + 0.85, section.y + 0.68, 0.44, 0.44, bridgeHeight - 0.2, frameColors, selected, baseHeight);
    renderPrism(section.x + section.width * 0.32, section.y + 0.7, section.width * 0.46, 0.34, 0.34, frameColors, selected, baseHeight + bridgeHeight - 0.34);

    renderPrism(section.x + section.width * 0.46, section.y + 1.05, 0.34, 0.34, 2.7, frameColors, selected, baseHeight + 0.2);

    const headX = section.x + section.width * 0.41;
    const headY = section.y + 0.9;
    renderPrism(headX, headY, 1.18, 0.72, 1.26, {
      top: "#8f96a1",
      front: "#626975",
      side: "#4f5662",
      stroke: "#444b56",
    }, selected, baseHeight + 2.04);
    renderPrism(headX + 0.22, headY + 0.18, 0.74, 0.32, 0.74, accentColors, selected, baseHeight + 2.18);

    appendLine(
      project(section.x + section.width * 0.57, section.y + 1.22, baseHeight + 2.06),
      project(section.x + section.width * 0.57, section.y + 1.28, baseHeight + 0.86),
      { stroke: selected ? "#ffe28a" : "#1a1a1a", "stroke-width": 2.4, "stroke-linecap": "round" }
    );

    const tableTop = [
      project(section.x + 0.95, section.y + 0.95, baseHeight + 0.36),
      project(section.x + section.width - 1.25, section.y + 0.95, baseHeight + 0.36),
      project(section.x + section.width - 1.25, section.y + section.height - 1.1, baseHeight + 0.36),
      project(section.x + 0.95, section.y + section.height - 1.1, baseHeight + 0.36),
    ];
    appendPolygon(tableTop, { fill: "#14171b", stroke: "#363b42", "stroke-width": 1.2 });

    renderPrism(section.x + 1.55, section.y + 1.4, 0.86, 0.56, 0.22, accentColors, selected, baseHeight + 0.38);

    const armStart = project(section.x + 0.5, section.y + section.height * 0.65, 1.5);
    const armMid = project(section.x - 1.45, section.y + section.height * 0.74, 2.3);
    const armEnd = project(section.x - 1.65, section.y + section.height * 0.74, 4.6);
    appendLine(armStart, armMid, { stroke: selected ? "#ffe28a" : "#20242a", "stroke-width": 4, "stroke-linecap": "round" });
    appendLine(armMid, armEnd, { stroke: selected ? "#ffe28a" : "#20242a", "stroke-width": 4, "stroke-linecap": "round" });
    const screenBottomLeft = project(section.x - 2.6, section.y + section.height * 0.8, 3.25);
    const screenBottomRight = project(section.x - 0.95, section.y + section.height * 0.8, 3.25);
    const screenTopRight = project(section.x - 0.95, section.y + section.height * 0.8, 5.25);
    const screenTopLeft = project(section.x - 2.6, section.y + section.height * 0.8, 5.25);
    appendPolygon([screenBottomLeft, screenBottomRight, screenTopRight, screenTopLeft], {
      fill: "#1e1f24",
      stroke: selected ? "#ffe28a" : "#0d0f12",
      "stroke-width": 1.4,
    });
    appendPolygon(
      [
        project(section.x - 2.42, section.y + section.height * 0.8, 3.48),
        project(section.x - 1.1, section.y + section.height * 0.8, 3.48),
        project(section.x - 1.1, section.y + section.height * 0.8, 5.05),
        project(section.x - 2.42, section.y + section.height * 0.8, 5.05),
      ],
      { fill: "#9ed2ff", opacity: 0.85 }
    );
  };

  const renderExtol = (section, selected) => {
    const darkFrame = { top: "#7e8792", front: "#5e6670", side: "#474f5a", stroke: "#414852" };
    const blueShell = { top: "#4f73d3", front: "#1f49ae", side: "#183c90", stroke: "#163684" };
    const stageHeight = 0.95;
    const bodyHeight = 6.6;

    renderPrism(section.x + 0.75, section.y + 0.4, section.width * 0.36, section.height - 0.8, stageHeight, {
      top: "#444b54",
      front: "#1d2127",
      side: "#14181d",
      stroke: "#101419",
    }, selected);
    renderPrism(section.x + 0.92, section.y + 0.58, section.width * 0.31, section.height - 1.16, 0.24, {
      top: "#2b2f35",
      front: "#828a94",
      side: "#727b86",
      stroke: "#656d77",
    }, selected, stageHeight);

    renderPrism(section.x + 0.92, section.y + 0.68, section.width * 0.31, section.height - 1.36, bodyHeight, darkFrame, selected, stageHeight + 0.24);
    renderPrism(section.x + 1.02, section.y + 0.74, section.width * 0.27, section.height - 1.48, 1.18, blueShell, selected, stageHeight + 0.24);
    renderPrism(section.x + 1.02, section.y + 0.74, section.width * 0.27, section.height - 1.48, 1.28, blueShell, selected, stageHeight + bodyHeight - 0.9);

    renderPrism(section.x + section.width * 0.49, section.y + 0.9, 0.34, section.height - 1.8, 4.5, darkFrame, selected, stageHeight + 1.2);
    appendLine(
      project(section.x + section.width * 0.66, section.y + section.height * 0.52, stageHeight + bodyHeight - 1.35),
      project(section.x + section.width * 0.66, section.y + section.height * 0.52, stageHeight + 1.55),
      { stroke: selected ? "#ffe28a" : "#121314", "stroke-width": 2.4, "stroke-linecap": "round" }
    );

    const monitorArmBase = project(section.x + section.width * 0.94, section.y + section.height * 0.62, 2.1);
    const monitorArmMid = project(section.x + section.width + 0.55, section.y + section.height * 0.65, 3.25);
    const monitorArmTop = project(section.x + section.width + 0.7, section.y + section.height * 0.65, 5.5);
    appendLine(monitorArmBase, monitorArmMid, { stroke: selected ? "#ffe28a" : "#20242a", "stroke-width": 4, "stroke-linecap": "round" });
    appendLine(monitorArmMid, monitorArmTop, { stroke: selected ? "#ffe28a" : "#20242a", "stroke-width": 4, "stroke-linecap": "round" });
    const topScreen = [
      project(section.x + section.width + 0.15, section.y + section.height * 0.74, 4.85),
      project(section.x + section.width + 1.95, section.y + section.height * 0.74, 4.85),
      project(section.x + section.width + 1.95, section.y + section.height * 0.74, 6.45),
      project(section.x + section.width + 0.15, section.y + section.height * 0.74, 6.45),
    ];
    const bottomScreen = [
      project(section.x + section.width + 0.18, section.y + section.height * 0.74, 2.6),
      project(section.x + section.width + 1.85, section.y + section.height * 0.74, 2.6),
      project(section.x + section.width + 1.85, section.y + section.height * 0.74, 4.2),
      project(section.x + section.width + 0.18, section.y + section.height * 0.74, 4.2),
    ];
    [topScreen, bottomScreen].forEach((screen) => {
      appendPolygon(screen, {
        fill: "#1d1f24",
        stroke: selected ? "#ffe28a" : "#0d0f12",
        "stroke-width": 1.4,
      });
    });
    appendPolygon(
      [
        project(section.x + section.width + 0.35, section.y + section.height * 0.74, 5.05),
        project(section.x + section.width + 1.75, section.y + section.height * 0.74, 5.05),
        project(section.x + section.width + 1.75, section.y + section.height * 0.74, 6.2),
        project(section.x + section.width + 0.35, section.y + section.height * 0.74, 6.2),
      ],
      { fill: "#c6e5ff", opacity: 0.85 }
    );
  };

  const renderCellOfFuture = (section, selected) => {
    const frameColors = { top: "#cdd3db", front: "#9ea6b0", side: "#7b838e", stroke: "#68707b" };
    const topColors = { top: "#f5f7fb", front: "#dfe4ea", side: "#c8ced6", stroke: "#b8bfc8" };

    renderPrism(section.x, section.y, section.width, section.height, 0.18, frameColors, selected, 0);
    renderPrism(section.x, section.y, section.width, section.height, 0.18, frameColors, selected, DISPLAY_HEIGHT_FT - 0.18);

    [
      [section.x, section.y],
      [section.x + section.width - 0.18, section.y],
      [section.x, section.y + section.height - 0.18],
      [section.x + section.width - 0.18, section.y + section.height - 0.18],
    ].forEach(([x, y]) => {
      renderPrism(x, y, 0.18, 0.18, CELL_OF_FUTURE_HEIGHT_FT, frameColors, selected);
    });

    renderPrism(section.x, section.y, section.width, 0.18, 0.18, frameColors, selected, CELL_OF_FUTURE_HEIGHT_FT - 0.18);
    renderPrism(section.x, section.y + section.height - 0.18, section.width, 0.18, 0.18, frameColors, selected, CELL_OF_FUTURE_HEIGHT_FT - 0.18);
    renderPrism(section.x, section.y, 0.18, section.height, 0.18, frameColors, selected, CELL_OF_FUTURE_HEIGHT_FT - 0.18);
    renderPrism(section.x + section.width - 0.18, section.y, 0.18, section.height, 0.18, frameColors, selected, CELL_OF_FUTURE_HEIGHT_FT - 0.18);

    renderPrism(section.x, section.y, section.width, section.height, 0.12, topColors, selected, DISPLAY_HEIGHT_FT);

    const drawerWidth = Math.min(1.45, section.width * 0.24);
    const drawerDepth = Math.min(1.08, section.height * 0.88);
    const drawerHeight = DISPLAY_HEIGHT_FT - 0.18;
    renderPrism(section.x + 0.24, section.y + 0.12, drawerWidth, drawerDepth, drawerHeight, frameColors, selected);
    renderPrism(section.x + section.width - drawerWidth - 0.24, section.y + 0.12, drawerWidth, drawerDepth, drawerHeight, frameColors, selected);

    for (let index = 1; index <= 3; index += 1) {
      const z = 0.2 + index * (drawerHeight / 4);
      const leftHandleStart = project(section.x + 0.46, section.y + drawerDepth, z);
      const leftHandleEnd = project(section.x + drawerWidth + 0.02, section.y + drawerDepth, z);
      const rightHandleStart = project(section.x + section.width - drawerWidth + 0.2, section.y + drawerDepth, z);
      const rightHandleEnd = project(section.x + section.width - 0.46, section.y + drawerDepth, z);
      appendLine(leftHandleStart, leftHandleEnd, { stroke: selected ? "#ffe28a" : "#dbe2ea", "stroke-width": 1.8 });
      appendLine(rightHandleStart, rightHandleEnd, { stroke: selected ? "#ffe28a" : "#dbe2ea", "stroke-width": 1.8 });
    }

    const gantryY = section.y + section.height - 0.22;
    renderPrism(section.x + 0.34, gantryY, section.width - 0.68, 0.16, 0.16, frameColors, selected, DISPLAY_HEIGHT_FT + 2.45);
    renderPrism(section.x + 0.4, gantryY, 0.16, 0.16, 2.6, frameColors, selected, DISPLAY_HEIGHT_FT + 0.28);
    renderPrism(section.x + section.width - 0.56, gantryY, 0.16, 0.16, 2.6, frameColors, selected, DISPLAY_HEIGHT_FT + 0.28);

    const screenBottomLeft = project(section.x + 1.2, section.y + section.height - 0.02, DISPLAY_HEIGHT_FT + 1.45);
    const screenBottomRight = project(section.x + section.width - 1.2, section.y + section.height - 0.02, DISPLAY_HEIGHT_FT + 1.45);
    const screenTopRight = project(section.x + section.width - 1.2, section.y + section.height - 0.02, DISPLAY_HEIGHT_FT + 3.55);
    const screenTopLeft = project(section.x + 1.2, section.y + section.height - 0.02, DISPLAY_HEIGHT_FT + 3.55);
    appendPolygon([screenBottomLeft, screenBottomRight, screenTopRight, screenTopLeft], {
      fill: "rgba(165, 222, 255, 0.20)",
      stroke: selected ? "#ffe28a" : "rgba(190, 232, 255, 0.7)",
      "stroke-width": selected ? 2.1 : 1.2,
    });

    [
      { x: section.x + 1.4, y: section.y + 0.54, height: 1.78 },
      { x: section.x + section.width - 1.65, y: section.y + 0.7, height: 1.52 },
    ].forEach((probe) => {
      renderPrism(probe.x, probe.y, 0.52, 0.52, 0.26, { top: "#8f98a1", front: "#6e7680", side: "#5d6670", stroke: "#535b65" }, selected, DISPLAY_HEIGHT_FT);
      renderPrism(probe.x + 0.16, probe.y + 0.16, 0.12, 0.12, probe.height, { top: "#a3acb8", front: "#8993a0", side: "#747f8b", stroke: "#67717d" }, selected, DISPLAY_HEIGHT_FT + 0.26);
      appendLine(
        project(probe.x + 0.22, probe.y + 0.22, DISPLAY_HEIGHT_FT + 0.26 + probe.height),
        project(probe.x + 0.22, probe.y + 0.48, DISPLAY_HEIGHT_FT + 0.5),
        { stroke: "#2555b6", "stroke-width": 2.2, "stroke-linecap": "round" }
      );
    });

    renderMonitor(section.x + section.width * 0.5, section.y + section.height * 0.56, DISPLAY_HEIGHT_FT, selected);
  };

  const renderCloset = (section, selected) => {
    renderPrism(
      section.x,
      section.y,
      section.width,
      section.height,
      LIGHT_FRAME_HEIGHT_FT + 0.9,
      { top: "#fcfcfc", front: "#ececec", side: "#d8d8d8", stroke: "#c6c6c6" },
      selected
    );
  };

  const renderBackdrop = (section, selected) => {
    renderPrism(
      section.x,
      section.y,
      section.width,
      section.height,
      LIGHT_FRAME_HEIGHT_FT + 0.35,
      { top: "#6f95eb", front: "url(#wallBannerGradient3d)", side: "#244c9d", stroke: "#23498a" },
      selected
    );
  };

  const renderMeetingArea = (section, selected) => {
    const zone = [
      project(section.x, section.y, 0.01),
      project(section.x + section.width, section.y, 0.01),
      project(section.x + section.width, section.y + section.height, 0.01),
      project(section.x, section.y + section.height, 0.01),
    ];
    appendPolygon(zone, {
      fill: selected ? "rgba(255, 226, 138, 0.18)" : "rgba(255,255,255,0.06)",
      stroke: selected ? "#ffe28a" : "rgba(255,255,255,0.12)",
      "stroke-width": selected ? 2.4 : 1,
    });

    const centerX = section.x + section.width / 2;
    const centerY = section.y + section.height / 2;
    const tableCenter = project(centerX, centerY, MEETING_TABLE_HEIGHT_FT);
    appendEllipse(tableCenter, MEETING_TABLE_DIAMETER_FT * PREVIEW_SCALE_X * 0.62, MEETING_TABLE_DIAMETER_FT * PREVIEW_SCALE_Y * 1.05, {
      fill: "#fefefe",
      stroke: "#e6e6e6",
      "stroke-width": 1.4,
    });

    [
      [0, 0.12],
      [2.09, 0.24],
      [4.18, 0.18],
    ].forEach(([angle, offset]) => {
      const legStart = project(centerX + Math.cos(angle) * offset, centerY + Math.sin(angle) * offset, MEETING_TABLE_HEIGHT_FT - 0.05);
      const legEnd = project(centerX + Math.cos(angle) * 0.55, centerY + Math.sin(angle) * 0.55, 0);
      appendLine(legStart, legEnd, { stroke: "#b88a59", "stroke-width": 3.4, "stroke-linecap": "round" });
    });

    const stoolRadius = Math.min(section.width, section.height) * 0.33;
    [Math.PI * 1.08, Math.PI * 1.72, Math.PI * 0.12].forEach((angle) => {
      const chairX = centerX + Math.cos(angle) * stoolRadius;
      const chairY = centerY + Math.sin(angle) * stoolRadius;
      const seatCenter = project(chairX, chairY, MEETING_CHAIR_HEIGHT_FT);
      appendEllipse(seatCenter, 22, 9.5, {
        fill: "#fefefe",
        stroke: selected ? "#ffe28a" : "#dfdfdf",
        "stroke-width": selected ? 1.8 : 1,
      });
      [
        [0.18, 0.16],
        [-0.18, 0.18],
        [0, -0.22],
      ].forEach(([dx, dy]) => {
        appendLine(
          project(chairX + dx, chairY + dy, MEETING_CHAIR_HEIGHT_FT - 0.06),
          project(chairX + dx * 1.85, chairY + dy * 1.85, 0),
          { stroke: "#b88a59", "stroke-width": 2.7, "stroke-linecap": "round" }
        );
      });
      appendLine(
        project(chairX - 0.22, chairY + 0.1, 0.86),
        project(chairX + 0.22, chairY + 0.1, 0.86),
        { stroke: "#2b2b2b", "stroke-width": 2 }
      );
    });
  };

  const getSectionKind = (section) => {
    if (/meeting area/i.test(section.name)) {
      return "meeting";
    }
    if (/axiom/i.test(section.name)) {
      return "axiom";
    }
    if (/extol/i.test(section.name)) {
      return "extol";
    }
    if (/cell of future/i.test(section.name)) {
      return "cell";
    }
    if (/backdrop/i.test(section.name)) {
      return "backdrop";
    }
    if (/closet/i.test(section.name)) {
      return "closet";
    }
    if (/s65t|s145|cell of future|auto/i.test(section.name) || section.width >= 6) {
      return "wide";
    }
    return "display";
  };

  const floor = [
    project(0, 0, 0),
    project(state.booth.width, 0, 0),
    project(state.booth.width, state.booth.length, 0),
    project(0, state.booth.length, 0),
  ];
  appendPolygon(floor, { fill: "url(#floorGradient3d)", stroke: "#c7a470", "stroke-width": 2 });

  const border = [
    project(0, 0, 0.01),
    project(state.booth.width, 0, 0.01),
    project(state.booth.width, state.booth.length, 0.01),
    project(0, state.booth.length, 0.01),
  ];
  appendPolygon(border, { fill: "none", stroke: "rgba(255,255,255,0.18)", "stroke-width": 1 });

  state.sections
    .slice()
    .sort((left, right) => left.x + left.y + left.height - (right.x + right.y + right.height))
    .forEach((section) => {
      const selected = section.id === state.selectedSectionId;
      const kind = getSectionKind(section);

      if (kind === "backdrop") {
        renderBackdrop(section, selected);
      } else if (kind === "closet") {
        renderCloset(section, selected);
      } else if (kind === "axiom") {
        renderAxiom(section, selected);
      } else if (kind === "extol") {
        renderExtol(section, selected);
      } else if (kind === "cell") {
        renderCellOfFuture(section, selected);
      } else if (kind === "meeting") {
        renderMeetingArea(section, selected);
      } else if (kind === "wide") {
        renderWideDisplay(section, selected);
      } else {
        renderDisplay(section, selected);
      }

      appendText(project(section.x + section.width / 2, section.y + section.height + 0.7, 0), section.name, {
        fill: selected ? "#ffe28a" : "rgba(255,255,255,0.92)",
        "font-size": selected ? 13 : 12,
      });
    });
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
  render3dPreview();
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
