const SPRITE_BASE = "/api/nosapki-sprites";
const SHADOW_SRC = "https://nosapki.com/images/nt-images/shadow.png";

const JOB_CLASS = {
  Adventurer: 0,
  Swordsman: 1,
  Archer: 2,
  Mage: 3,
  MartialArtist: 4,
};

const HAIR_RECOLOR_HEX = {
  1: "ee6666",
  2: "ff8800",
  3: "cc8844",
  4: "998877",
  5: "aabbcc",
  6: "ffdd55",
  7: "77cc99",
  8: "88ccff",
  9: "bb88ee",
  10: "eedd55",
};

const NOSAPKI_VIEW_WIDTH = 500;
const NOSAPKI_VIEW_HEIGHT = 400;
const NOSAPKI_CONTENT_WIDTH = 60;
const NOSAPKI_CONTENT_HEIGHT = 117;
const NOSAPKI_CONTENT_CENTER_X = 251;
const NOSAPKI_CONTENT_CENTER_Y = 245.5;
const NOSAPKI_CONTENT_PADDING = 1.15;
const DEFAULT_PREVIEW_ZOOM = 0.6;

function hairRecolorHex(colourId) {
  const key = String(colourId);
  return HAIR_RECOLOR_HEX[key] || HAIR_RECOLOR_HEX[1];
}

function hexToRgb(hex) {
  const value = parseInt(hex.replace(/^#/, ""), 16);
  return {
    r: (value >>> 16) & 0xff,
    g: (value >>> 8) & 0xff,
    b: value & 0xff,
  };
}

function characterSpritePath(config, layer) {
  const gender = config.gender || "female";
  const job = config.job || "Adventurer";
  const hairStyle = config.hairStyle || "A";
  const classId = JOB_CLASS[job] ?? 0;
  const hairIndex = hairStyle === "B" ? 1 : 0;
  const pose = 2;
  const direction = 0;
  if (layer === "hairs") {
    return `${SPRITE_BASE}/hairs/${gender}/class_${classId}/${pose}/${hairIndex}.png`;
  }
  return `${SPRITE_BASE}/${layer}/${gender}/class_${classId}/${pose}/${direction}.png`;
}

function recolorHairImage(sourceImage, hexColor) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = sourceImage.naturalWidth;
  canvas.height = sourceImage.naturalHeight;
  ctx.drawImage(sourceImage, 0, 0);
  const originalPixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const currentPixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const tint = hexToRgb(hexColor);
  for (let index = 0; index < originalPixels.data.length; index += 4) {
    if (currentPixels.data[index + 3] > 0) {
      currentPixels.data[index] = (originalPixels.data[index] / 255) * tint.r;
      currentPixels.data[index + 1] = (originalPixels.data[index + 1] / 255) * tint.g;
      currentPixels.data[index + 2] = (originalPixels.data[index + 2] / 255) * tint.b;
    }
  }
  ctx.putImageData(currentPixels, 0, 0);
  return canvas.toDataURL("image/png");
}

function loadHairSprite(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load hair sprite"));
    image.src = url;
  });
}

function buildCharacterViewMarkup() {
  return `
    <div class="character-view-box" fr="0">
      <div class="character-view-inner">
        <img class="shadowChar" src="${SHADOW_SRC}" alt="" draggable="false" />
        <img class="element-character-view scaling costumes" alt="" draggable="false" />
        <img class="element-character-view scaling heads" alt="" draggable="false" />
        <img class="element-character-view scaling hairs" alt="" draggable="false" crossorigin="anonymous" />
      </div>
    </div>
  `;
}

function mount(stageEl, { previewZoom = DEFAULT_PREVIEW_ZOOM, build = false } = {}) {
  if (!stageEl) {
    return null;
  }
  if (build && !stageEl.querySelector(".character-view-inner")) {
    stageEl.innerHTML = buildCharacterViewMarkup();
  }

  const innerEl = stageEl.querySelector(".character-view-inner");
  const hairsEl = stageEl.querySelector(".element-character-view.hairs");
  const headsEl = stageEl.querySelector(".element-character-view.heads");
  const costumesEl = stageEl.querySelector(".element-character-view.costumes");
  if (!innerEl || !hairsEl || !headsEl || !costumesEl) {
    return null;
  }

  const view = {
    stageEl,
    innerEl,
    hairsEl,
    headsEl,
    costumesEl,
    previewZoom,
    config: null,
    hairRecolorRequestId: 0,
    observer: null,
  };

  if (typeof ResizeObserver !== "undefined") {
    view.observer = new ResizeObserver(() => {
      layout(view);
    });
    view.observer.observe(stageEl);
  } else {
    window.addEventListener("resize", () => layout(view));
  }

  layout(view);
  return view;
}

function layout(view) {
  if (!view?.stageEl || !view.innerEl) {
    return;
  }
  const { width, height } = view.stageEl.getBoundingClientRect();
  if (width <= 0 || height <= 0) {
    return;
  }
  const zoom = view.previewZoom ?? DEFAULT_PREVIEW_ZOOM;
  const scale =
    Math.min(
      width / (NOSAPKI_CONTENT_WIDTH * NOSAPKI_CONTENT_PADDING),
      height / (NOSAPKI_CONTENT_HEIGHT * NOSAPKI_CONTENT_PADDING),
    ) * zoom;
  const offsetX = (NOSAPKI_VIEW_WIDTH / 2 - NOSAPKI_CONTENT_CENTER_X) * scale;
  const offsetY = (NOSAPKI_VIEW_HEIGHT / 2 - NOSAPKI_CONTENT_CENTER_Y) * scale;
  view.innerEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}

async function applyHairRecolor(view, config) {
  if (!view?.hairsEl) {
    return;
  }
  const requestId = ++view.hairRecolorRequestId;
  const baseSrc = characterSpritePath(config, "hairs");
  const hex = hairRecolorHex(config.hairColour);
  try {
    const baseImage = await loadHairSprite(baseSrc);
    if (requestId !== view.hairRecolorRequestId) {
      return;
    }
    view.hairsEl.src = recolorHairImage(baseImage, hex);
    view.hairsEl.dataset.hairColour = String(config.hairColour);
    view.hairsEl.dataset.baseSrc = baseSrc;
  } catch {
    if (requestId !== view.hairRecolorRequestId) {
      return;
    }
    view.hairsEl.src = baseSrc;
    view.hairsEl.dataset.hairColour = String(config.hairColour);
    view.hairsEl.dataset.baseSrc = baseSrc;
  }
}

function update(view, config) {
  if (!view) {
    return;
  }
  view.config = {
    gender: config.gender || "female",
    job: config.job || "Adventurer",
    hairStyle: config.hairStyle || "A",
    hairColour: String(config.hairColour ?? "1"),
  };
  view.headsEl.src = characterSpritePath(view.config, "heads");
  view.costumesEl.src = characterSpritePath(view.config, "costumes");
  void applyHairRecolor(view, view.config);
  layout(view);
}

function destroy(view) {
  if (!view) {
    return;
  }
  view.observer?.disconnect();
}

window.CharacterView = {
  DEFAULT_PREVIEW_ZOOM,
  HAIR_RECOLOR_HEX,
  JOB_CLASS,
  mount,
  update,
  layout,
  destroy,
};
