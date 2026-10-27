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
async function saveFileToGitHub(filename, content, message) {
  const url = `${API}/contents/notes/${encodeURIComponent(filename)}`;
  // Updating an existing file needs its current "sha" (its version id).
  let sha;
  const existing = await fetch(`${url}?ref=${branch}&t=${Date.now()}`, { headers: ghHeaders(), cache: "no-store" });
  if (existing.ok) sha = (await existing.json()).sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: ghHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ message, content: toBase64(content), branch, sha }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub said ${res.status}`);
  }
}

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
    const base = `https://github.com/${config.owner}/${config.repo}`;
    const fileUrl = `${branch}/notes/${encodeURIComponent(note.file)}`;
    if (isConnected()) {
      const edit = document.createElement("a");
      edit.className = "btn";
      edit.href = "#edit=" + encodeURIComponent(note.file);
      edit.textContent = "Edit";
      actions.append(edit);
    } else {
      actions.append(linkButton("Edit on GitHub", `${base}/edit/${fileUrl}`));
    }
    actions.append(linkButton("History", `${base}/commits/${fileUrl}`));
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

// ---------- Editor (new note, or editing an existing one) ----------

const today = () => new Date().toISOString().slice(0, 10);

const slugify = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "note";

function renderEditor(existing) {
  const connected = isConnected();
  const main = $("main");
  main.innerHTML = `
    <div class="page">
      <input class="title-input" id="titleInput" placeholder="Untitled" />
      <input class="tags-input" id="tagsInput" placeholder="Tags, separated by commas (e.g. claude-code, git)" />
      <div class="editor-grid">
        <textarea class="body-input" id="bodyInput" placeholder="Write what you learned… Markdown works: **bold**, - lists, \`code\`"></textarea>
        <div class="preview content" id="preview"></div>
      </div>
      <div class="meta" style="border:none; margin-top:16px">
        <div class="actions" style="margin-left:0">
          ${connected ? '<button class="btn primary" id="save">Save</button>' : ""}
          ${hasGitHub && !connected ? '<button class="btn primary" id="saveGitHub">Save to GitHub</button>' : ""}
          <button class="btn" id="download">Download .md</button>
          <a class="btn" href="${existing ? "#note=" + encodeURIComponent(existing.file) : "#"}">Cancel</a>
        </div>
      </div>
      <p class="hint" id="status">${
        connected
          ? "Tip: press <b>Cmd + S</b> to save."
          : hasGitHub
            ? "Want one-click saving? <a href='#connect'>Connect GitHub</a> once."
            : "Not connected to GitHub yet (see GITHUB-GUIDE.md). For now, download the file and put it in the <code>notes/</code> folder."
      }</p>
    </div>`;

  const titleInput = $("titleInput");
  const tagsInput = $("tagsInput");
  const bodyInput = $("bodyInput");
  const preview = $("preview");
  const status = $("status");

  if (existing) {
    titleInput.value = existing.title;
    tagsInput.value = existing.tags.join(", ");
    bodyInput.value = existing.body.trim();
  } else {
    // Keep a draft in the browser so nothing is lost if you close the tab.
    const draft = JSON.parse(localStorage.getItem("draft") || "{}");
    titleInput.value = draft.title || "";
    tagsInput.value = draft.tags || "";
    bodyInput.value = draft.body || "";
  }

  const update = () => {
    preview.innerHTML = renderMarkdown(bodyInput.value || "*Preview appears here*");
    if (!existing) {
      localStorage.setItem("draft", JSON.stringify({
        title: titleInput.value, tags: tagsInput.value, body: bodyInput.value,
      }));
    }
  };
  [titleInput, tagsInput, bodyInput].forEach((el) => el.addEventListener("input", update));
  update();
  (existing ? bodyInput : titleInput).focus();

  const buildFile = () => {
    const title = titleInput.value.trim() || "Untitled";
    const date = existing ? existing.date || today() : today();
    const content =
      `---\ntitle: ${title}\ntags: ${tagsInput.value.trim()}\ndate: ${date}\n---\n\n${bodyInput.value.trim()}\n`;
    const filename = existing ? existing.file : `${date}-${slugify(title)}.md`;
    return { filename, content, title };
  };

  $("download").onclick = () => {
    const { filename, content } = buildFile();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (connected) {
    let saving = false;
    const save = async () => {
      if (saving) return;
      saving = true;
      const btn = $("save");
      btn.disabled = true;
      btn.textContent = "Saving…";
      const { filename, content, title } = buildFile();
      try {
        await saveFileToGitHub(filename, content, `${existing ? "Update" : "Add"} note: ${title}`);
        // Show it right away instead of waiting for GitHub to refresh its lists.
        state.notes = state.notes.filter((n) => n.file !== filename);
        state.notes.push(parseNote(filename, content));
        sortNotes();
        if (!existing) localStorage.removeItem("draft");
        location.hash = "note=" + encodeURIComponent(filename);
      } catch (err) {
        status.textContent = `❌ Couldn't save: ${err.message}. Your text is still here — try again, or check your connection in settings.`;
        btn.disabled = false;
        btn.textContent = "Save";
        saving = false;
      }
    };
    $("save").onclick = save;
    main.onkeydown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
  }

  if (hasGitHub && !connected) {
    $("saveGitHub").onclick = () => {
      const { filename, content } = buildFile();
      const url =
        `https://github.com/${config.owner}/${config.repo}/new/${branch}` +
        `?filename=${encodeURIComponent("notes/" + filename)}&value=${encodeURIComponent(content)}`;
      window.open(url, "_blank");
      renderSaveSteps(url, filename);
    };
  }
}

// After "Save to GitHub" (not connected): remind the user to commit, and keep the draft until they have.
function renderSaveSteps(url, filename) {
  const main = $("main");
  main.innerHTML = `
    <div class="page">
      <h1 class="title">Almost saved! 📝</h1>
      <div class="content">
        <p>Your note opened in a <b>new GitHub tab</b>. It is <b>not saved yet</b>.</p>
        <ol>
          <li>Go to the GitHub tab.</li>
          <li>Scroll down and click the green <b>Commit changes</b> button (click it again if a box pops up).</li>
          <li>Come back here and click <b>I committed it</b>.</li>
        </ol>
        <p>Don't see a GitHub tab? Click <b>Open GitHub again</b>.</p>
        <p>Tired of these steps? <a href="#connect">Connect GitHub once</a> and Save becomes one click.</p>
      </div>
      <div class="meta" style="border:none">
        <div class="actions" style="margin-left:0">
          <button class="btn primary" id="committed">I committed it</button>
          <a class="btn" id="reopen" target="_blank">Open GitHub again</a>
          <a class="btn" href="#new">Back to editing</a>
        </div>
      </div>
      <p class="hint" id="waitMsg"></p>
    </div>`;
  $("reopen").href = url;

  $("committed").onclick = async () => {
    const msg = $("waitMsg");
    // GitHub can take up to a minute to show new files, so check a few times.
    for (let attempt = 1; attempt <= 12; attempt++) {
      msg.textContent = `Looking for your note on GitHub… (try ${attempt} of 12)`;
      await loadNotes();
      if (state.notes.some((n) => n.file === filename)) {
        localStorage.removeItem("draft");
        location.hash = "note=" + encodeURIComponent(filename);
        route();
        return;
      }
      await new Promise((r) => setTimeout(r, 10000));
    }
    msg.textContent =
      "Still can't find it. Check that you clicked Commit changes on GitHub. Your draft is kept, so nothing is lost.";
  };
}

// ---------- Connect GitHub (one-time setup) ----------

function renderConnect() {
  const main = $("main");
  const connected = isConnected();
  main.innerHTML = `
    <div class="page">
      <h1 class="title">🔗 Connect GitHub</h1>
      <div class="content">
        ${connected
          ? "<p>✅ <b>This browser is connected.</b> Save and Edit write straight to your GitHub repository.</p>"
          : `<p>Do this <b>once per browser</b>. After that, <b>Save</b> puts your note on GitHub in one click.</p>
        <ol>
          <li>Open <a href="https://github.com/settings/tokens/new?description=learning-notes%20app&scopes=public_repo" target="_blank">this GitHub page</a> (it's already filled in for you).</li>
          <li>Choose <b>Expiration: 90 days</b>, scroll down and click <b>Generate token</b>.</li>
          <li>Click the 📋 copy icon next to the <code>ghp_…</code> token.</li>
          <li>Paste it in the box below and click <b>Connect</b>.</li>
        </ol>
        <p class="hint">The token is stored only in this browser and only sent to GitHub. Don't share it with anyone (or paste it in a chat).</p>`}
      </div>
      ${connected ? "" : `
      <input id="tokenInput" class="search" type="password" placeholder="Paste your token here (ghp_…)" style="width:100%; margin:8px 0" autocomplete="off" />`}
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
    const token = $("tokenInput").value.trim();
    const msg = $("connectMsg");
    if (!token) {
      msg.textContent = "Paste your token in the box first.";
      return;
    }
    msg.textContent = "Checking with GitHub…";
    const res = await fetch(API, { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` } });
    const repo = res.ok ? await res.json() : null;
    if (!repo) {
      msg.textContent = "❌ GitHub didn't accept that token. Make a new one and copy it with the 📋 icon.";
      return;
    }
    if (!repo.permissions || !repo.permissions.push) {
      msg.textContent = "❌ That token can read but not save. Make a new one with the public_repo box ticked.";
      return;
    }
    localStorage.setItem("githubToken", token);
    msg.textContent = "✅ Connected!";
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
  if (r.view === "new") renderEditor();
  else if (r.view === "connect") renderConnect();
  else if (r.view === "edit" && note && isConnected()) renderEditor(note);
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
