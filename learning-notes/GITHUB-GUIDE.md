# GitHub, in simple words 🐙

This guide takes you from "no account" to "my notes app is online".

---

## 1. What are Git and GitHub?

- **Git** is a program on your Mac that takes **save points** of a folder (like "save game" in a video game). Each save point is called a **commit**. You can always go back to an older one.
- **GitHub** is a website that keeps an **online copy** of your folder and all its save points. It's your backup, and it can also host your app as a website for free (**GitHub Pages**).
- A folder tracked by Git is called a **repository** (or **repo**).

```
Your Mac (folder + git)  ──push──▶  GitHub (online copy)  ──Pages──▶  Your website
                         ◀──pull──
```

---

## 2. Create your GitHub account (you do this)

1. Go to <https://github.com/signup>.
2. Enter your email, a password, and a **username**.
   - Your username appears in your app's link: `https://USERNAME.github.io/learning-notes`
3. Verify your email.

---

## 3. Connect this Mac to GitHub (you do this)

The easiest way is the **GitHub CLI** (a small helper program):

1. Go to <https://cli.github.com> and download the **macOS installer** (`.pkg`). Open it and click through.
2. Open the Terminal and run:
   ```bash
   gh auth login
   ```
3. Answer the questions: **GitHub.com** → **HTTPS** → **Yes** (authenticate Git) → **Login with a web browser**.
4. It shows a code. Your browser opens; paste the code and approve.

Done — now `git push` will work without typing passwords.

---

## 4. Tell Git who you are (one time)

Every save point records who made it:

```bash
git config --global user.name "Your Name"
```

```bash
git config --global user.email "the-email-you-used-on-github@example.com"
```

---

## 5. Create your repository on GitHub

1. On github.com click the **+** (top right) → **New repository**.
2. Name: `learning-notes`
3. Choose **Public** (needed for free GitHub Pages — so don't put secrets or confidential work info in notes).
4. **Don't** tick "Add a README" (we already have files).
5. Click **Create repository**.

Then open `config.js` in this folder and set your username:

```js
owner: "your-username",
```

---

## 6. Send your folder to GitHub (first time only)

Run these in this folder (or just ask Claude: *"connect this to my GitHub repo and push"*):

```bash
git remote add origin https://github.com/YOUR-USERNAME/learning-notes.git
```

```bash
git push -u origin main
```

- `remote add origin …` = "this is the address of my online copy; call it *origin*".
- `push` = "send my save points there".

Refresh the repo page on GitHub — your files are there! 🎉

---

## 7. The everyday commands

| Command | What it means |
|---|---|
| `git status` | "What changed since my last save point?" |
| `git add .` | "Include all these changes in the next save point." |
| `git commit -m "Add note about hooks"` | "Make the save point, with this message." |
| `git push` | "Send my save points to GitHub." |
| `git pull` | "Get changes that were made on GitHub (e.g., notes saved from the app)." |
| `git log --oneline` | "Show me my list of save points." |

The usual rhythm: **add → commit → push**.

> Important: notes you save with the app's **Save to GitHub** button are created *on GitHub*. Before working in this folder on your Mac, run `git pull` to get them.

---

## 8. Put your app online (GitHub Pages)

1. On your repo page: **Settings** → **Pages** (left menu).
2. Under **Build and deployment**: Source = **Deploy from a branch**.
3. Branch = **main**, folder = **/ (root)** → **Save**.
4. Wait 1–2 minutes. Your app is at:
   `https://YOUR-USERNAME.github.io/learning-notes`

Every time you push, the site updates by itself within a minute or two.

---

## 9. Your daily routine

1. Learn something with Claude Code.
2. Add a note — in the app (**+ New note → Save to GitHub → Commit changes**) or ask Claude: *"save a note about what I learned and push it"*.
3. Refresh your website. ✨

---

## 10. Glossary

- **Repository (repo):** a project folder tracked by Git.
- **Commit:** a save point, with a message describing the change.
- **Branch:** a separate line of save points. You'll mostly just use `main`.
- **Push / Pull:** send to / get from GitHub.
- **Remote / origin:** the online copy's address.
- **Clone:** download a repo from GitHub to a computer.
- **Pull request (PR):** a proposal to merge changes from one branch into another (useful later, when working with others).

---

## 11. "Oops" fixes

| Problem | Fix |
|---|---|
| `git push` says **rejected** / "fetch first" | Someone (maybe you, via the app) changed GitHub. Run `git pull`, then `git push`. |
| `remote origin already exists` | It's already connected. Just `git push`. |
| Authentication failed | Run `gh auth login` again. |
| My new note doesn't show on the site | Wait a minute and refresh. Check the file is in `notes/` and ends with `.md`. |
| I made a mistake in a note | Edit it and commit again — the old version is still in **History**. |

When stuck, ask Claude: *"explain this git error in simple words"* and paste the message.
