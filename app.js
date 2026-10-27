// Learning Notes — a tiny Notion-style notes app.
// Notes are Markdown files in the notes/ folder of your GitHub repository.

const config = window.NOTES_CONFIG || {};
const hasGitHub = Boolean(config.owner && config.repo);
const branch = config.branch || "main";
const API = `https://api.github.com/repos/${config.owner}/${config.repo}`;

const state = {
  notes: [],         // { file, title, tags, date, body }
  search: "",
  selectedTag: null,
};

const $ = (id) => document.getElementById(id);

// ---------- GitHub connection ----------
// The token is kept only in this browser (localStorage) and only sent to api.github.com.

const getToken = () => localStorage.getItem("githubToken") || "";
const isConnected = () => hasGitHub && Boolean(getToken());

function ghHeaders(extra = {}) {
  const headers = { Accept: "application/vnd.github+json", ...extra };
  if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
  return headers;
}

// Text → base64, safe for emoji and accents.
function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

// Creates or updates notes/<filename> on GitHub — this makes a commit.
// `sha` is the file's current version id (needed to update it). Returns the new one.
async function saveFileToGitHub(filename, content, message, sha) {
  const url = `${API}/contents/notes/${encodeURIComponent(filename)}`;
  if (!sha) {
    const existing = await fetch(`${url}?ref=${branch}&t=${Date.now()}`, { headers: ghHeaders(), cache: "no-store" });
    if (existing.ok) sha = (await existing.json()).sha;
  }

  const res = await fetch(url, {
    method: "PUT",
    headers: ghHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ message, content: toBase64(content), branch, sha }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub said ${res.status}`);
  }
  return (await res.json()).content.sha;
}

// Checks a token with GitHub and stores it. Returns an error message, or "" if it worked.
async function connectWithToken(token) {
  if (!token) return "Paste your token in the box first.";
  const res = await fetch(API, { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` } });
  const repo = res.ok ? await res.json() : null;
  if (!repo) return "❌ GitHub didn't accept that token. Make a new one and copy it with the 📋 icon.";
  if (!repo.permissions || !repo.permissions.push) {
    return "❌ That token can read but not save. Make a new one with the public_repo box ticked.";
  }
  localStorage.setItem("githubToken", token);
  return "";
}

const TOKEN_STEPS = `
  <ol>
    <li>Open <a href="https://github.com/settings/tokens/new?description=learning-notes%20app&scopes=public_repo" target="_blank">this GitHub page</a> (it's already filled in for you).</li>
    <li>Choose <b>Expiration: 90 days</b>, scroll down and click <b>Generate token</b>.</li>
    <li>Click the 📋 copy icon next to the <code>ghp_…</code> token, paste it below and click <b>Connect</b>.</li>
  </ol>`;

// ---------- Loading notes ----------

