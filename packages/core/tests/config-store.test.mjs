import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testsDir = fileURLToPath(new URL('.', import.meta.url));

function runInIsolatedHome(fnString) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dnss-test-'));
    try {
        const script = `
            import fs from 'node:fs';
            import path from 'node:path';
            import assert from 'node:assert/strict';
            import { loadConfigs, saveConfigs, upsertConfig, removeConfig, getConfigPath, getSettingsPath, loadSettings, saveSettings, exportSettingsJson, importSettingsJson } from '../dist/index.js';

            const run = ${fnString};
            await run({ fs, path, assert, loadConfigs, saveConfigs, upsertConfig, removeConfig, getConfigPath, getSettingsPath, loadSettings, saveSettings, exportSettingsJson, importSettingsJson, tmpDir: ${JSON.stringify(tmpDir)} });
        `;
        execFileSync(process.execPath, ['--input-type=module', '-e', script], {
            cwd: testsDir,
            env: {
                ...process.env,
                HOME: tmpDir,
                USERPROFILE: tmpDir,
            },
            encoding: 'utf-8',
        });
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

test('isDnsConfig rejects empty names and names > 64 chars (quarantined to .invalid)', () => {
    runInIsolatedHome(`async ({ fs, path, assert, loadConfigs, getConfigPath }) => {
        const configPath = getConfigPath();
        const configDir = path.dirname(configPath);
        fs.mkdirSync(configDir, { recursive: true });

        const testEntries = [
            { name: '', primary: '1.1.1.1' },
            { name: '   ', primary: '1.1.1.1' },
            { name: 'a'.repeat(65), primary: '1.1.1.1' },
            { name: 'Valid Server', primary: '1.1.1.1' },
            { name: 'b'.repeat(64), primary: '8.8.8.8' },
        ];
        fs.writeFileSync(configPath, JSON.stringify(testEntries, null, 2), 'utf-8');

        const configs = loadConfigs();
        assert.equal(configs.length, 2);
        assert.equal(configs[0].name, 'Valid Server');
        assert.equal(configs[1].name, 'b'.repeat(64));

        const invalidPath = configPath + '.invalid';
        assert.ok(fs.existsSync(invalidPath), 'configs.json.invalid must exist');
        const invalidData = JSON.parse(fs.readFileSync(invalidPath, 'utf-8'));
        assert.equal(invalidData.length, 3);
        assert.equal(invalidData[0].name, '');
        assert.equal(invalidData[1].name, '   ');
        assert.equal(invalidData[2].name, 'a'.repeat(65));
    }`);
});

test('non-array JSON in configs.json is backed up to configs.json.corrupt', () => {
    runInIsolatedHome(`async ({ fs, path, assert, loadConfigs, getConfigPath }) => {
        const configPath = getConfigPath();
        const configDir = path.dirname(configPath);
        fs.mkdirSync(configDir, { recursive: true });

        fs.writeFileSync(configPath, JSON.stringify({ notAnArray: true }), 'utf-8');

        const configs = loadConfigs();
        assert.deepEqual(configs, []);

        const corruptPath = configPath + '.corrupt';
        assert.ok(fs.existsSync(corruptPath), 'configs.json.corrupt must exist');
        const corruptData = JSON.parse(fs.readFileSync(corruptPath, 'utf-8'));
        assert.deepEqual(corruptData, { notAnArray: true });
    }`);
});

test('upsertConfig trims names and deduplicates case-insensitively', () => {
    runInIsolatedHome(`async ({ assert, loadConfigs, upsertConfig, removeConfig }) => {
        upsertConfig({ name: '  Cloudflare  ', primary: '1.1.1.1' });
        let configs = loadConfigs();
        assert.equal(configs.length, 1);
        assert.equal(configs[0].name, 'Cloudflare');
        assert.equal(configs[0].primary, '1.1.1.1');

        upsertConfig({ name: 'cloudflare', primary: '1.0.0.1' });
        configs = loadConfigs();
        assert.equal(configs.length, 1);
        assert.equal(configs[0].name, 'cloudflare');
        assert.equal(configs[0].primary, '1.0.0.1');

        upsertConfig({ name: '  CLOUDFLARE  ', primary: '1.1.1.2' });
        configs = loadConfigs();
        assert.equal(configs.length, 1);
        assert.equal(configs[0].name, 'CLOUDFLARE');
        assert.equal(configs[0].primary, '1.1.1.2');

        removeConfig('   cloudflare   ');
        configs = loadConfigs();
        assert.equal(configs.length, 0);
    }`);
});

test('settings.json round-trips, syncs with configs.json, and rejects invalid imports', () => {
    runInIsolatedHome(`async ({ fs, assert, loadConfigs, loadSettings, exportSettingsJson, importSettingsJson, getSettingsPath }) => {
        const imported = importSettingsJson(JSON.stringify({
            'dnss.schemaVersion': 1,
            'appearance.theme': 'dark',
            'appearance.accent': '#3B82F6',
            'appearance.fontFamily': 'inter',
            'appearance.fontSize': 16,
            'general.language': 'fa',
            'benchmark.target': 'https://example.com',
            'presets.hidden': ['google', 'google'],
            'dns.servers': [
                { name: 'Office DNS', primary: '10.0.0.1', alternative: '10.0.0.2' },
                { name: 'Office DNS 2', primary: '10.0.0.3' }
            ]
        }));

        assert.equal(imported['appearance.theme'], 'dark');
        assert.equal(imported['appearance.accent'], '#3b82f6');
        assert.equal(imported['appearance.fontSize'], 16);
        assert.equal(imported['general.language'], 'fa');
        assert.deepEqual(imported['presets.hidden'], ['google']);
        assert.equal(imported['dns.servers'].length, 2);
        assert.equal(imported['dns.servers'][0].id, 'office-dns');
        assert.ok(fs.existsSync(getSettingsPath()), 'settings.json must be written');

        // configs.json stays synced with dns.servers
        const configs = loadConfigs();
        assert.equal(configs.length, 2);
        assert.equal(configs[0].name, 'Office DNS');

        // Export returns valid JSON matching loadSettings()
        const exported = JSON.parse(exportSettingsJson());
        assert.deepEqual(exported, loadSettings());

        // Reject invalid imports without clobbering existing settings
        assert.throws(() => importSettingsJson('[]'), /object/i);
        assert.throws(() => importSettingsJson(JSON.stringify({
            'dns.servers': [{ name: 'Bad', primary: '999.999.999.999' }]
        })), /invalid/i);
        assert.equal(loadSettings()['dns.servers'].length, 2);
    }`);
});
