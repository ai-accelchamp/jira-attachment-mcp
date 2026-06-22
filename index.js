#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const fs = require('node:fs');
const path = require('node:path');

const configDir = path.join(process.env.HOME, '.config/jira-attachment-mcp');
const configPath = path.join(configDir, 'config.json');

let config;
try {
	config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch {
	console.error(`No config at ${configPath}. Run: node ${path.join(__dirname, 'setup.js')}`);
	process.exit(1);
}

const { email, token, baseUrl } = config;
if (!email || !token || !baseUrl) {
	console.error(`Config at ${configPath} is missing email/token/baseUrl. Re-run setup.`);
	process.exit(1);
}
const auth = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;

// Anthropic vision accepts these mime types
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
// Anthropic vision per-image limit is ~5 MB base64-encoded; raw bytes ~3.75 MB.
const MAX_INLINE_BYTES = 3 * 1024 * 1024;

async function getAttachment(attachmentId) {
	const metaUrl = `${baseUrl}/rest/api/3/attachment/${encodeURIComponent(attachmentId)}`;
	const metaRes = await fetch(metaUrl, {
		headers: {Authorization: auth, Accept: 'application/json'},
	});
	if (!metaRes.ok) {
		throw new Error(`Metadata fetch failed: ${metaRes.status} ${metaRes.statusText}`);
	}
	const meta = await metaRes.json();
	const {filename, mimeType, size, content} = meta;

	const binRes = await fetch(content, {headers: {Authorization: auth}, redirect: 'follow'});
	if (!binRes.ok) {
		throw new Error(`Binary fetch failed: ${binRes.status} ${binRes.statusText}`);
	}
	const buf = Buffer.from(await binRes.arrayBuffer());

	if (IMAGE_MIMES.has(mimeType)) {
		if (buf.length > MAX_INLINE_BYTES) {
			const cachePath = saveToCache(attachmentId, filename, buf);
			return textResult(
				`Attachment ${attachmentId} (${filename}, ${mimeType}, ${size} bytes) is too large to inline; saved to ${cachePath}.`,
			);
		}
		return {
			content: [
				{type: 'text', text: `Attachment ${attachmentId}: ${filename} (${mimeType}, ${size} bytes)`},
				{type: 'image', data: buf.toString('base64'), mimeType},
			],
		};
	}

	const cachePath = saveToCache(attachmentId, filename, buf);
	return textResult(`Attachment ${attachmentId} (${filename}, ${mimeType}, ${size} bytes) saved to ${cachePath}.`);
}

function saveToCache(attachmentId, filename, buf) {
	const cacheDir = path.join(process.env.HOME, '.cache/jira-attachment-mcp');
	fs.mkdirSync(cacheDir, {recursive: true});
	const safeName = `${attachmentId}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
	const localPath = path.join(cacheDir, safeName);
	fs.writeFileSync(localPath, buf);
	return localPath;
}

function textResult(text) {
	return {content: [{type: 'text', text}]};
}

const server = new Server(
	{name: 'jira-attachment-mcp', version: '0.1.0'},
	{capabilities: {tools: {}}},
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [
		{
			name: 'jira_get_attachment',
			description:
				'Fetch a Jira attachment by ID. Images (PNG/JPEG/GIF/WebP) under ~3 MB are returned inline so Claude can see them. Other types are saved to ~/.cache/jira-attachment-mcp/ and the local path is returned.',
			inputSchema: {
				type: 'object',
				properties: {
					attachmentId: {
						type: 'string',
						description: 'The numeric Jira attachment ID from the attachment manifest on an issue.',
					},
				},
				required: ['attachmentId'],
			},
		},
	],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
	if (req.params.name !== 'jira_get_attachment') {
		throw new Error(`Unknown tool: ${req.params.name}`);
	}
	const {attachmentId} = req.params.arguments || {};
	if (!attachmentId) throw new Error('attachmentId is required');
	return await getAttachment(String(attachmentId));
});

const transport = new StdioServerTransport();
server.connect(transport).catch((e) => {
	console.error('Server failed:', e.message);
	process.exit(1);
});
