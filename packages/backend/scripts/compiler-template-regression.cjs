#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');

const worktreeRoot = path.resolve(__dirname, '../../..');
const workspaceRoot = path.resolve(worktreeRoot, '../../..');
const defaultOutputDir = path.resolve(
  workspaceRoot,
  '.codex',
  'artifacts',
  'compiler-template-regression',
);

const ts = require(path.resolve(workspaceRoot, 'node_modules', 'typescript'));
const prettier = require(path.resolve(workspaceRoot, 'packages/backend/node_modules/prettier'));

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--outDir') {
      args.outDir = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function ensureCleanDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function formatDiagnostic(diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (diagnostic.file && typeof diagnostic.start === 'number') {
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1} ${message}`;
  }

  return message;
}

function createTsModuleLoader() {
  const cache = new Map();
  const diagnostics = [];

  function resolveLocalModule(specifier, parentFilename) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
      return null;
    }

    const basePath = specifier.startsWith('.')
      ? path.resolve(path.dirname(parentFilename), specifier)
      : path.resolve(specifier);

    const candidates = [
      basePath,
      `${basePath}.ts`,
      `${basePath}.tsx`,
      `${basePath}.js`,
      `${basePath}.json`,
      path.join(basePath, 'index.ts'),
      path.join(basePath, 'index.tsx'),
      path.join(basePath, 'index.js'),
      path.join(basePath, 'index.json'),
    ];

    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
  }

  function loadModule(filename) {
    const resolvedFilename = path.resolve(filename);

    if (cache.has(resolvedFilename)) {
      return cache.get(resolvedFilename).exports;
    }

    if (resolvedFilename.endsWith('.json')) {
      return JSON.parse(fs.readFileSync(resolvedFilename, 'utf8'));
    }

    const source = fs.readFileSync(resolvedFilename, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        resolveJsonModule: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
      fileName: resolvedFilename,
      reportDiagnostics: true,
    });

    for (const diagnostic of transpiled.diagnostics ?? []) {
      if (diagnostic.category === ts.DiagnosticCategory.Error) {
        diagnostics.push(formatDiagnostic(diagnostic));
      }
    }

    const moduleRecord = { exports: {} };
    cache.set(resolvedFilename, moduleRecord);

    const runtimeRequire = Module.createRequire(resolvedFilename);
    const localRequire = (specifier) => {
      const localModulePath = resolveLocalModule(specifier, resolvedFilename);
      if (localModulePath) {
        return loadModule(localModulePath);
      }

      return runtimeRequire(specifier);
    };

    const wrapped = Module.wrap(transpiled.outputText);
    const script = new vm.Script(wrapped, { filename: resolvedFilename });
    const compiledWrapper = script.runInThisContext();
    compiledWrapper(
      moduleRecord.exports,
      localRequire,
      moduleRecord,
      resolvedFilename,
      path.dirname(resolvedFilename),
    );

    return moduleRecord.exports;
  }

  return { diagnostics, loadModule };
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createReadme(manifest) {
  const lines = [
    '# Compiler Template Regression',
    '',
    `Generated At: ${manifest.generatedAt}`,
    `Worktree Root: ${manifest.worktreeRoot}`,
    `Output Directory: ${manifest.outputDir}`,
    `Templates: ${manifest.successCount}/${manifest.total} succeeded`,
    '',
    '| Template | Category | Components | Schema | Generated |',
    '| --- | --- | ---: | --- | --- |',
  ];

  for (const template of manifest.templates) {
    lines.push(
      `| ${template.id} | ${template.category} | ${template.componentCount} | ${template.schemaFile} | ${template.codeFile} |`,
    );
  }

  if (manifest.failures.length > 0) {
    lines.push('', '## Failures', '');
    for (const failure of manifest.failures) {
      lines.push(`- ${failure.id}: ${failure.message}`);
    }
  }

  if (manifest.diagnostics.length > 0) {
    lines.push('', '## Loader Diagnostics', '');
    for (const diagnostic of manifest.diagnostics) {
      lines.push(`- ${diagnostic}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

async function runRegression(options = {}) {
  const outputDir = path.resolve(options.outDir || defaultOutputDir);
  ensureCleanDir(outputDir);

  const loader = createTsModuleLoader();
  const pipelinePath = path.resolve(
    worktreeRoot,
    'packages/backend/src/modules/compiler/pipeline.ts',
  );
  const templateIndexPath = path.resolve(
    worktreeRoot,
    'packages/frontend/src/editor/templates/index.ts',
  );

  const compilerModule = loader.loadModule(pipelinePath);
  const templateModule = loader.loadModule(templateIndexPath);

  const templateMetas = templateModule
    .getAllTemplates()
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));

  const manifest = {
    generatedAt: new Date().toISOString(),
    worktreeRoot,
    outputDir,
    total: templateMetas.length,
    successCount: 0,
    failureCount: 0,
    diagnostics: loader.diagnostics.slice(),
    failures: [],
    templates: [],
  };

  for (const meta of templateMetas) {
    const templateDir = path.join(outputDir, meta.id);
    fs.mkdirSync(templateDir, { recursive: true });

    try {
      const schema = templateModule.getTemplateSchema(meta.id);
      if (!schema) {
        throw new Error(`Template schema not found: ${meta.id}`);
      }

      const rawCode = compilerModule.compileSchemaToCode(schema);
      const formattedCode = await prettier.format(rawCode, {
        parser: 'babel',
        semi: true,
        singleQuote: false,
        trailingComma: 'es5',
        printWidth: 100,
        tabWidth: 2,
      });

      const schemaFile = path.join(templateDir, 'schema.json');
      const codeFile = path.join(templateDir, 'generated.tsx');

      writeFile(schemaFile, `${JSON.stringify(schema, null, 2)}\n`);
      writeFile(codeFile, formattedCode.endsWith('\n') ? formattedCode : `${formattedCode}\n`);

      manifest.successCount += 1;
      manifest.templates.push({
        id: meta.id,
        name: meta.name,
        nameZh: meta.nameZh,
        category: meta.category,
        componentCount: Object.keys(schema.components ?? {}).length,
        schemaFile: path.relative(outputDir, schemaFile).replace(/\\/g, '/'),
        codeFile: path.relative(outputDir, codeFile).replace(/\\/g, '/'),
      });
    } catch (error) {
      const message = error instanceof Error ? error.stack || error.message : String(error);
      const errorFile = path.join(templateDir, 'error.txt');
      writeFile(errorFile, `${message}\n`);

      manifest.failureCount += 1;
      manifest.failures.push({
        id: meta.id,
        message,
        errorFile: path.relative(outputDir, errorFile).replace(/\\/g, '/'),
      });
      manifest.templates.push({
        id: meta.id,
        name: meta.name,
        nameZh: meta.nameZh,
        category: meta.category,
        componentCount: 0,
        schemaFile: null,
        codeFile: null,
        errorFile: path.relative(outputDir, errorFile).replace(/\\/g, '/'),
      });
    }
  }

  const manifestPath = path.join(outputDir, 'manifest.json');
  const readmePath = path.join(outputDir, 'README.md');

  writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFile(readmePath, createReadme(manifest));

  if (manifest.failureCount > 0) {
    const error = new Error(
      `Compiler template regression failed: ${manifest.failureCount} template(s) did not compile. See ${manifestPath}`,
    );
    error.manifest = manifest;
    throw error;
  }

  return manifest;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = await runRegression({ outDir: args.outDir });
  console.log(`Compiler template regression completed for ${manifest.successCount} template(s).`);
  console.log(`Artifacts written to ${manifest.outputDir}`);
}

module.exports = {
  runRegression,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}

