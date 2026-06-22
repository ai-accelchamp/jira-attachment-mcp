#!/usr/bin/env node

const readline = require('node:readline/promises');
const fs = require('node:fs');
const path = require('node:path');
const {stdin: input, stdout: output} = require('node:process');

const configDir = path.join(process.env.HOME, '.config/jira-attachment-mcp');
const configPath = path.join(configDir, 'config.json');

async function main() {
	const rl = readline.createInterface({input, output});
	console.log('\nJira Attachment MCP — setup\n');
	console.log('API token: https://id.atlassian.com/manage-profile/security/api-tokens\n');
	const email = (await rl.question('Atlassian email: ')).trim();
	const token = (await rl.question('API token: ')).trim();
	const baseUrlRaw = (await rl.question('Jira base URL (e.g. https://your-company.atlassian.net): ')).trim();
	rl.close();

	const baseUrl = baseUrlRaw.replace(/\/+$/, '');
	if (!email || !token || !baseUrl) {
		console.error('All three fields are required.');
		process.exit(1);
	}

	fs.mkdirSync(configDir, {recursive: true, mode: 0o700});
	fs.writeFileSync(configPath, `${JSON.stringify({email, token, baseUrl}, null, 2)}\n`, {mode: 0o600});

	console.log(`\nSaved to ${configPath} (mode 0600).`);
	console.log('\nNext: register with Claude Code:');
	console.log(`  claude mcp add --transport stdio jira-attach -- node ${path.join(__dirname, 'index.js')}`);
	console.log('Then restart Claude Code (or /mcp reload) so the new server is picked up.\n');
}

main().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
