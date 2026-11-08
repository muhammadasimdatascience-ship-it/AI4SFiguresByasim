"use strict";

(() => {
  const byId = (id) => document.getElementById(id);
  const input = byId("image-prompt");
  const connect = byId("image-signin");
  const generate = byId("image-generate");
  const exportButton = byId("image-download");
  const message = byId("image-status");
  const error = byId("image-error");
  const canvas = byId("image-canvas");
  const sheet = byId("image-sheet");
  const placeholder = byId("image-placeholder");
  const modes = [
    { button: byId("vector-mode"), content: byId("vector-workspace"), name: "figures" },
    { button: byId("image-mode"), content: byId("image-workspace"), name: "images" },
  ];

  const styles = {
    abstract: "Compose a journal-style graphical abstract on a pure white background. Combine realistic equipment illustrations with precise vector-style technical callouts. Use softly rounded, thin panel outlines, a clear reading order, consistent scale within each panel, and a restrained palette.",
    realistic: "Illustrate recognizable laboratory equipment with natural proportions, realistic glass, brushed metal, and soft neutral lighting. Use a white background and sparse, precise scientific callouts. Arrange the equipment into panels when specified.",
    apparatus: "Draw an uncluttered laboratory schematic on white with precise linework, clean callout leaders, and legible labels.",
    biology: "Create a scientific biological illustration on a white background with consistent scale cues and clear labels.",
  };
  const examples = [
    ["Insect olfaction", "abstract", "Three panels from left to right. Panel A, ‘Volatile collection’: show a realistic ladybird beside a sealed sample vial and an SPME fiber, with a small circular magnified inset of the fiber tip. Panel B, ‘Chemical analysis’: make this center panel wider. Show realistic GC–MS equipment above a monitor with a stylized chromatogram. Panel C, ‘Behavioral assay’: draw a clear glass Y-tube with two inlet arms, a central insect release point, two flowmeters, and directional airflow arrows. Use thin green rounded panel outlines, black sans-serif labels, and a white background. Keep A, B, and C labels consistent."],
    ["Peptide screening", "abstract", "Draw a three-panel graphical abstract. A: collect and curate antimicrobial peptide sequences from a database. B: encode the sequences as embeddings and score them with a screening model. C: prioritize a shortlist for laboratory validation, using an illustration of a microplate and bacteria. Label each panel and connect the three with arrows."],
    ["Y-tube assay", "apparatus", "Create a labeled diagram of a Y-tube olfactometer. Show the Y-shaped glass tube, the insect release point at the base, and a treatment arm and control arm. Show airflow direction in each arm using thin arrows. Use short labels and a flat, clean scientific drawing style."],
  ];

  let sdkRequest;
  let busy = false;
  let result;

  function setError(text = "") {
    error.textContent = text;
    error.hidden = !text;
  }

  function updateControls() {
    const sdk = window.puter;
    const connected = Boolean(sdk?.auth.isSignedIn());
    connect.disabled = !sdk || connected || busy;
    connect.textContent = connected ? "Connected" : "Connect Puter";
    generate.disabled = !connected || busy;
    generate.textContent = busy ? "Generating image…" : "Generate image";
    canvas.setAttribute("aria-busy", String(busy));
    exportButton.disabled = !result || busy;
  }

  function loadProvider() {
    if (window.puter) return Promise.resolve();
    if (sdkRequest) return sdkRequest;
    sdkRequest = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://js.puter.com/v2/";
      const timeout = setTimeout(failed, 15000);
      function failed() {
        clearTimeout(timeout);
        script.remove();
        reject(Error("Puter could not load. Switch modes and reopen the AI image generator to retry."));
      }
      script.onload = () => {
        clearTimeout(timeout);
        if (window.puter?.auth && window.puter?.ai) resolve();
        else failed();
      };
      script.onerror = failed;
      document.head.append(script);
    }).catch((problem) => {
      sdkRequest = undefined;
      throw problem;
    });
    return sdkRequest;
  }

  function selectMode(selected) {
    for (const mode of modes) {
      const active = mode.name === selected;
      mode.button.setAttribute("aria-pressed", String(active));
      mode.content.hidden = !active;
    }
    if (selected === "images") {
      setError();
      loadProvider().then(updateControls).catch((problem) => setError(problem.message));
    }
  }

  for (const mode of modes) {
    mode.button.addEventListener("click", () => {
      if (mode.name === "images") history.replaceState(null, "", "#ai-images");
      else history.replaceState(null, "", location.pathname + location.search);
      selectMode(mode.name);
    });
  }
  byId("free-preview").addEventListener("click", () => {
    byId("vector-mode").click();
    const example = byId("examples").querySelector("button");
    example.click();
    example.focus();
  });
  window.addEventListener("hashchange", () => selectMode(location.hash === "#ai-images" ? "images" : "figures"));
  if (location.hash === "#ai-images") selectMode("images");

  for (const [name, style, description] of examples) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.addEventListener("click", () => {
      input.value = description;
      byId("image-style").value = style;
      input.focus();
    });
    byId("image-examples").append(button);
  }

  connect.addEventListener("click", async () => {
    setError();
    connect.disabled = true;
    try {
      await window.puter.auth.signIn({ attempt_temp_user_creation: false });
    } catch {
      setError("Puter sign-in did not finish. Allow the sign-in popup and try again.");
    } finally {
      updateControls();
    }
  });

  byId("image-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !window.puter?.auth.isSignedIn()) return;
    const description = input.value.trim();
    const reference = byId("image-reference").files[0];
    setError();
    if (!description) {
      setError("Enter a description of the image.");
      input.focus();
      return;
    }
    if (reference && (!["image/png", "image/jpeg", "image/webp"].includes(reference.type) || reference.size > 10 * 1024 * 1024)) {
      setError("Choose a PNG, JPEG, or WebP reference image up to 10 MB.");
      byId("image-reference").focus();
      return;
    }

    busy = true;
    updateControls();
    message.textContent = "Generating with Puter. This can take a minute.";
    const style = styles[byId("image-style").value];
    const aspect = byId("image-ratio").value;
    const prompt = style + "\n" + description +
      "\nPreserve the supplied terminology, instrument names, and connections. Use large, high-contrast lettering, short callout leaders, clear gutters, and generous margins. Keep every panel in frame. Do not add unexplained labels, invented measurements, logos, or watermarks. A qualitative trace should read as a schematic, without numeric values unless supplied.";
    try {
      const image = await window.puter.ai.txt2img(prompt, {
        model: "gpt-image-2.6-flare",
        quality: byId("image-quality").value,
        aspect_ratio: aspect,
        ...(reference ? { input_image: reference } : {}),
      });
      await image.decode();
      image.alt = "Generated scientific image. " + description.slice(0, 280);
      sheet.replaceChildren(image);
      sheet.hidden = false;
      placeholder.hidden = true;
      result = image;
      message.textContent = "Image generated and ready to download.";
    } catch (problem) {
      message.textContent = result ? "Showing your last generated image." : "Your generated image will appear here.";
      const detail = problem?.message || problem?.error?.message;
      setError("Puter could not generate the image. " + (typeof detail === "string" ? detail.slice(0, 220) : "Check your connection or Puter allowance and try again."));
    } finally {
      busy = false;
      updateControls();
    }
  });

  exportButton.addEventListener("click", async () => {
    const image = result;
    if (!image) return;
    setError();
    exportButton.disabled = true;
    try {
      const response = await fetch(image.src);
      if (!response.ok) throw Error("Image download failed");
      const blob = await response.blob();
      const extension = { "image/jpeg": "jpg", "image/webp": "webp", "image/png": "png" }[blob.type] || "png";
      download(blob, "ai4s-scientific-image." + extension);
    } catch {
      const link = document.createElement("a");
      link.href = image.src;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open the image to save it.";
      setError("Direct download is unavailable. ");
      error.append(link);
    } finally {
      updateControls();
    }
  });
})();
