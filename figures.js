"use strict";

const Figures = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const kinds = { bar: "Bar chart", line: "Line chart", scatter: "Scatter plot", pie: "Pie chart", flow: "Flowchart" };
  const palettes = {
    teal: ["#087d72", "#3aa995", "#576ec7", "#b06232", "#677f38", "#934e83"],
    indigo: ["#4c53b8", "#7584db", "#227e99", "#9b4c8e", "#b77132", "#4e8463"],
    amber: ["#a75816", "#d99539", "#567c39", "#267e88", "#6751a4", "#a14f6c"],
    mono: ["#253545", "#596877", "#818c97", "#4c5866", "#a1aab1", "#687785"],
  };
  const numeric = "[+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?(?:e[+-]?\\d+)?|[+-]?\\.\\d+(?:e[+-]?\\d+)?";
  const valueOf = (token) => Number(token.replaceAll(",", ""));
  const clean = (value) => value.trim().replace(/^[“"']|[”"']$/g, "").trim();

  function parse(prompt, requestedKind) {
    const input = prompt.trim();
    const kind = requestedKind !== "auto" ? requestedKind :
      /\b(?:scatter|xy plot)\b/i.test(input) ? "scatter" :
      /\b(?:line (?:chart|graph|plot)|trend)\b/i.test(input) ? "line" :
      /\b(?:pie|donut|doughnut)\b/i.test(input) ? "pie" :
      /(?:→|->|➜|\b(?:workflow|flowchart|flow chart|pipeline|diagram)\b)/i.test(input) ? "flow" : "bar";
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

  return { kinds, parse, svg };
})();
