# AI4SFiguresByasim

A no-subscription research workspace for scientific figures, tables, and general Q&A.

- **Figure studio** supports scientific briefs with Stage or Panel headings, graphical abstracts, data charts, and linear flowcharts. The illustrated renderer uses an equipment and biology symbol library, and exports SVG or PNG.
- **Table builder** accepts CSV, TSV, and Markdown tables. It exports CSV.
- **Local AI** can translate free-form prompts to supported figure or table formats and answer follow-up questions. WebLLM downloads an open Qwen model to the browser on first use, requires WebGPU, and runs inference on the device. Review generated scientific labels and answers. It has no live web access and does not render photorealistic images.
- **Accounts** use a Python Flask service and SQLite. Figure and table tools remain available without signing in.

## Public frontend

Deploy the contents of dist at the repository root with GitHub Pages. GitHub Pages serves the frontend. To enable login and signup, serve the same frontend from the Python app.

## Run the Python app

From the repository root, run:

    python -m venv .venv
    python -m pip install -r requirements.txt
    python server.py

Activate the virtual environment before installing and running. Open http://127.0.0.1:8080 to use both the workspace and the account features. For HTTPS hosting, configure the WSGI application as server:create_app(), set AI4S_ORIGIN to the exact HTTPS origin, and set AI4S_DATABASE to a private persistent SQLite file. Keep the database outside the public web directory. Secure cookies are enabled for the WSGI app. The local command listens only on loopback.
