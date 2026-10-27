// Learning Notes — a tiny Notion-style notes app.
// Notes are Markdown files in the notes/ folder of your GitHub repository.

const config = window.NOTES_CONFIG || {};
const hasGitHub = Boolean(config.owner && config.repo);
const branch = config.branch || "main";

const state = {
  notes: [],         // { file, title, tags, date, body }
  search: "",
  selectedTag: null,
};

const $ = (id) => document.getElementById(id);

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
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/notes?ref=${branch}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GitHub said ${res.status}`);
  const files = await res.json();
  return files
    .filter((f) => f.type === "file" && f.name.endsWith(".md"))
    .map((f) => ({ file: f.name, url: f.download_url }));
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
      source = `Notes from <a href="https://github.com/${config.owner}/${config.repo}/tree/${branch}/notes" target="_blank">${config.owner}/${config.repo}</a>`;
    } else {
      list = await listFromLocalFolder();
      source = "Local preview · fill in config.js to connect GitHub";
    }
  } catch (err) {
    source = `Couldn't load notes (${err.message}).`;
  }

  const notes = await Promise.all(
    list.map(async ({ file, url }) => {
      const res = await fetch(url, { cache: "no-store" });
      return parseNote(file, await res.text());
    })
  );

  if (notes.length === 0) notes.push(parseNote("welcome.md", WELCOME));

  // Newest first (by date, then by file name).
  notes.sort((a, b) => (b.date + b.file).localeCompare(a.date + a.file));
  state.notes = notes;
  $("source").innerHTML = source;
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
    actions.append(
      linkButton("Edit on GitHub", `${base}/edit/${branch}/notes/${encodeURIComponent(note.file)}`),
      linkButton("History", `${base}/commits/${branch}/notes/${encodeURIComponent(note.file)}`)
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

// ---------- New note editor ----------

const today = () => new Date().toISOString().slice(0, 10);

const slugify = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "note";

function renderEditor() {
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
          ${hasGitHub ? '<button class="btn primary" id="saveGitHub">Save to GitHub</button>' : ""}
          <button class="btn" id="download">Download .md</button>
          <a class="btn" href="#">Cancel</a>
        </div>
      </div>
      <p class="hint">${
        hasGitHub
          ? "“Save to GitHub” opens GitHub with your note already filled in. Just click <b>Commit changes</b> there, then come back and refresh this page."
          : "Not connected to GitHub yet (see GITHUB-GUIDE.md). For now, download the file and put it in the <code>notes/</code> folder."
      }</p>
    </div>`;

  const titleInput = $("titleInput");
  const tagsInput = $("tagsInput");
  const bodyInput = $("bodyInput");
  const preview = $("preview");

  // Keep a draft in the browser so nothing is lost if you close the tab.
  const draft = JSON.parse(localStorage.getItem("draft") || "{}");
  titleInput.value = draft.title || "";
  tagsInput.value = draft.tags || "";
  bodyInput.value = draft.body || "";

  const update = () => {
    preview.innerHTML = renderMarkdown(bodyInput.value || "*Preview appears here*");
    localStorage.setItem("draft", JSON.stringify({
      title: titleInput.value, tags: tagsInput.value, body: bodyInput.value,
    }));
  };
  [titleInput, tagsInput, bodyInput].forEach((el) => el.addEventListener("input", update));
  update();
  titleInput.focus();

  const buildFile = () => {
    const title = titleInput.value.trim() || "Untitled";
    const date = today();
    const content =
      `---\ntitle: ${title}\ntags: ${tagsInput.value.trim()}\ndate: ${date}\n---\n\n${bodyInput.value.trim()}\n`;
    return { filename: `${date}-${slugify(title)}.md`, content };
  };

  $("download").onclick = () => {
    const { filename, content } = buildFile();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (hasGitHub) {
    $("saveGitHub").onclick = () => {
      const { filename, content } = buildFile();
      const url =
        `https://github.com/${config.owner}/${config.repo}/new/${branch}` +
        `?filename=${encodeURIComponent("notes/" + filename)}&value=${encodeURIComponent(content)}`;
      window.open(url, "_blank");
      localStorage.removeItem("draft");
    };
  }
}

// ---------- Routing (#note=file.md or #new) ----------

function currentRoute() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash === "new") return { view: "new" };
  if (hash.startsWith("note=")) return { view: "note", file: hash.slice(5) };
  return { view: "note", file: state.notes[0] && state.notes[0].file };
}

function route() {
  const r = currentRoute();
  if (r.view === "new") {
    renderEditor();
  } else {
    const note = state.notes.find((n) => n.file === r.file) || state.notes[0];
    renderNote(note);
  }
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
