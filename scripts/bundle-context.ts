#!/usr/bin/env bun

/**
 * bundle-context.ts
 *
 * Bundles the repository source code and configs into a clean `<project>-context.zip`
 * suitable for feeding to external AI models for code review and bug hunting.
 *
 * Also injects a prominent `prompt.txt` directing the reviewing AI to:
 * 1. NOT delegate fixes to the human or AI agent.
 * 2. Provide exact code diffs and write a full Markdown report (`REVIEW_REPORT.md`).
 * 3. Instruct the implementing agent (Antigravity) to validate and assess first.
 * 4. Provide concrete clues, root-cause analyses, and examples.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

interface CliOptions {
    output: string | null;
    name: string | null;
    isDryRun: boolean;
    noPrompt: boolean;
    isHelp: boolean;
}

const ROOT_DIR: string = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
);

// --- CLI Arguments Parsing ---
const args: string[] = process.argv.slice(2);

function getArg(flag: string, shortFlag?: string): string | null {
    const idx = args.findIndex(
        (a) => a === flag || (shortFlag && a === shortFlag)
    );
    if (idx !== -1 && idx + 1 < args.length) {
        return args[idx + 1];
    }
    return null;
}

const options: CliOptions = {
    output: getArg('--output', '-o'),
    name: getArg('--name', '-n'),
    isDryRun: args.includes('--dry-run'),
    noPrompt: args.includes('--no-prompt'),
    isHelp: args.includes('--help') || args.includes('-h'),
};

if (options.isHelp) {
    console.log(`
Usage: bun run scripts/bundle-context.ts [options]

Options:
  -o, --output <path>    Specify custom output zip path (default: <project>-context.zip)
  -n, --name <name>      Specify project name (default: auto-detected from package.json)
  --dry-run              List the files that would be included without creating zip
  --no-prompt            Do not inject prompt.txt into the bundle
  -h, --help             Show this help message
`);
    process.exit(0);
}

// --- Project Name & Tech Stack Detection ---
let projectName: string = options.name || '';

if (!projectName) {
    try {
        const pkgPath = path.join(ROOT_DIR, 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            if (pkg.name) {
                projectName = pkg.name.replace(/^@[^/]+\//, '');
            }
        }
    } catch {
        // fallback to directory name
    }
}

if (!projectName) {
    projectName = path.basename(ROOT_DIR);
}

const zipFileName: string = options.output
    ? path.isAbsolute(options.output)
        ? options.output
        : path.join(ROOT_DIR, options.output)
    : path.join(ROOT_DIR, `${projectName}-context.zip`);

const techStack: string[] = [];
if (
    fs.existsSync(path.join(ROOT_DIR, 'Cargo.toml')) ||
    fs.existsSync(path.join(ROOT_DIR, 'src-tauri', 'Cargo.toml')) ||
    fs.existsSync(
        path.join(ROOT_DIR, 'packages', 'gui', 'src-tauri', 'Cargo.toml')
    )
) {
    techStack.push('Rust');
}
if (
    fs.existsSync(path.join(ROOT_DIR, 'src-tauri', 'tauri.conf.json')) ||
    fs.existsSync(
        path.join(ROOT_DIR, 'packages', 'gui', 'src-tauri', 'tauri.conf.json')
    )
) {
    techStack.push('Tauri v2');
}
if (fs.existsSync(path.join(ROOT_DIR, 'package.json'))) {
    techStack.push(
        'TypeScript',
        'React',
        'Tailwind CSS',
        'Vite',
        'Node.js',
        'Bun'
    );
}
const techStackStr: string =
    techStack.length > 0 ? techStack.join(', ') : 'Polyglot Monorepo';

// --- Ignored Patterns & Binary Extensions ---
const EXCLUDED_EXTENSIONS = new Set<string>([
    '.zip',
    '.tar',
    '.gz',
    '.tgz',
    '.rar',
    '.7z',
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.node',
    '.bin',
    '.pdb',
    '.lib',
    '.a',
    '.obj',
    '.o',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.ico',
    '.mp4',
    '.mov',
    '.avi',
    '.webm',
    '.wav',
    '.mp3',
    '.pdf',
    '.wasm',
]);

const EXCLUDED_FILENAMES = new Set<string>([
    '.ds_store',
    'thumbs.db',
    '.context-manifest.tmp',
]);

function shouldExcludeFile(relPath: string): boolean {
    const normalized = relPath.replace(/\\/g, '/');
    const base = path.basename(normalized).toLowerCase();
    const ext = path.extname(normalized).toLowerCase();

    // Never pack self or other zip archives
    if (ext === '.zip' || ext === '.tar' || ext === '.gz' || ext === '.tgz')
        return true;

    // Secret and environment credentials
    if (base.startsWith('.env') && !base.endsWith('.example')) return true;
    if (ext === '.pem' || ext === '.key' || ext === '.pfx' || ext === '.p12')
        return true;

    // Compiled binaries and media
    if (EXCLUDED_EXTENSIONS.has(ext)) return true;
    if (EXCLUDED_FILENAMES.has(base)) return true;

    // Internal safety guard or agent trash directories
    if (
        normalized.startsWith('.agent-trash/') ||
        normalized.includes('/.agent-trash/')
    )
        return true;
    if (normalized.startsWith('.git/') || normalized.includes('/.git/'))
        return true;

    return false;
}

// --- Collect Files ---
let rawFiles: string[] = [];
let usedGit = false;

try {
    const gitOutput = execFileSync(
        'git',
        [
            '-c',
            'core.quotepath=false',
            'ls-files',
            '--cached',
            '--others',
            '--exclude-standard',
        ],
        {
            cwd: ROOT_DIR,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
        }
    );
    rawFiles = gitOutput
        .split(/\r?\n/)
        .map((f) => f.trim())
        .filter(Boolean);
    usedGit = true;
} catch {
    console.log(
        '[Notice] Git command failed or not a git repo, using recursive scan...'
    );
    const ignoredDirs = new Set<string>([
        'node_modules',
        'dist',
        'target',
        'gen',
        'build',
        '.git',
        '.agent-trash',
        '.gemini',
    ]);
    function walk(dir: string): void {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (!ignoredDirs.has(entry.name)) {
                    walk(path.join(dir, entry.name));
                }
            } else if (entry.isFile()) {
                rawFiles.push(
                    path.relative(ROOT_DIR, path.join(dir, entry.name))
                );
            }
        }
    }
    walk(ROOT_DIR);
}

// Filter candidate files
const filesToBundle: string[] = rawFiles
    .filter(
        (f) => !shouldExcludeFile(f) && fs.existsSync(path.join(ROOT_DIR, f))
    )
    .map((f) => f.replace(/\\/g, '/'));

// --- Prompt Generation ---
const promptPath = path.join(ROOT_DIR, 'prompt.txt');

if (!options.noPrompt) {
    const templateFile = path.join(
        ROOT_DIR,
        'scripts',
        'context-prompt-template.txt'
    );
    let template = '';
    if (fs.existsSync(templateFile)) {
        template = fs.readFileSync(templateFile, 'utf8');
    } else {
        template = `================================================================================
CRITICAL DIRECTIVE: IN-DEPTH CODE REVIEW & BUG FIX REPORT
================================================================================

Project: {{PROJECT_NAME}}
Archive Generated: {{GENERATION_DATE}}
Total Files in Context: {{FILE_COUNT}}
Architecture: {{TECH_STACK}}

--------------------------------------------------------------------------------
1. MISSION OVERVIEW
--------------------------------------------------------------------------------
You have been provided with the complete, curated source code of the project in this archive.
Your role is to perform an exhaustive, senior-level code review, security audit, edge-case analysis, and bug hunting across this codebase.

The human user will NOT be manually implementing your review or writing code fixes.
Instead, your review will be handed off to an autonomous AI Coding Agent (Antigravity) who will inspect, assess, and apply the code modifications directly to the repository.

--------------------------------------------------------------------------------
2. CRITICAL CONSTRAINT: DO NOT DELEGATE FIXES
--------------------------------------------------------------------------------
⛔ STRICT PROHIBITION ON DELEGATION:
- Do NOT say "Ask your AI agent to implement this", "Delegate this fix to your coding assistant", or "You should write a function that...".
- Do NOT provide lazy, hand-wavy high-level suggestions without concrete code.
- YOU MUST DO THE COMPLETE INTELLECTUAL AND ARCHITECTURAL WORK YOURSELF.
- Write out the EXACT, complete, production-ready code changes in your report.
- The downstream AI agent will execute and apply the changes, but YOU must provide the exact diffs, line replacements, and rationale so the agent's job is straightforward, clear, and unambiguous.

--------------------------------------------------------------------------------
3. REQUIRED DELIVERABLE & FORMAT
--------------------------------------------------------------------------------
Provide your complete review findings as a structured Markdown report:
- Report filename: \`REVIEW_REPORT.md\`
- If your environment / interface supports generating downloadable files or archives:
  Zip \`REVIEW_REPORT.md\` into \`review-report.zip\` and send/attach that report.
- If your environment only supports text/chat output:
  Provide the complete, un-truncated markdown content directly in your response so it can be saved to \`REVIEW_REPORT.md\`.

The report MUST begin with this exact directive banner addressed to the implementing AI Agent:

> ### ⚠️ DIRECTIVE FOR THE IMPLEMENTING AI AGENT (ANTIGRAVITY):
> Before applying any modifications proposed in this review:
> 1. **VALIDATE & ASSESS FIRST**: Thoroughly inspect the live codebase to independently verify each finding. Do not assume all external review suggestions are infallible.
> 2. **CHECK FOR REGRESSIONS**: Verify that proposed changes respect the monorepo architecture, type invariants, existing test suites, and cross-platform behavior (Windows / macOS / Linux / Tauri / Rust / React).
> 3. **FALSE POSITIVE FILTER**: If a suggestion is based on incomplete context, conflicts with higher-level requirements, or represents an anti-pattern for this project, document your reasoning, reject or adjust the change, and notify the user.
> 4. **TYPECHECK & TEST**: Always run \`bun run typecheck:bun\` (runs \`bun check --skipLibCheck\` across all workspaces in ~200ms) instead of standard \`npm run typecheck\`. Run test suites (\`cargo test\`, \`npm test\`) before and after applying changes to ensure zero regressions.

--------------------------------------------------------------------------------
4. STRUCTURE OF EACH FINDING
--------------------------------------------------------------------------------
To make the implementing AI Agent's job easy, clear, and unambiguous, structure every finding as follows:

### [ISSUE-ID] <Clear, Descriptive Title>
- **Severity**: Critical | High | Medium | Low | Architectural / Refactor
- **Category**: DNS Switching / Network Platform | Concurrency / Race Condition | Security / Elevation / Injection | Type Safety / Logic Bug | IPC / Platform | Performance | UI / State
- **Target File**: \`relative/path/to/file.ext\` (exact path from repo root)
- **Target Location**: Function name, class/struct, and line numbers
- **Root Cause & Concrete Scenario**:
  - Explain clearly *why* the issue happens, what conditions trigger the bug, and the concrete impact.
  - Include an example scenario or edge-case trigger showing how the bug manifests.
- **Exact Code Change (Unified Diff / Before & After)**:
  - Provide ready-to-apply diffs with sufficient context lines so the agent can locate and edit the target block without ambiguity.
- **Verification & Test Case**:
  - Provide a specific unit test snippet or automated test steps to prove that the bug is fixed and verify no regressions.

Proceed with your in-depth review now. Provide all findings with the requested level of detail, clues, and exact code replacements.
================================================================================`;
    }

    const alreadyHasPrompt = filesToBundle.includes('prompt.txt');
    const filledPrompt = template
        .replace(/\{\{PROJECT_NAME\}\}/g, projectName)
        .replace(/\{\{GENERATION_DATE\}\}/g, new Date().toISOString())
        .replace(
            /\{\{FILE_COUNT\}\}/g,
            String(filesToBundle.length + (alreadyHasPrompt ? 0 : 1))
        )
        .replace(/\{\{TECH_STACK\}\}/g, techStackStr);

    if (!options.isDryRun) {
        fs.writeFileSync(promptPath, filledPrompt, 'utf8');
    }

    if (!alreadyHasPrompt) {
        filesToBundle.unshift('prompt.txt');
    }
} else {
    const promptIdx = filesToBundle.indexOf('prompt.txt');
    if (promptIdx !== -1) {
        filesToBundle.splice(promptIdx, 1);
    }
}

if (options.isDryRun) {
    console.log(
        `[Dry Run] Found ${filesToBundle.length} files to package into ${path.basename(zipFileName)}:`
    );
    filesToBundle.forEach((f) => console.log(`  - ${f}`));
    process.exit(0);
}

// --- Create Archive ---
const manifestPath = path.join(ROOT_DIR, '.context-manifest.tmp');
fs.writeFileSync(manifestPath, filesToBundle.join('\n') + '\n', 'utf8');

if (fs.existsSync(zipFileName)) {
    fs.rmSync(zipFileName, { force: true });
}

let archiveSuccess = false;
let archiveError: unknown = null;

// Method 1: tar.exe (fastest, built into Windows 10/11)
try {
    execFileSync(
        'tar.exe',
        ['-a', '-c', '-f', zipFileName, '-T', manifestPath],
        {
            cwd: ROOT_DIR,
            stdio: ['pipe', 'pipe', 'pipe'],
        }
    );
    archiveSuccess = true;
} catch (e) {
    archiveError = e;
}

// Method 2: PowerShell fallback if tar.exe is unavailable
if (!archiveSuccess) {
    try {
        console.log(
            '[Notice] tar.exe not available or failed, falling back to PowerShell...'
        );
        const psScript = `
            $manifest = Get-Content -LiteralPath $env:DNSS_MANIFEST_PATH -Encoding UTF8
            $zipPath = $env:DNSS_ZIP_PATH
            $rootDir = $env:DNSS_ROOT_DIR
            Add-Type -AssemblyName System.IO.Compression.FileSystem
            $zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
            try {
                foreach ($rel in $manifest) {
                    if ([string]::IsNullOrWhiteSpace($rel)) { continue }
                    $full = [System.IO.Path]::Combine($rootDir, $rel)
                    if (Test-Path -LiteralPath $full) {
                        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $full, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
                    }
                }
            } finally {
                $zip.Dispose()
            }
        `;
        execFileSync('powershell.exe', ['-NoProfile', '-Command', psScript], {
            cwd: ROOT_DIR,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                DNSS_MANIFEST_PATH: manifestPath,
                DNSS_ZIP_PATH: zipFileName,
                DNSS_ROOT_DIR: ROOT_DIR,
            },
        });
        archiveSuccess = true;
    } catch (e) {
        archiveError = e;
    }
}

// Cleanup manifest
if (fs.existsSync(manifestPath)) {
    fs.rmSync(manifestPath, { force: true });
}

if (!archiveSuccess) {
    console.error('Failed to create archive:', archiveError);
    process.exit(1);
}

// --- Statistics & Final Output ---
const stat = fs.statSync(zipFileName);
const sizeKb = (stat.size / 1024).toFixed(1);
const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
const displaySize = stat.size > 1024 * 1024 ? `${sizeMb} MB` : `${sizeKb} KB`;

console.log(`
================================================================================
✅ Context Archive Created Successfully (Bun + TS)!
================================================================================
📦 Archive File:  ${path.basename(zipFileName)}
📍 Full Path:     ${zipFileName}
📊 Size:          ${displaySize}
📄 Total Files:   ${filesToBundle.length} files included
🎯 Source Mode:   ${usedGit ? 'Git (respecting .gitignore)' : 'Filesystem Walk'}
📝 Prompt File:   ${options.noPrompt ? 'omitted (--no-prompt)' : 'prompt.txt included at archive root'}

--------------------------------------------------------------------------------
💡 How to use this with another AI:
--------------------------------------------------------------------------------
1. Upload or attach '${path.basename(zipFileName)}' to the reviewing AI (Claude, ChatGPT, DeepSeek, etc.).
2. You can also paste the contents of 'prompt.txt' as your initial prompt message.
3. The reviewing AI will produce 'REVIEW_REPORT.md' with exact code diffs and
   instructions for Antigravity (your AI agent).
4. Hand that report back to me (Antigravity), and I will validate the review and
   safely apply the code changes for you!
================================================================================
`);
