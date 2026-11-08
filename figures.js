"use strict";

const Figures = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const kinds = { bar: "Bar chart", line: "Line chart", scatter: "Scatter plot", pie: "Pie chart", flow: "Flowchart", abstract: "Graphical abstract" };
  const palettes = {
    teal: ["#087d72", "#3aa995", "#576ec7", "#b06232", "#677f38", "#934e83"],
    indigo: ["#4c53b8", "#7584db", "#227e99", "#9b4c8e", "#b77132", "#4e8463"],
    amber: ["#a75816", "#d99539", "#567c39", "#267e88", "#6751a4", "#a14f6c"],
    mono: ["#253545", "#596877", "#818c97", "#4c5866", "#a1aab1", "#687785"],
  };
  const numeric = "[+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?(?:e[+-]?\\d+)?|[+-]?\\.\\d+(?:e[+-]?\\d+)?";
  const valueOf = (token) => Number(token.replaceAll(",", ""));
  const clean = (value) => value.trim().replace(/^[“‘"']|[”’"']$/g, "").trim();

  function isAbstract(input, requestedKind) {
    return requestedKind === "abstract" || (requestedKind === "auto" &&
      /\b(?:graphical abstract|illustrated workflow|panel\s+[a-f1-6]\s*[:,.)-]|stage\s+[1-6]\s*:)/i.test(input));
  }

  function parse(prompt, requestedKind) {
    const input = prompt.trim();
    const kind = requestedKind !== "auto" ? requestedKind :
      isAbstract(input, requestedKind) ? "abstract" :
      /\b(?:scatter|xy plot)\b/i.test(input) ? "scatter" :
      /\b(?:line (?:chart|graph|plot)|trend)\b/i.test(input) ? "line" :
      /\b(?:pie|donut|doughnut)\b/i.test(input) ? "pie" :
      /(?:→|->|➜|\b(?:workflow|flowchart|flow chart|pipeline|diagram)\b)/i.test(input) ? "flow" : "bar";
    if (kind === "abstract") return parseAbstract(input);
    const info = {};
    const data = input.replace(
      /(?:^|[.;\n]\s*|\s)(title\s*:|titled\s+|[xy][ -]?axis\s*:)\s*(?:"([^"]+)"|“([^”]+)”|([^.;\n]+))/gi,
      (match, label, straight, curly, plain) => {
        const key = /^x/i.test(label) ? "x" : /^y/i.test(label) ? "y" : "title";
        info[key] = clean(straight ?? curly ?? plain);
        return "\n";
      },
    );
    const title = info.title || kinds[kind];
    if (kind === "flow") {
      const path = data.split(/[\n.;]/).find((line) => /→|->|➜|\s=>\s/.test(line)) || "";
      const steps = path.split(/\s*(?:→|->|➜|=>)\s*/)
        .map((part) => clean(part.replace(/^\s*(?:(?:create|make|show|draw)\s+)?(?:an?\s+)?(?:flowchart|flow chart|workflow|pipeline|diagram)\s*(?:(?:of|for|showing|with)\s+|:\s*)/i, "")))
        .filter(Boolean);
      if (steps.length < 2) throw Error("Add at least two steps separated by arrows, for example Data → Training → Evaluation.");
      if (steps.length > 12) throw Error("Use up to 12 workflow steps per figure.");
      return { kind, title, steps };
    }
    if (kind === "scatter") {
      const pattern = new RegExp("\\(\\s*(" + numeric + ")\\s*[,/]\\s*(" + numeric + ")\\s*\\)", "gi");
      const pairs = Array.from(data.matchAll(pattern), (pair) => ({ x: valueOf(pair[1]), y: valueOf(pair[2]) }));
      if (pairs.length < 2) throw Error("Add at least two coordinate pairs in parentheses, for example (1, 72), (2, 81).");
      if (pairs.length > 100) throw Error("Use up to 100 coordinate pairs per figure.");
      validate(pairs.flatMap(({ x, y }) => [x, y]));
      return { kind, title, pairs, x: info.x, y: info.y };
    }

    const entries = [];
    const pattern = new RegExp("([^,;:.\\n]+?)\\s*(?::|=)\\s*(" + numeric + ")\\s*%?(?=\\s*(?:[,;.\\n]|$))", "gi");
    for (const match of data.matchAll(pattern)) {
      const label = clean(match[1].replace(/^\s*(?:(?:create|make|show|draw)\s+)?(?:an?\s+)?(?:bar|line|pie|donut)\s*(?:chart|graph|plot)?\s*(?:(?:with|of|showing)\s+)?/i,
        (prefix) => /\b(?:chart|graph|plot|with|of|showing)\b/i.test(prefix) ? "" : prefix));
      if (label) entries.push({ label, value: valueOf(match[2]) });
    }
    if (entries.length < (kind === "line" ? 2 : 1)) {
      throw Error("Include " + (kind === "line" ? "at least two " : "") + "labels and values, for example Baseline: 81, DrugCMF: 92.");
    }
    if (entries.length > 16) throw Error("Use up to 16 values per figure.");
    validate(entries.map(({ value }) => value));
    if (kind === "pie" && (entries.some(({ value }) => value < 0) || entries.every(({ value }) => value === 0))) {
      throw Error("Pie charts need nonnegative values and at least one positive value.");
    }
    return { kind, title, entries, x: info.x, y: info.y };
  }

  function validate(values) {
    if (values.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e100 || (value !== 0 && Math.abs(value) < 1e-100))) {
      throw Error("Use finite numbers with magnitudes between 1e-100 and 1e100, or zero.");
    }
  }

  function el(name, attributes = {}, content) {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function write(root, x, y, content, options = {}) {
    root.append(el("text", { x, y, "font-size": 14, ...options }, content));
  }

  function wrap(value, width, maxLines = 2) {
    const chars = Array.from(value);
    const lines = [];
    while (chars.length && lines.length < maxLines) {
      const length = chars.length <= width ? chars.length : chars.slice(0, width + 1).lastIndexOf(" ");
      const line = chars.splice(0, length > 0 ? length : width).join("").trim();
      while (chars[0] === " ") chars.shift();
      lines.push(line);
    }
    if (chars.length) lines[lines.length - 1] = lines.at(-1).slice(0, -1) + "…";
    return lines;
  }

  const number = (value) => Number(value.toPrecision(9)).toLocaleString("en-US", { maximumSignificantDigits: 9, notation: value !== 0 && (Math.abs(value) >= 1e7 || Math.abs(value) < .001) ? "scientific" : "standard" });
  const stroke = "#dce7e5";
  const muted = "#516570";

  function svg(model, palette = "teal") {
    const colors = palettes[palette] ?? palettes.teal;
    if (model.kind === "abstract") return abstractSvg(model, colors[0]);
    const { kind, title } = model;
    const width = 760;
    const titleLines = wrap(title, 41);
    const start = 72 + (titleLines.length - 1) * 28;
    const height = kind === "flow" ? start + Math.ceil(model.steps.length / 3) * 95 + 28 :
      kind === "pie" ? Math.max(420, start + model.entries.length * 24 + 27) : 445 + start - 72;
    const root = el("svg", {
      xmlns: NS, width, height, viewBox: "0 0 " + width + " " + height, role: "img",
      "aria-label": title + ", " + kinds[kind],
      "font-family": "Arial, Helvetica, sans-serif", fill: "#19323c",
    });
    root.append(el("title", {}, title));
    root.append(el("rect", { width, height, fill: "white" }));
    titleLines.forEach((line, i) => write(root, 380, 39 + i * 28, line, { "text-anchor": "middle", "font-size": 24, "font-weight": 700 }));
    if (kind === "flow") flow(root, model, colors, start);
    else if (kind === "pie") pie(root, model, colors, start);
    else cartesian(root, model, colors, start);
    return root;
  }

  function domain(values, zero) {
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (zero) {
      min = Math.min(0, min);
      max = Math.max(0, max);
    }
    if (min === max) {
      const pad = Math.abs(min) * .1 || 1;
      return zero ? [0, 1] : [min - pad, max + pad];
    }
    const rough = (max - min) / 5;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const interval = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= rough) * magnitude;
    return [Math.floor(min / interval) * interval, Math.ceil(max / interval) * interval];
  }

  function cartesian(root, model, colors, top) {
    const { kind, entries, pairs } = model;
    const scatter = kind === "scatter";
    const left = 114, right = 716, bottom = top + 265;
    const [min, max] = domain(scatter ? pairs.map(({ y }) => y) : entries.map(({ value }) => value), !scatter);
    const [xmin, xmax] = scatter ? domain(pairs.map(({ x }) => x), false) : [0, entries.length];
    const x = (value) => left + (value - xmin) / (xmax - xmin) * (right - left);
    const y = (value) => bottom - (value - min) / (max - min) * (bottom - top);
    const grid = (x1, y1, x2, y2, color = stroke) => root.append(el("line", { x1, y1, x2, y2, stroke: color }));
    for (let index = 0; index <= 5; index++) {
      const val = min + index * (max - min) / 5;
      const pos = y(val);
      grid(left, pos, right, pos);
      write(root, left - 10, pos + 4, number(val), { "text-anchor": "end", "font-size": 12, fill: muted });
      if (scatter) {
        const xval = xmin + index * (xmax - xmin) / 5;
        grid(x(xval), top, x(xval), bottom);
        write(root, x(xval), bottom + 24, number(xval), { "text-anchor": "middle", "font-size": 12, fill: muted });
      }
    }
    grid(left, top, left, bottom, "#9dafa9");
    grid(left, bottom, right, bottom, "#9dafa9");
    if (!scatter && min < 0 && max > 0) grid(left, y(0), right, y(0), "#9dafa9");
    if (model.y || scatter) write(root, 23, (top + bottom) / 2, model.y || "Y", { "text-anchor": "middle", transform: "rotate(-90 23 " + (top + bottom) / 2 + ")" });
    if (model.x || scatter) write(root, (left + right) / 2, bottom + 91, model.x || "X", { "text-anchor": "middle" });

    if (scatter) {
      for (const pair of pairs) {
        const point = el("circle", { cx: x(pair.x), cy: y(pair.y), r: 6, fill: colors[0], "fill-opacity": .78, stroke: "white", "stroke-width": 1 });
        point.append(el("title", {}, number(pair.x) + ", " + number(pair.y)));
        root.append(point);
      }
      return;
    }

    if (kind === "line") {
      root.append(el("polyline", { points: entries.map(({ value }, i) => x(i + .5) + "," + y(value)).join(" "), fill: "none", stroke: colors[0], "stroke-width": 3.5, "stroke-linejoin": "round" }));
    }
    const crowded = entries.length > 7;
    const slot = (right - left) / entries.length;
    entries.forEach(({ label, value }, i) => {
      const center = x(i + .5), position = y(value);
      const barWidth = Math.min(95, slot * .61);
      const mark = kind === "bar" ?
        el("rect", { x: center - barWidth / 2, y: Math.min(position, y(0)), width: barWidth, height: Math.max(1, Math.abs(position - y(0))), rx: 3, fill: colors[0] }) :
        el("circle", { cx: center, cy: position, r: 5, fill: colors[0], stroke: "white", "stroke-width": 1.5 });
      mark.append(el("title", {}, label + ": " + number(value)));
      root.append(mark);
      if (!crowded) write(root, center, value < 0 ? Math.min(bottom - 4, position + 17) : position - 8, number(value), { "text-anchor": "middle", "font-size": 13, "font-weight": 700 });
      if (crowded) {
        write(root, center, bottom + 13, wrap(label, 11, 1)[0], { "text-anchor": "end", "font-size": 12, fill: muted, transform: "rotate(-47 " + center + " " + (bottom + 13) + ")" });
      } else {
        wrap(label, Math.max(10, Math.min(24, Math.floor(slot / 7))), 3).forEach((line, index) => {
          write(root, center, bottom + 22 + index * 14, line, { "text-anchor": "middle", "font-size": 13, fill: muted });
        });
      }
    });
  }

  function pie(root, model, colors, top) {
    const total = model.entries.reduce((sum, item) => sum + item.value, 0);
    const cx = 228, cy = top + 150, r = 118;
    let angle = -Math.PI / 2;
    model.entries.forEach(({ label, value }, index) => {
      const color = colors[index % colors.length];
      const end = angle + value / total * Math.PI * 2;
      if (value > 0) {
        const mark = value === total ? el("circle", { cx, cy, r, fill: color }) :
          el("path", { d: "M " + cx + " " + cy + " L " + (cx + r * Math.cos(angle)) + " " + (cy + r * Math.sin(angle)) + " A " + r + " " + r + " 0 " + (end - angle > Math.PI ? 1 : 0) + " 1 " + (cx + r * Math.cos(end)) + " " + (cy + r * Math.sin(end)) + " Z", fill: color, stroke: "white", "stroke-width": 1.4 });
        mark.append(el("title", {}, label + ": " + number(value)));
        root.append(mark);
      }
      angle = end;
      const row = top + 24 + index * 24;
      root.append(el("rect", { x: 405, y: row - 11, width: 13, height: 13, rx: 3, fill: color }));
      write(root, 426, row, wrap(label, 27, 1)[0], { "font-size": 14 });
      write(root, 713, row, (value / total * 100).toFixed(1) + "%", { "font-size": 14, "text-anchor": "end", fill: muted });
    });
  }

  function flow(root, model, colors, top) {
    const boxWidth = 194, boxHeight = 62;
    const count = Math.min(model.steps.length, 3);
    const left = (760 - (count * boxWidth + (count - 1) * 38)) / 2;
    const positions = model.steps.map((_, i) => {
      const row = Math.floor(i / 3), col = i % 3;
      return [left + (row % 2 ? 2 - col : col) * (boxWidth + 38), top + row * 95];
    });
    const defs = el("defs");
    const arrow = el("marker", { id: "arrow-tip", markerWidth: 8, markerHeight: 8, refX: 7, refY: 4, orient: "auto" });
    arrow.append(el("path", { d: "M 0 0 L 8 4 L 0 8 Z", fill: colors[0] }));
    defs.append(arrow);
    root.append(defs);
    positions.forEach(([x, y], i) => {
      const next = positions[i + 1];
      if (next) {
        const [nx, ny] = next;
        const line = ny > y ? [x + boxWidth / 2, y + boxHeight + 3, nx + boxWidth / 2, ny - 5] :
          nx > x ? [x + boxWidth + 3, y + boxHeight / 2, nx - 5, ny + boxHeight / 2] :
            [x - 3, y + boxHeight / 2, nx + boxWidth + 5, ny + boxHeight / 2];
        const [x1, y1, x2, y2] = line;
        root.append(el("line", { x1, y1, x2, y2, stroke: colors[0], "stroke-width": 2, "marker-end": "url(#arrow-tip)" }));
      }
      const box = el("rect", { x, y, width: boxWidth, height: boxHeight, rx: 10, fill: colors[0], "fill-opacity": .07, stroke: colors[0], "stroke-opacity": .65, "stroke-width": 1.5 });
      box.append(el("title", {}, model.steps[i]));
      root.append(box);
      const lines = wrap(model.steps[i], 21, 3);
      lines.forEach((line, j) => write(root, x + boxWidth / 2, y + boxHeight / 2 + 5 + (j - (lines.length - 1) / 2) * 16, line, { "text-anchor": "middle", "font-size": 14, "font-weight": 700 }));
    });
  }

  // Static line art. Prompt text is inserted separately as SVG text nodes.
  const symbols = [
    [/\b(?:spme|sample|vial|pipette)\b/i,
      '<rect x="36" y="52" width="28" height="39" rx="6" fill="white"/><path d="M37 72h26v12q0 6-6 6H43q-6 0-6-6z" fill="currentColor" opacity=".18"/><rect x="33" y="45" width="34" height="10" rx="3" fill="currentColor"/><path d="M50 30v45m-5 3 1 1m9 3 1 1m-8 2 1 1"/><rect x="46" y="9" width="8" height="23" rx="3" fill="currentColor"/>'],
    [/\b(?:ladyb(?:ird|ug)|insect|beetle)\b/i,
      '<path d="M38 38 27 29m9 21-13-1m14 13-12 8m37-32 11-9M64 50l13-1M63 62l12 8M45 28l-5-8m15 8 5-8"/><circle cx="50" cy="34" r="10" fill="currentColor"/><ellipse cx="50" cy="56" rx="18" ry="24" fill="#e88d78"/><path d="M50 32v47"/><g fill="currentColor" stroke="none"><circle cx="42" cy="48" r="2.7"/><circle cx="58" cy="48" r="2.7"/><circle cx="41" cy="60" r="2.7"/><circle cx="59" cy="60" r="2.7"/><circle cx="45" cy="69" r="2"/><circle cx="55" cy="69" r="2"/></g>'],
    [/\b(?:gc[-– ]?(?:ms|ead)|spectrometer|chromatograph|instrument)\b/i,
      '<ellipse cx="50" cy="84" rx="45" ry="5" fill="#c6d7d6" stroke="none"/><rect x="7" y="31" width="60" height="48" rx="4" fill="#eef1ef"/><rect x="67" y="38" width="25" height="41" rx="3" fill="#d5e1df"/><rect x="14" y="37" width="26" height="34" rx="2" fill="#dce7e6"/><circle cx="27" cy="54" r="9" fill="#fff"/><rect x="45" y="38" width="17" height="31" rx="2" fill="#f9fbfa"/><path d="M48 47h11m-11 7h11m-11 7h11M15 76h49m8-17h15m-15 6h15m-15 6h15" stroke-width="1.4"/><rect x="72" y="44" width="14" height="10" rx="1.4" fill="#72ad9f"/><path d="M31 30V21h18v9m-13-9V10h8v11" fill="#dce7e6"/><path d="M25 80v4m45-4v4" stroke-width="4"/>'],
    [/\b(?:chromatogram|spectrum|signal|sensor|readout)\b/i,
      '<rect x="7" y="22" width="86" height="53" rx="5" fill="#e8eeec"/><rect x="13" y="28" width="74" height="40" rx="2" fill="white"/><path d="M19 60h62M19 60V34m0 18h62m-62-8h62m-49-10v26m13-26v26m13-26v26m13-26v26" stroke="#cedbd7" stroke-width=".8"/><path d="m20 58 7-1 3-7 2 7 7 1 5-19 4 18 7 1 3-9 3 9 5-1 4-22 4 21 4 1 3-3 2 2" stroke-width="1.7"/><path d="M50 75v8m-16 1h32" stroke-width="3.4"/>'],
    [/\b(?:y[-– ]?tube|olfactometer)\b/i,
      '<path d="M14 19q-9 0-9 10v30q0 11 10 11v8m71-59q9 0 9 10v30q0 11-10 11v8" stroke-width="1.65"/><path d="m17 19 33 34 33-34M50 53v31" stroke="#37575f" stroke-width="11"/><path d="m17 19 33 34 33-34M50 53v31" stroke="#d0e6e3" stroke-width="7"/><path d="m25 27 10 10m-4 0h4v-4m40-6-10 10m0-4v4h4m-23 44h8" stroke-width="1.45"/><rect x="3" y="31" width="8" height="18" rx="2" fill="#ede3cc" stroke-width="1.25"/><rect x="89" y="31" width="8" height="18" rx="2" fill="#ede3cc" stroke-width="1.25"/><path d="M6 36h3m-3 4h3m-3 4h3m83-8h3m-3 4h3m-3 4h3" stroke-width=".8"/><path d="M11 77h8v4l3 4v7H8v-7l3-4zm70 0h8v4l3 4v7H78v-7l3-4z" fill="#d8e7e6" stroke-width="1.3"/><ellipse cx="50" cy="72" rx="2.1" ry="3" fill="#cc6752" stroke="none"/>'],
    [/\b(?:pump|airflow|flowmeters?|filter)\b/i,
      '<rect x="22" y="41" width="51" height="37" rx="7" fill="white"/><circle cx="39" cy="57" r="8"/><path d="M39 57l3-4m10 7h12m-12 6h12M66 41V31q0-9 9-9h11m-4-4 4 4-4 4M27 78v4m41-4v4"/>'],
    [/\b(?:microscope|microscopy|sem)\b/i,
      '<path d="M44 20h13v9H44zm6 9 14 16-9 8-14-16zm8 19-5 5m1-16c17 2 21 14 18 24-3 11-14 15-25 15H31m-7-17h38M27 76h49v7H27z" fill="white"/>'],
    [/\b(?:dna|rna|peptide|protein|sequence|helix)\b/i,
      '<path d="M32 18c0 18 36 22 36 33S32 69 32 83m36-65c0 18-36 22-36 33s36 18 36 32M36 24h28M42 34h16M43 45h14M37 55h26M43 65h14M38 75h24"/>'],
    [/\b(?:bacteri\w*|cell|microb\w*|petri|culture)\b/i,
      '<circle cx="50" cy="51" r="34" fill="white"/><circle cx="50" cy="51" r="27" opacity=".45"/><rect x="29" y="38" width="23" height="10" rx="5" transform="rotate(30 40 43)" fill="currentColor" opacity=".45"/><rect x="51" y="50" width="19" height="9" rx="4" transform="rotate(-27 60 55)" fill="currentColor" opacity=".45"/><path d="M39 61q7-6 13 3m5-28 1 1m-23 17 1 1m28 9 1 1"/>'],
    [/\b(?:data\w*|repository|library)\b/i,
      '<path d="M25 33v35c0 8 50 8 50 0V33" fill="white"/><ellipse cx="50" cy="32" rx="25" ry="9" fill="white"/><path d="M25 44c0 10 50 10 50 0M25 56c0 10 50 10 50 0"/>'],
    [/\b(?:model|ai|embeddings?|neural|network)\b/i,
      '<path d="m23 36 27-12 27 12m-54 0v29l27 12 27-12V36M23 36l54 29M77 36 23 65m27-41v53"/><g fill="white"><circle cx="23" cy="36" r="6"/><circle cx="23" cy="65" r="6"/><circle cx="50" cy="24" r="6"/><circle cx="50" cy="77" r="6"/><circle cx="77" cy="36" r="6"/><circle cx="77" cy="65" r="6"/></g>'],
  ];
  symbols.push(
    [/\b(?:trichoderma|fungi|fungal|amf|mycorrhiza|endophytes?)\b/i,
      '<path d="M17 76c16-8 45-8 66 0M31 70V40m19 29V27m19 44V45M21 33l10 8 10-8m-3-12 12 8 12-8m-2 19 9 6 9-6"/><g fill="currentColor" stroke="none"><circle cx="21" cy="32" r="4"/><circle cx="41" cy="32" r="4"/><circle cx="38" cy="20" r="4"/><circle cx="62" cy="20" r="4"/><circle cx="60" cy="39" r="4"/><circle cx="78" cy="39" r="4"/></g>'],
    [/\b(?:plant|hormonal|nutritional|defen[cs]e|crop)\b/i,
      '<path d="M50 79V35m0 25C33 61 26 49 25 40c13 0 22 4 25 20zm0-9c4-18 15-22 26-21-1 10-12 21-26 21zM38 80h24m-12-1-8 9m8-9 8 9" fill="white"/>'],
    [/\b(?:voc|volatile|emission)\b/i,
      '<path d="M18 34c16-17 23 17 39 0s23-8 25-1M18 50c16-17 23 17 39 0s23-8 25-1M18 66c16-17 23 17 39 0s23-8 25-1"/>'],
    [/\b(?:herbivores?|natural enemies|wasps?|predators?)\b/i,
      '<ellipse cx="50" cy="54" rx="14" ry="22" fill="white"/><circle cx="50" cy="32" r="6" fill="currentColor"/><path d="M46 29l-6-10m14 10 6-10M38 43l-11-6m9 17H22m17 12-12 9m35-32 11-6m-9 17h14m-17 12 12 9M50 44v25"/>'],
    [/\bneutral effect\b/i, '<circle cx="50" cy="50" r="29" fill="white"/><path d="M38 50h24"/>'],
    [/\b(?:pest management|facilitation)\b/i, '<circle cx="50" cy="50" r="29" fill="white"/><path d="m34 51 10 10 23-24"/>'],
  );
  const genericSymbol = '<rect x="25" y="23" width="50" height="54" rx="5" fill="white"/><path d="M38 39h24m-24 11h24m-24 11h14"/>';

  function parseAbstract(input) {
    const instructions = "Give each stage a heading and a short list of items. Use Stage 1:, Stage 2:, or Panel A: to start each section.";
    const titled = input.match(/\b(?:graphical abstract|illustrated workflow)\s+titled\s+["“]([^"”]+)["”]/i);
    const explicitTitle = input.match(/^\s*title\s*:[ \t]*\n?((?:(?!\n\s*(?:\n|(?:image dimensions|style|stage\s+\d+|panel\s+[a-f1-6]|export)\b))[^\n]|\n(?!\s*\n))+)/im);
    let title = explicitTitle ? clean(explicitTitle[1].trim().split(/\n(?=\s*(?:stage\s+\d+|panel\s+[a-f1-6]|image dimensions|style|export)\b)/i)[0].replace(/\s+/g, " ")) :
      titled ? clean(titled[1]) : "Graphical abstract";
    const panels = [];
    const contextMatch = input.match(/^\s*(?:context\s*:|include\b[^\n:]*context[- ]dependence[^\n:]*:)[ \t]*\n?([^\n]+)/im);
    const context = contextMatch ? clean(contextMatch[1]) : "";
    const sectionPattern = /\b(?:stage\s+([1-6])\s*:|panel\s+([a-f1-6])\s*(?:[,.)-]|:)|(?:at the end,\s*)?show (?:three |the )?possible outcomes?(?: symbols?)?\s*:|outcomes?\s*:)/gi;
    const marks = Array.from(input.matchAll(sectionPattern));
    const stop = /\n\s*(?:include\b[^\n]*context[- ]dependence|context\s*:|export\s*:)/i;
    const trimItem = (value) => clean(value.trim().replace(/\.$/, ""));
    const splitItems = (value) => value.split(/\s*(?:,|;|→|->)\s*/).map(trimItem).filter(Boolean);

    if (marks.length) {
      for (const [index, marker] of marks.entries()) {
        const end = marks[index + 1]?.index ?? input.length;
        const body = input.slice(marker.index + marker[0].length, end).split(stop)[0].trim();
        const lines = body.split(/\n/).map((line) => line.trim()).filter(Boolean);
        const bullets = lines.filter((line) => /^[-*•]\s+/.test(line)).map((line) => trimItem(line.replace(/^[-*•]\s+/, "")));
        const fallback = marker[1] ? "Stage " + marker[1] : marker[2] ? "Panel " + marker[2].toUpperCase() : "Possible outcomes";
        let heading = fallback;
        let items = bullets;
        if (bullets.length && lines[0] && !/^[-*•]\s+/.test(lines[0])) {
          heading = trimItem(lines[0].replace(/:$/, "").replace(/^(?:show\s+|a\s+)|\s+showing$/gi, "")).replace(/^./, (letter) => letter.toUpperCase());
        } else if (!bullets.length) {
          const named = body.match(/^([^:\n]{1,58}):\s*([\s\S]*)$/);
          heading = named ? trimItem(named[1]) : fallback;
          const description = named ? named[2] : body;
          const parts = splitItems(description);
          const prose = parts.some((item) => item.length > 46 || /^(?:show|draw|include|use|make)\b/i.test(item));
          if (prose) {
            const known = symbols.map(([pattern]) => description.match(pattern)).filter(Boolean).sort((a, b) => a.index - b.index);
            items = known.slice(0, 4).map(([word]) => {
              if (/^(?:spme|sample|vial)$/i.test(word) && /\bspme\b/i.test(description)) return "SPME fiber";
              if (/^gc[-– ]?ms$/i.test(word)) return "GC–MS instrument";
              if (/^y[-– ]?tube$/i.test(word)) return "Y-tube olfactometer";
              return word[0].toUpperCase() + word.slice(1);
            });
          } else items = parts;
        }
        if (!items.length || items.length > 4) throw Error(heading + " needs one to four short items. " + instructions);
        panels.push({ heading, items });
      }
    } else {
      for (const line of input.split("\n").map((part) => part.trim()).filter(Boolean)) {
        const titleMatch = line.match(/^(?:title\s*:|(?:create (?:a )?)?(?:graphical abstract|illustrated workflow)\s+titled\s+)\s*(.+)$/i);
        if (titleMatch) {
          title = clean(titleMatch[1]);
          continue;
        }
        if (/^context\s*:/i.test(line)) continue;
        const parts = line.match(/^([^:]+):\s*(.+)$/);
        if (!parts) throw Error(instructions);
        const items = splitItems(parts[2]);
        if (!items.length || items.length > 4) throw Error("Each panel needs one to four short items.");
        panels.push({ heading: parts[1].trim(), items });
      }
    }
    if (!panels.length || panels.length > 6) throw Error("Use between one and six panels. " + instructions);
    return { kind: "abstract", title, panels, context, portrait: /\bportrait\b/i.test(input) };
  }

  function abstractSvg({ title, panels, context, portrait }, color) {
    const columns = Math.min(panels.length, portrait ? 2 : 3);
    const width = portrait ? 650 : 920, inset = 34, gap = 22;
    const panelWidth = (width - inset * 2 - (columns - 1) * gap) / columns;
    const panelHeight = panels.some(({ items }) => items.length > 2) ? 316 : 252;
    const titleLines = wrap(title, 50, 2);
    const top = 100 + (titleLines.length - 1) * 33;
    const height = top + Math.ceil(panels.length / columns) * (panelHeight + gap) - gap + inset + (context ? 28 : 0);
    const root = el("svg", {
      xmlns: NS, width, height, viewBox: "0 0 " + width + " " + height, role: "img",
      "aria-label": title + ", graphical abstract with " + panels.length + " panels",
      "font-family": "Arial, Helvetica, sans-serif", fill: "#19323c",
    });
    root.append(el("title", {}, title), el("rect", { width, height, fill: "white" }));
    write(root, inset, 32, "GRAPHICAL ABSTRACT", { "font-size": 12, "letter-spacing": 2.4, "font-weight": 700, fill: color });
    titleLines.forEach((line, index) => write(root, inset, 69 + index * 33, line, { "font-size": 31, "font-weight": 700 }));
    panels.forEach(({ heading, items }, index) => {
      const px = inset + (index % columns) * (panelWidth + gap);
      const py = top + Math.floor(index / columns) * (panelHeight + gap);
      const panel = el("g", { transform: "translate(" + px + " " + py + ")" });
      panel.append(el("title", {}, heading + ": " + items.join(", ")));
      panel.append(el("rect", { width: panelWidth, height: panelHeight, rx: 18, stroke: color, "stroke-width": 1.5, fill: "white" }));
      panel.append(el("rect", { x: 17, y: 17, width: 28, height: 28, rx: 7, fill: color }));
      write(panel, 31, 36, String.fromCharCode(65 + index), { "text-anchor": "middle", "font-weight": 700, fill: "white" });
      wrap(heading, Math.floor((panelWidth - 69) / 9), 2).forEach((line, i) => write(panel, 55, 36 + i * 18, line, { "font-size": 17, "font-weight": 700 }));
      panel.append(el("line", { x1: 17, x2: panelWidth - 17, y1: 63, y2: 63, stroke, "stroke-width": 1.5 }));
      const stacked = items.length > 2;
      const iconSize = items.length === 1 ? 138 : stacked ? 76 : 102;
      items.forEach((label, itemIndex) => {
        const rowCount = stacked ? Math.min(2, items.length - Math.floor(itemIndex / 2) * 2) : items.length;
        const center = panelWidth * ((itemIndex % 2) + .5) / rowCount;
        const y = stacked ? 74 + Math.floor(itemIndex / 2) * 112 : 83;
        panel.append(el("circle", { cx: center, cy: y + iconSize / 2, r: iconSize * .49, fill: color, "fill-opacity": .08 }));
        const icon = el("g", {
          transform: "translate(" + (center - iconSize / 2) + " " + y + ") scale(" + (iconSize / 100) + ")",
          color, stroke: "currentColor", fill: "none", "stroke-width": 2.8, "stroke-linecap": "round", "stroke-linejoin": "round",
        });
        icon.innerHTML = /\bfacilitation\b/i.test(label) ?
          '<circle cx="50" cy="50" r="29" fill="white"/><path d="M50 63V37m-11 11 11-11 11 11"/>' :
          symbols.find(([pattern]) => pattern.test(label))?.[1] ?? genericSymbol;
        panel.append(icon);
        wrap(label, Math.min(28, Math.floor((panelWidth / rowCount - 12) / 7)), 2).forEach((line, i) => {
          write(panel, center, y + iconSize + 15 + i * 15, line, { "font-size": 13, "font-weight": 700, "text-anchor": "middle" });
        });
      });
      root.append(panel);
    });
    if (context) {
      wrap(context, portrait ? 56 : 74, 2).forEach((line, index) => {
        write(root, width / 2, height - 40 + index * 16, line, { "text-anchor": "middle", "font-size": 15, "font-weight": 700, fill: color });
      });
    }
    return root;
  }

  return { kinds, isAbstract, parse, svg };
})();
