"use strict";

const examples = [
  ["Graphical abstract", "Title: Insect olfaction experiment\nVolatile collection: SPME fiber, Ladybird\nChemical analysis: GC-MS instrument, Chromatogram\nBehavioral assay: Y-tube olfactometer, Air pump", "abstract"],
  ["Model accuracy", "Create a bar chart titled Model accuracy.\nDrugCMF: 92, Baseline: 81, Random forest: 76.\nY-axis: Accuracy (%)"],
  ["Training loss", "Create a line chart titled Training loss.\nEpoch 1: 1.24, Epoch 2: 0.87, Epoch 3: 0.61, Epoch 4: 0.45, Epoch 5: 0.34.\nX-axis: Epoch\nY-axis: Loss"],
  ["Scatter plot", "Create a scatter plot titled \"Dataset size vs. accuracy\".\n(100, 68), (200, 75), (300, 79), (450, 87), (650, 91).\nX-axis: Training samples\nY-axis: Accuracy (%)"],
  ["Dataset split", "Create a pie chart titled Dataset split.\nTraining: 70, Validation: 15, Test: 15."],
  ["DrugCMF workflow", "Create a flowchart titled DrugCMF workflow.\nCollect data → Generate embeddings → Fuse features → Train model → Evaluate results"],
];

const get = (id) => document.getElementById(id);
const form = get("form");
const prompt = get("prompt");
const kind = get("kind");
const palette = get("palette");
const error = get("error");
const status = get("export-status");
const sheet = get("sheet");
let current;
let currentSvg;

function preview(model, sample = false) {
  current = model;
  currentSvg = Figures.svg(model, palette.value);
  sheet.replaceChildren(currentSvg);
  get("figure-badge").textContent = Figures.kinds[model.kind];
  get("preview-note").textContent = sample ? "An example to get you started." : "Figure generated and ready to export.";
  status.textContent = "";
}

function generate() {
  try {
    preview(Figures.parse(prompt.value, kind.value));
    error.hidden = true;
    prompt.removeAttribute("aria-invalid");
  } catch (problem) {
    error.textContent = problem.message + " The preview still shows your previous figure.";
    error.hidden = false;
    prompt.setAttribute("aria-invalid", "true");
    prompt.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  generate();
});
prompt.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    form.requestSubmit();
  }
});
palette.addEventListener("change", () => preview(current));
for (const [label, text, exampleKind = "auto"] of examples) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", () => {
    prompt.value = text;
    kind.value = exampleKind;
    generate();
  });
  get("examples").append(button);
}

function svgBlob() {
  return new Blob([new XMLSerializer().serializeToString(currentSvg)], { type: "image/svg+xml;charset=utf-8" });
}

function filename() {
  return current.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 70) || "figure";
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

get("svg-download").addEventListener("click", () => {
  download(svgBlob(), filename() + ".svg");
  status.textContent = "SVG download started.";
});

const png = get("png-download");
png.addEventListener("click", async () => {
  const source = URL.createObjectURL(svgBlob());
  const name = filename() + ".png";
  png.disabled = true;
  try {
    const picture = new Image();
    picture.src = source;
    await picture.decode();
    const canvas = document.createElement("canvas");
    canvas.width = picture.naturalWidth * 3;
    canvas.height = picture.naturalHeight * 3;
    canvas.getContext("2d").drawImage(picture, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw Error("PNG encoding failed");
    download(blob, name);
    status.textContent = "PNG download started.";
  } catch {
    status.textContent = "PNG export could not finish. You can still download SVG.";
  } finally {
    URL.revokeObjectURL(source);
    png.disabled = false;
  }
});

preview(Figures.parse(examples[0][1], "abstract"), true);