// Splits "---\ntitle: x\n---\nbody" into { meta, body }.
function parseNote(file, text) {
  const meta = {};
  let body = text;
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (match) {
    body = match[2];
    for (const line of match[1].split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
  }
  return {
    file,
    title: meta.title || file.replace(/\.md$/, "").replace(/[-_]/g, " "),
    tags: (meta.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
    date: meta.date || "",
    body,
  };
}

// Online: ask GitHub which files are in notes/, then download each one.
async function listFromGitHub() {
  const res = await fetch(`${API}/contents/notes?ref=${branch}&t=${Date.now()}`, {
    headers: ghHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GitHub said ${res.status}`);
  const files = await res.json();
  return files
    .filter((f) => f.type === "file" && f.name.endsWith(".md"))
    .map((f) =>
      isConnected()
        // Connected: read through the API, which always has the latest version.
        ? { file: f.name, url: `${f.url}&t=${Date.now()}`, headers: ghHeaders({ Accept: "application/vnd.github.raw" }) }
        : { file: f.name, url: f.download_url }
    );
}

// Local preview (python3 -m http.server): read the folder listing page.
async function listFromLocalFolder() {
  const res = await fetch("notes/");
  if (!res.ok) throw new Error("No local notes folder");
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll("a")]
    .map((a) => decodeURIComponent(a.getAttribute("href") || ""))
    .filter((href) => href.endsWith(".md") && !href.includes("/"))
    .map((file) => ({ file, url: `notes/${encodeURIComponent(file)}` }));
}

async function loadNotes() {
  let list = [];
  let source = "";
  try {
    if (hasGitHub) {
      list = await listFromGitHub();
      source = `Notes from <a href="https://github.com/${config.owner}/${config.repo}/tree/${branch}/notes" target="_blank">${config.owner}/${config.repo}</a><br>` +
        (isConnected() ? `✅ Connected · <a href="#connect">settings</a>` : `<a href="#connect">🔗 Connect GitHub for one-click saving</a>`);
    } else {
      list = await listFromLocalFolder();
      source = "Local preview · fill in config.js to connect GitHub";
    }
  } catch (err) {
    source = `Couldn't load notes (${err.message}). <a href="#connect">Settings</a>`;
  }

  const notes = await Promise.all(
    list.map(async ({ file, url, headers }) => {
      const res = await fetch(url, { cache: "no-store", headers });
      return parseNote(file, await res.text());
    })
  );

  if (notes.length === 0) notes.push(parseNote("welcome.md", WELCOME));
  state.notes = notes;
  sortNotes();
  $("source").innerHTML = source;
}

// Newest first (by date, then by file name).
function sortNotes() {
  state.notes.sort((a, b) => (b.date + b.file).localeCompare(a.date + a.file));
}

// ---------- Rendering ----------

function renderMarkdown(md) {
  if (window.marked && window.DOMPurify) {
    return DOMPurify.sanitize(marked.parse(md));
  }
  // Fallback if the CDN can't be reached: show plain text.
  const pre = document.createElement("pre");
  pre.textContent = md;
  return pre.outerHTML;
}

function filteredNotes() {
  const q = state.search.toLowerCase();
  return state.notes.filter((n) => {
    if (state.selectedTag && !n.tags.includes(state.selectedTag)) return false;
    if (!q) return true;
    return (n.title + " " + n.tags.join(" ") + " " + n.body).toLowerCase().includes(q);
  });
}

function renderSidebar() {
  const currentFile = currentRoute().file;

  // Tag chips
  const allTags = [...new Set(state.notes.flatMap((n) => n.tags))].sort();
  const tagsEl = $("tags");
  tagsEl.innerHTML = "";
  for (const tag of allTags) {
    const btn = document.createElement("button");
    btn.className = "tag" + (state.selectedTag === tag ? " selected" : "");
    btn.textContent = "#" + tag;
    btn.onclick = () => {
      state.selectedTag = state.selectedTag === tag ? null : tag;
      renderSidebar();
    };
    tagsEl.appendChild(btn);
  }

  // Note list
  const listEl = $("noteList");
  listEl.innerHTML = "";
  const notes = filteredNotes();
  if (notes.length === 0) {
    listEl.innerHTML = '<div class="empty">No matching notes</div>';
  }
  for (const note of notes) {
    const a = document.createElement("a");
    a.className = "note-link" + (note.file === currentFile ? " active" : "");
    a.href = "#note=" + encodeURIComponent(note.file);
    a.textContent = "📄 " + note.title;
    if (note.date) {
      const small = document.createElement("small");
      small.textContent = note.date;
      a.appendChild(small);
    }
    listEl.appendChild(a);
  }
}

function renderNote(note) {
  const main = $("main");
  main.innerHTML = `
    <article class="page">
      <h1 class="title"></h1>
      <div class="meta">
        <span class="date"></span>
        <span class="note-tags"></span>
        <div class="actions"></div>
      </div>
      <div class="content">${renderMarkdown(note.body)}</div>
    </article>`;
  main.querySelector(".title").textContent = note.title;
  main.querySelector(".date").textContent = note.date;
  main.querySelector(".note-tags").textContent = note.tags.map((t) => "#" + t).join("  ");

  const actions = main.querySelector(".actions");
  if (hasGitHub) {
    const edit = document.createElement("a");
    edit.className = "btn";
    edit.href = "#edit=" + encodeURIComponent(note.file);
    edit.textContent = "Edit";
    actions.append(
      edit,
      linkButton("History", `https://github.com/${config.owner}/${config.repo}/commits/${branch}/notes/${encodeURIComponent(note.file)}`)
    );
  }
  main.scrollTop = 0;
}

function linkButton(label, href) {
  const a = document.createElement("a");
  a.className = "btn";
  a.href = href;
  a.target = "_blank";
  a.textContent = label;
  return a;
}

// ---------- Editor (new note, or editing an existing one) — saves automatically ----------

const today = () => new Date().toISOString().slice(0, 10);

const slugify = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "note";

const AUTOSAVE_DELAY = 2000; // ms after you stop typing

function renderEditor(existing) {
  const main = $("main");
  main.innerHTML = `
    <div class="page">
      <div id="connectBox"></div>
      <input class="title-input" id="titleInput" placeholder="Untitled" />
      <input class="tags-input" id="tagsInput" placeholder="Tags, separated by commas (e.g. claude-code, git)" />
      <div class="editor-grid">
        <textarea class="body-input" id="bodyInput" placeholder="Write what you learned… Markdown works: **bold**, - lists, \`code\`"></textarea>
        <div class="preview content" id="preview"></div>
      </div>
      <div class="meta" style="border:none; margin-top:16px">
        <span class="hint" id="status" style="margin:0"></span>
        <div class="actions">
          <button class="btn primary" id="done">Done</button>
        </div>
      </div>
    </div>`;

  const titleInput = $("titleInput");
  const tagsInput = $("tagsInput");
  const bodyInput = $("bodyInput");
  const preview = $("preview");
  const status = $("status");

  // Which file this note is saved as, and its GitHub version id.
  let file = existing ? existing.file : null;
  let sha;
  let date = existing ? existing.date || today() : today();
  let dirty = false;
  let saving = null; // the save in progress, if any
  let timer;

  if (existing) {
    titleInput.value = existing.title;
    tagsInput.value = existing.tags.join(", ");
    bodyInput.value = existing.body.trim();
  } else {
    // Unsaved text is also kept in the browser, so nothing is lost if you close the tab.
    const draft = JSON.parse(localStorage.getItem("draft") || "{}");
    titleInput.value = draft.title || "";
    tagsInput.value = draft.tags || "";
    bodyInput.value = draft.body || "";
    dirty = Boolean(draft.title || draft.body);
  }

  const isEmpty = () => !titleInput.value.trim() && !bodyInput.value.trim();

  const buildContent = () =>
    `---\ntitle: ${titleInput.value.trim() || "Untitled"}\ntags: ${tagsInput.value.trim()}\ndate: ${date}\n---\n\n${bodyInput.value.trim()}\n`;

  const setStatus = (text) => (status.textContent = text);

  async function save() {
    if (saving) await saving; // one save at a time
    if (!dirty || isEmpty() || !isConnected()) return;
    dirty = false;
    const title = titleInput.value.trim() || "Untitled";
    const content = buildContent();
    const isNew = !file;
    if (!file) file = `${date}-${slugify(title)}.md`;
    setStatus("Saving…");
    saving = (async () => {
      try {
        sha = await saveFileToGitHub(file, content, `${isNew ? "Add" : "Update"} note: ${title}`, sha);
        // Show it in the sidebar right away.
        state.notes = state.notes.filter((n) => n.file !== file);
        state.notes.push(parseNote(file, content));
        sortNotes();
        renderSidebar();
        if (!existing) localStorage.removeItem("draft");
        setStatus("Saved ✓");
      } catch (err) {
        dirty = true;
        setStatus(`Not saved yet (${err.message}). Retrying when you type again.`);
      }
    })();
    await saving;
    saving = null;
  }

  const onChange = () => {
    dirty = true;
    preview.innerHTML = renderMarkdown(bodyInput.value || "*Preview appears here*");
    if (!existing) {
      localStorage.setItem("draft", JSON.stringify({
        title: titleInput.value, tags: tagsInput.value, body: bodyInput.value,
      }));
    }
    if (isConnected()) {
      setStatus("Editing…");
      clearTimeout(timer);
      timer = setTimeout(save, AUTOSAVE_DELAY);
    }
  };
  [titleInput, tagsInput, bodyInput].forEach((el) => el.addEventListener("input", onChange));
  preview.innerHTML = renderMarkdown(bodyInput.value || "*Preview appears here*");
  (existing ? bodyInput : titleInput).focus();

  // "Done": save anything pending, then show the note.
  $("done").onclick = async () => {
    clearTimeout(timer);
    await save();
    location.hash = file ? "note=" + encodeURIComponent(file) : "";
  };

  // Save before leaving the page too.
  window.onbeforeunload = () => (dirty && isConnected() && !isEmpty() ? true : undefined);

  // Not connected yet: show the one-time connect box at the top of the editor.
  if (isConnected()) {
    setStatus(existing ? "Changes save automatically." : "Start typing — it saves automatically.");
  } else if (hasGitHub) {
    const box = $("connectBox");
    box.innerHTML = `
      <div class="content connect-box">
        <p><b>One-time step:</b> connect GitHub so your notes save automatically.</p>
        ${TOKEN_STEPS}
        <input id="tokenInput" class="search" type="password" placeholder="Paste your token here (ghp_…)" autocomplete="off" />
        <button class="btn primary" id="connectBtn">Connect</button>
        <span class="hint" id="connectMsg"></span>
      </div>`;
    setStatus("Your text is kept in this browser until you connect.");
    $("connectBtn").onclick = async () => {
      $("connectMsg").textContent = "Checking with GitHub…";
      const error = await connectWithToken($("tokenInput").value.trim());
      if (error) {
        $("connectMsg").textContent = error;
        return;
      }
      box.innerHTML = "";
      $("source").innerHTML = $("source").innerHTML.replace(/<a href="#connect">🔗[^<]*<\/a>/, '✅ Connected · <a href="#connect">settings</a>');
      setStatus("Connected ✓");
      dirty = !isEmpty();
      save();
    };
  }
}

// ---------- Connect GitHub (settings page) ----------

function renderConnect() {
  const main = $("main");
  const connected = isConnected();
  main.innerHTML = `
    <div class="page">
      <h1 class="title">🔗 Connect GitHub</h1>
      <div class="content">
        ${connected
          ? "<p>✅ <b>This browser is connected.</b> Notes save to your GitHub repository automatically.</p>"
          : `<p>Do this <b>once per browser</b>. After that, notes save to GitHub automatically while you type.</p>
             ${TOKEN_STEPS}`}
        <p class="hint">The token is stored only in this browser and only sent to GitHub. Don't share it with anyone (or paste it in a chat).</p>
      </div>
      ${connected ? "" : `<input id="tokenInput" class="search" type="password" placeholder="Paste your token here (ghp_…)" style="width:100%; margin:8px 0" autocomplete="off" />`}
      <div class="meta" style="border:none">
        <div class="actions" style="margin-left:0">
          ${connected
            ? '<button class="btn" id="disconnect">Disconnect this browser</button>'
            : '<button class="btn primary" id="connect">Connect</button>'}
          <a class="btn" href="#">Back to notes</a>
        </div>
      </div>
      <p class="hint" id="connectMsg"></p>
    </div>`;

  if (connected) {
    $("disconnect").onclick = async () => {
      localStorage.removeItem("githubToken");
      await loadNotes();
      renderConnect();
      renderSidebar();
    };
    return;
  }

  $("connect").onclick = async () => {
    $("connectMsg").textContent = "Checking with GitHub…";
    const error = await connectWithToken($("tokenInput").value.trim());
    if (error) {
      $("connectMsg").textContent = error;
      return;
    }
    await loadNotes();
    location.hash = "";
    route();
  };
}

// ---------- Routing (#note=file.md, #new, #edit=file.md, #connect) ----------

function currentRoute() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash === "new") return { view: "new" };
  if (hash === "connect") return { view: "connect" };
  if (hash.startsWith("edit=")) return { view: "edit", file: hash.slice(5) };
  if (hash.startsWith("note=")) return { view: "note", file: hash.slice(5) };
  return { view: "note", file: state.notes[0] && state.notes[0].file };
}

function route() {
  const r = currentRoute();
  const note = state.notes.find((n) => n.file === r.file);
  window.onbeforeunload = null;
  if (r.view === "new") renderEditor();
  else if (r.view === "connect") renderConnect();
  else if (r.view === "edit" && note) renderEditor(note);
  else renderNote(note || state.notes[0]);
  renderSidebar();
}

// ---------- Start ----------

const WELCOME = `---
title: Welcome 👋
tags: start-here
---
This is your notes app. Add Markdown files to the \`notes/\` folder and they show up here.

See **GITHUB-GUIDE.md** to put it online.
`;

$("newNoteBtn").onclick = () => (location.hash = "new");
$("search").addEventListener("input", (e) => {
  state.search = e.target.value;
  renderSidebar();
});
window.addEventListener("hashchange", route);

loadNotes().then(route);
