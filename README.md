# jira-attachment-mcp

A tiny local [MCP](https://modelcontextprotocol.io) server that fetches Jira
attachments and returns them to an MCP client such as Claude Code.

- **Images** (PNG, JPEG, GIF, WebP) under ~3 MB are returned **inline**, so the
  model can see them directly.
- **Larger images and all other file types** are saved to
  `~/.cache/jira-attachment-mcp/` and the local path is returned.

It runs over stdio and exposes a single tool, `jira_get_attachment`, which takes
a numeric Jira attachment ID.

## Prerequisites

- Node.js >= 18
- An Atlassian API token: <https://id.atlassian.com/manage-profile/security/api-tokens>

## Setup

```sh
npm install
node setup.js
```

`setup.js` prompts for your Atlassian email, API token, and Jira base URL
(e.g. `https://your-company.atlassian.net`), then writes them to
`~/.config/jira-attachment-mcp/config.json` with `0600` permissions.

Then register the server with Claude Code (use the absolute path to `index.js`):

```sh
claude mcp add --transport stdio jira-attach -- node /absolute/path/to/index.js
```

Restart Claude Code (or reload MCP servers) so the new server is picked up.

## Security

Your credentials never leave your machine and are never committed: they live
only in `~/.config/jira-attachment-mcp/config.json` (mode `0600`). The token is
used solely to build the HTTP Basic auth header for requests to your own Jira
instance.

## Licence

MIT — see [LICENSE](LICENSE).
