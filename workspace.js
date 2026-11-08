"use strict";

(() => {
  const byId = (id) => document.getElementById(id);
  const switches = Array.from(document.querySelectorAll("[data-tool]"));
  const operations = [byId("figure-ai"), byId("table-ai"), byId("chat-form").querySelector("button")];
  const tableInput = byId("table-prompt");
  const tableView = byId("table-preview");
  const chatInput = byId("chat-prompt");
  const chatView = byId("chat-replies");
  const conversation = [];
  let renderedTable;
  let engine;

  for (const button of switches) {
    button.addEventListener("click", () => {
      for (const candidate of switches) {
        const active = candidate === button;
        candidate.setAttribute("aria-pressed", String(active));
        byId(candidate.dataset.tool + "-workspace").hidden = !active;
      }
    });
  }

  function fail(id, message = "") {
    const node = byId(id);
    node.textContent = message;
    node.hidden = !message;
  }

  async function answer(messages, status, json = false) {
    if (!navigator.gpu) throw Error("Local AI needs a browser and device with WebGPU. You can still create figures and tables from structured input.");
    if (!engine) {
      status.textContent = "Loading the local model. The first run downloads model files.";
      const { CreateWebWorkerMLCEngine } = await import("https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.87/+esm");
      const worker = new Worker("./ai-worker.js", { type: "module" });
      try {
        engine = await Promise.race([
          CreateWebWorkerMLCEngine(worker, "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", {
            initProgressCallback: ({ progress }) => {
              status.textContent = "Loading local model · " + Math.min(100, Math.round(progress * 100)) + "%";
            },
          }, { context_window_size: 4096 }),
          new Promise((_, reject) => {
            worker.addEventListener("error", () => reject(Error("The local model could not start. Try a recent browser with WebGPU.")), { once: true });
          }),
        ]);
      } catch (problem) {
        worker.terminate();
        throw problem;
      }
    }
    status.textContent = "Working on your request…";
    const response = await engine.chat.completions.create({
      messages,
      temperature: json ? 0 : .4,
      max_tokens: json ? 700 : 550,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    });
    const result = response.choices[0]?.message.content?.trim();
    if (!result) throw Error("The model returned an empty answer. Try a shorter prompt.");
    return json ? JSON.parse(result) : result;
  }

  async function run(statusId, errorId, work) {
    const status = byId(statusId);
    fail(errorId);
    operations.forEach((button) => { button.disabled = true; });
    try {
      await work(status);
    } catch (problem) {
      status.textContent = "";
      fail(errorId, problem instanceof SyntaxError ? "The model returned an incomplete result. Try a shorter prompt." : (problem?.message || "The local model could not complete the request."));
    } finally {
      operations.forEach((button) => { button.disabled = false; });
    }
  }

  byId("figure-ai").addEventListener("click", () => {
    const input = byId("prompt");
    if (!input.reportValidity()) return;
    const description = input.value.trim();
    run("figure-ai-status", "error", async (status) => {
      const result = await answer([
        { role: "system", content: "Convert the user's request to one figure spec JSON object. Keys are kind and prompt. Allowed kind: abstract, bar, line, scatter, pie, flow. Prefer abstract for scientific illustrations and apparatus. For abstract: prompt is plain text with one line 'Title: name' followed by one line per panel 'Heading: item, item'. At most 6 panels and 4 short items each. For bar, line, or pie: prompt has 'Title: name' then comma-separated 'label: number'. Use only numeric data explicitly supplied. If no data is supplied use abstract. For scatter use (x, y) pairs. For flow use arrow-separated steps. Keep essential labels, do not add measurements, and never return code." },
        { role: "user", content: description },
      ], status, true);
      if (!["abstract", "bar", "line", "scatter", "pie", "flow"].includes(result.kind) || typeof result.prompt !== "string") {
        throw Error("The model could not produce a supported figure. Try naming the panels and their main objects.");
      }
      const figure = Figures.parse(result.prompt, result.kind);
      preview(figure);
      status.textContent = "Figure generated from your description. Check the labels and data before export.";
    });
  });

  function parseDelimited(input, delimiter) {
    const result = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < input.length; index++) {
      const character = input[index];
      if (character === '"' && (quoted || field === "")) {
        if (quoted && input[index + 1] === '"') {
          field += '"';
          index++;
        } else quoted = !quoted;
      } else if (!quoted && character === delimiter) {
        row.push(field);
        field = "";
      } else if (!quoted && (character === "\n" || character === "\r")) {
        if (character === "\r" && input[index + 1] === "\n") index++;
        result.push([...row, field]);
        row = [];
        field = "";
      } else field += character;
    }
    if (quoted) throw Error("Close the quoted field before building the table.");
    result.push([...row, field]);
    return result.filter((entry) => entry.some((cell) => cell.trim()));
  }

  function tableData(input) {
    const lines = input.trim().split(/\r?\n/).filter((line) => line.trim());
    if (lines[0]?.includes("|") && /^\s*\|?[\s|:-]+$/.test(lines[1] || "")) {
      return [lines[0], ...lines.slice(2)].map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
    }
    return parseDelimited(input, lines[0]?.includes("\t") ? "\t" : ",");
  }

  function showTable(rows) {
    if (!Array.isArray(rows) || rows.length < 2 || rows.length > 201 || !Array.isArray(rows[0]) ||
        rows[0].length < 2 || rows[0].length > 12 ||
        rows.some((row) => !Array.isArray(row) || row.length !== rows[0].length || row.some((cell) => !["string", "number"].includes(typeof cell)))) {
      throw Error("Use 2–12 columns, a header, and 1–200 data rows. Each row must have the same number of columns.");
    }
    const table = document.createElement("table");
    const head = table.createTHead().insertRow();
    for (const label of rows[0]) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = label;
      head.append(cell);
    }
    const body = table.createTBody();
    for (const row of rows.slice(1)) {
      const element = body.insertRow();
      for (const value of row) element.insertCell().textContent = value;
    }
    tableView.replaceChildren(table);
    renderedTable = rows;
    byId("table-download").disabled = false;
    byId("table-meta").textContent = (rows.length - 1) + " rows · " + rows[0].length + " columns";
  }

  function buildTable() {
    fail("table-error");
    byId("table-ai-status").textContent = "";
    try {
      showTable(tableData(tableInput.value));
    } catch (problem) {
      fail("table-error", problem.message);
    }
  }

  byId("table-form").addEventListener("submit", (event) => {
    event.preventDefault();
    buildTable();
  });
  byId("table-example").addEventListener("click", () => {
    tableInput.value = "Model,Input,Illustrative accuracy (%)\nDrugCMF,Multimodal features,92\nBaseline,Sequence features,81\nRandom forest,Descriptors,76";
    buildTable();
  });
  byId("table-ai").addEventListener("click", () => {
    if (!tableInput.reportValidity()) return;
    run("table-ai-status", "table-error", async (status) => {
      const result = await answer([
        { role: "system", content: 'Return a JSON object with keys headers and rows. Headers are 2–8 short strings and rows is an array of arrays of strings. Keep each row the same width as headers. Preserve user-provided data and never invent numbers, citations, or measurements. Use descriptive comparisons if no numeric data is supplied.' },
        { role: "user", content: tableInput.value.trim() },
      ], status, true);
      if (!Array.isArray(result.rows)) throw Error("The model did not return a table. Try a shorter request.");
      showTable([result.headers, ...result.rows]);
      status.textContent = "Table ready. Check the contents before export.";
    });
  });

  byId("table-download").addEventListener("click", () => {
    if (!renderedTable) return;
    const csv = renderedTable.map((row) => row.map((value) => {
      const text = String(value);
      const formula = /^\s*[=+@\-\t\r]/.test(text) && !/^[+-]?\d+(\.\d+)?$/.test(text.trim());
      const safe = formula ? "'" + text : text;
      return '"' + safe.replaceAll('"', '""') + '"';
    }).join(",")).join("\r\n");
    download(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), "ai4s-table.csv");
  });

  function message(role, content) {
    const article = document.createElement("article");
    const label = document.createElement("strong");
    const body = document.createElement("p");
    label.textContent = role === "user" ? "You" : "Assistant";
    body.textContent = content;
    article.append(label, body);
    chatView.append(article);
    chatView.scrollTop = chatView.scrollHeight;
  }

  byId("chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const question = chatInput.value.trim();
    if (!question || operations[2].disabled) return;
    if (!conversation.length) chatView.replaceChildren();
    message("user", question);
    chatInput.value = "";
    const prompt = { role: "user", content: question };
    run("chat-status", "chat-error", async (status) => {
      const reply = await answer([
        { role: "system", content: "You are a concise research and general question assistant. Answer in the language of the user. Be accurate about uncertainty. Do not invent references or claim to have browsed the web." },
        ...conversation.slice(-4),
        prompt,
      ], status);
      conversation.push(prompt, { role: "assistant", content: reply });
      message("assistant", reply);
      status.textContent = "Answer ready.";
    });
  });
})();
