---
title: Claude Code notes
tags: 
date: 2026-10-27
---

<h2>The Explore → Plan → Code → Commit Workflow</h2>

Explore gives Claude the relevant context it needs for your project.
Plan creates a plan of action that Claude uses to measure success.
Code is the back and forth between you and Claude before settling on the final outcome.
Commit helps you review and push your code so you can start on your next feature.

<b> Code</b>
<p>
Define a success criteria. For Claude to be confident in its results, it needs to be clear on what "correct" looks like. Make this explicit when writing your plan.


Add tools. Tools that help Claude complete its goals remove a lot of back and forth. For example, if you're building web UIs, install the Claude in Chrome extension so Claude Code can control a browser tab and test the UI directly.

Include a test suite. Give Claude a test suite it can continuously validate against. Claude can even write tests for you. Before handing this off, make sure the tests are a reliable source of truth to avoid false positives.

<b> Commit </b>
<p>
Before you commit, run a subagent /code-reviewer to look at your work. A subagent gets a fresh pair of eyes on the codebase — it doesn't carry the bias the main agent might have from the session.

<h2>Context Management
</h2>

<p>
/compact

/context - to see the context

recommendation: /clear- start from scratch

use subagents for a task that on I need the answer for

for what I do want Claude to remember, add to the Claude.md file

<h2>Code Review
</h2>

<p>
https://anthropic.skilljar.com/claude-code-101/469794
(need to go deeper into this)

<h2>Claude MD
</h2>
<p>
It's a Markdown file you add to the root of your project, and Claude Code reads it automatically every time you start a session. Think of it as an onboarding script for your codebase. The contents of the CLAUDE.md file are appended to your prompt.
/init - creates one based on your codebase-----<p>
-----

# Project

This is a Next.js 15 app using the App Router, Tailwind, and Drizzle ORM.

# Commands
- Dev server: `pnpm dev`
- Run tests: `pnpm test`
- Lint: `pnpm lint`

# Code Style
- Use 2-space indentation
- Prefer named exports
- All API routes go in app/api/
- Use server actions instead of API routes where possible


-----
