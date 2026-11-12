---
title: AI connections
order: 21
group: features
summary: Connect an AI to the parts of Daymark you choose, with activity history and a local option.
related: sync, backups, sections
---
## Web
1. Sign in to your Daymark server. Open **Settings → AI connections** and copy **Connector address**. Hosted access needs `DAYMARK_PUBLIC_URL` set to the HTTPS origin; `DAYMARK_MCP=off` disables the hosted endpoint.
2. In **Claude**, use Settings → Connectors → Add custom connector. Workspace administrators may need to allow it. In **Claude Code**, run `claude mcp add --transport http daymark <address>`. In **ChatGPT**, use connectors / developer mode to add a remote MCP server with OAuth. Availability and labels depend on the account; owner account checks are pending.
3. On Daymark's consent page, enter your **Daymark password**, name the connection, choose **Read and write** or **Read only**, select sharing areas, then **Allow access**.
4. Ask “what's my day?” The AI uses `get_day_summary` for a short spoken rundown. AI writes reach devices through normal sync.

**Scope and control**

Share **Everything**, daily headings across all dates, note folders including subfolders, the whole **Backlog**, or **Habits**. Heading matching ignores case and surrounding whitespace. A top-level folder grant covers only top-level notes. Reads, search, summaries and ordinary writes stay within scope. Renamed headings may need granting again.

Under **Connections**, **Edit** changes scope and **Full access / Read only**. **Revoke** disconnects a hosted client; add it again to reconnect. The built-in **Local** connection can be edited but not revoked. Turn **AI access** off to refuse tool calls while keeping connections. Only signed-in Daymark devices manage these settings.

Set **Time zone** for “today”. The first device opening the tab supplies its zone when unset; server fallbacks are `DAYMARK_TZ`, then UTC.

**Activity and feedback**

**Activity** records reads, writes, refusals, errors, connections, refreshes and revocations. Filter by connection or action; **Load more** shows older entries. **Keep activity for** offers 7 days, 30 days (default), or **Custom…** (1–365 days). The HTTP server prunes old daily files on startup and daily. Entries contain identifiers and sometimes titles/counts, without note bodies or tokens.

For ideas, bugs or complaints about Daymark, ask the AI to use `submit_daymark_feedback`. **Daymark feedback goes to** selects **Backlog** (default), **A section**, or **A note folder**. Feedback is tagged `daymark-feedback`. Submission works with read-only access or an unshared destination but never exposes that destination's contents.

**Local mode and the skill**

**Option A:** run Daymark on your computer, restrict network access to loopback, and set `DAYMARK_PUBLIC_URL=http://localhost:3000`. A local MCP client connects to `http://localhost:3000/mcp` using OAuth. Browse the local vault at localhost.

**Option B:** stop any server using the folder, then configure Claude Desktop to launch stdio. Replace both paths with absolute paths:

`{"mcpServers":{"daymark":{"command":"npx","args":["tsx","<repo>/server/mcp-stdio.ts","--data","<folder>"]}}}`

From the repo, use `npm run mcp:stdio -- --data <folder>`. There is no HTTP or OAuth; the OS user is trusted. Local defaults to full access; scope, AI access and audit still apply. A lock prevents simultaneous server/stdio use of one folder. Stop stdio before opening that folder with the server to edit settings. Use a separate local vault; it does not sync to the hosted server or phone. Cloud clients can still send tool results to their provider; fully local use also requires a local AI client/model.

Install the repository's `skills/daymark/SKILL.md` in your client's skill location (Claude Code: `.claude/skills/daymark/SKILL.md`). It teaches summaries, safe edits and feedback. MCP supplies condensed instructions too.

## Phone
1. Sign in to your Daymark server. Open **Settings → AI connections** and copy **Connector address**. Hosted access needs `DAYMARK_PUBLIC_URL` set to the HTTPS origin; `DAYMARK_MCP=off` disables the hosted endpoint.
2. In **Claude**, use Settings → Connectors → Add custom connector. Workspace administrators may need to allow it. In **Claude Code**, run `claude mcp add --transport http daymark <address>`. In **ChatGPT**, use connectors / developer mode to add a remote MCP server with OAuth. Availability and labels depend on the account; owner account checks are pending.
3. On Daymark's consent page, enter your **Daymark password**, name the connection, choose **Read and write** or **Read only**, select sharing areas, then **Allow access**.
4. Ask “what's my day?” The AI uses `get_day_summary` for a short spoken rundown. AI writes reach devices through normal sync.

**Scope and control**

Share **Everything**, daily headings across all dates, note folders including subfolders, the whole **Backlog**, or **Habits**. Heading matching ignores case and surrounding whitespace. A top-level folder grant covers only top-level notes. Reads, search, summaries and ordinary writes stay within scope. Renamed headings may need granting again.

Under **Connections**, **Edit** changes scope and **Full access / Read only**. **Revoke** disconnects a hosted client; add it again to reconnect. The built-in **Local** connection can be edited but not revoked. Turn **AI access** off to refuse tool calls while keeping connections. Only signed-in Daymark devices manage these settings.

Set **Time zone** for “today”. The first device opening the tab supplies its zone when unset; server fallbacks are `DAYMARK_TZ`, then UTC.

**Activity and feedback**

**Activity** records reads, writes, refusals, errors, connections, refreshes and revocations. Filter by connection or action; **Load more** shows older entries. **Keep activity for** offers 7 days, 30 days (default), or **Custom…** (1–365 days). The HTTP server prunes old daily files on startup and daily. Entries contain identifiers and sometimes titles/counts, without note bodies or tokens.

For ideas, bugs or complaints about Daymark, ask the AI to use `submit_daymark_feedback`. **Daymark feedback goes to** selects **Backlog** (default), **A section**, or **A note folder**. Feedback is tagged `daymark-feedback`. Submission works with read-only access or an unshared destination but never exposes that destination's contents.

**Local mode and the skill**

**Option A:** run Daymark on your computer, restrict network access to loopback, and set `DAYMARK_PUBLIC_URL=http://localhost:3000`. A local MCP client connects to `http://localhost:3000/mcp` using OAuth. Browse the local vault at localhost.

**Option B:** stop any server using the folder, then configure Claude Desktop to launch stdio. Replace both paths with absolute paths:

`{"mcpServers":{"daymark":{"command":"npx","args":["tsx","<repo>/server/mcp-stdio.ts","--data","<folder>"]}}}`

From the repo, use `npm run mcp:stdio -- --data <folder>`. There is no HTTP or OAuth; the OS user is trusted. Local defaults to full access; scope, AI access and audit still apply. A lock prevents simultaneous server/stdio use of one folder. Stop stdio before opening that folder with the server to edit settings. Use a separate local vault; it does not sync to the hosted server or phone. Cloud clients can still send tool results to their provider; fully local use also requires a local AI client/model.

Install the repository's `skills/daymark/SKILL.md` in your client's skill location (Claude Code: `.claude/skills/daymark/SKILL.md`). It teaches summaries, safe edits and feedback. MCP supplies condensed instructions too.
