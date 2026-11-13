---
title: AI clients and the skill
order: 22
group: features
summary: Add Daymark to Claude, ChatGPT, Codex or another MCP client, and install the Daymark skill.
related: ai-connections
---
## Web
1. In Daymark, open **Settings → AI connections** and copy **Connector address** (it ends in `/mcp`).
2. Add it to your AI client using the first table below.
3. Approve Daymark's consent page: your **Daymark password**, then access and sharing areas (see **AI connections**).
4. Download the skill from `https://dngioidev.github.io/daymark/daymark-skill.zip` and install it using the second table.
5. Ask “what's my day?” to check the connection.

**Add the connector**

| Client | Steps |
|---|---|
| Claude (web, desktop) | Settings → Connectors → **Add custom connector**, paste the address. Workspace admins may need to allow it. |
| Claude Code | `claude mcp add --transport http daymark <address>`, then `/mcp` to sign in. |
| ChatGPT (web) | Settings → Apps (or Connectors) → Advanced → turn on **Developer mode**, then **Create**: paste the address and choose **OAuth**. Workspace admins enable developer mode first; plans vary. |
| Codex CLI | `codex mcp add daymark --url <address>`, then `codex mcp login daymark`. |
| Cursor, VS Code, others | Add a remote (streamable HTTP) MCP server at the address with OAuth sign-in. |

**Install the skill**

| Client | Steps |
|---|---|
| Claude (web, desktop) | Customize (or Settings → Capabilities) → Skills → upload the zip, then switch it on. Code execution must be on. |
| Claude Code | Unzip into `~/.claude/skills/` (all projects) or a project's `.claude/skills/`, giving `daymark/SKILL.md`. |
| Codex CLI | Unzip into `~/.codex/skills/`. |
| ChatGPT, others | No skills: the connector already sends short Daymark instructions. Optionally paste `skill/SKILL.md` from the same site into project instructions. |

**After a Daymark update**

AI clients remember Daymark's tools. When an update adds tools, **Settings → AI connections** marks each connection that still has the old list **Needs refresh**. In ChatGPT open Settings → Apps → Daymark → **Refresh**; in Claude start a new chat, or reconnect Daymark under Settings → Connectors; in Claude Code or Codex start a new session. The mark clears once the client fetches the tools again.

Menu names change between client versions. For a computer-only vault without a server, see **Local mode** in **AI connections**.

## Phone
1. Add Daymark from the client's web or desktop app first, using the steps under **Web**. Claude and ChatGPT phone apps then use the same connector, and Claude skills too.
2. In Claude on the phone, open the tools menu in a chat and make sure **Daymark** is on.
3. In ChatGPT on the phone, pick the Daymark app from the tools menu; if it is missing, use ChatGPT on the web.
4. Ask “what's my day?” for a short spoken rundown.

After a Daymark update that adds tools, refresh Daymark in the client's web or desktop app (see **Web**); **Settings → AI connections** shows which connections need it.

The connector address is in **Settings → AI connections** on any signed-in device. Download the skill zip from `https://dngioidev.github.io/daymark/daymark-skill.zip` and upload or unzip it from a computer.
