'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const HERE = __dirname;
const REPO = path.resolve(HERE, '../..');
const WINSW = Object.freeze({ version: '2.12.0',
  url: 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW.NET461.exe',
  sha256: 'b5066b7bbdfba1293e5d15cda3caaea88fbeab35bd5b38c41c913d492aadfc4f' });

function sha256(filename) { return createHash('sha256').update(fs.readFileSync(filename)).digest('hex'); }

function inventory(root, relative = '') {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    const name = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error('El paquete no admite enlaces simbolicos.');
    return entry.isDirectory() ? inventory(root, name) : [{ path: name, sha256: sha256(path.join(root, name)) }];
  });
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true,
    env: { ...process.env, NG_CLI_ANALYTICS: 'false', CI: 'true' } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`El proceso termino con codigo ${result.status}.`);
}

async function getWrapper(cache) {
  const filename = path.join(cache, 'WinSW.NET461.exe');
  if (!fs.existsSync(filename)) {
    const response = await fetch(WINSW.url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Descarga de WinSW: HTTP ${response.status}.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 2 * 1024 * 1024
      || createHash('sha256').update(bytes).digest('hex') !== WINSW.sha256) {
      throw new Error('La huella de WinSW no coincide con la version fijada.');
    }
    fs.writeFileSync(filename, bytes, { flag: 'wx' });
  }
  if (sha256(filename) !== WINSW.sha256) throw new Error('El archivo WinSW de cache no es valido.');
  return filename;
}

async function prepare() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Prepara el paquete en Windows x64.');
  const [major, minor] = process.versions.node.split('.').map((part) => +part);
  if (major !== 24 || minor < 15) throw new Error('Se requiere Node.js 24.15 o posterior de la serie 24.');
  const frontend = path.join(REPO, 'frontend');
  const cli = path.join(frontend, 'node_modules/@angular/cli/bin/ng.js');
  if (!fs.existsSync(cli)) throw new Error('Instala primero las dependencias de frontend con npm.cmd ci.');
  const cache = path.join(HERE, '.runtime');
  fs.mkdirSync(cache, { recursive: true });
  const stage = fs.mkdtempSync(path.join(cache, 'preparacion-'));
  let junction;
  try {
    const wrapper = await getWrapper(cache);
    const source = path.join(stage, 'frontend');
    fs.mkdirSync(source);
    for (const name of ['src', 'public', 'angular.json', 'tsconfig.json', 'tsconfig.app.json', 'package.json']) {
      fs.cpSync(path.join(frontend, name), path.join(source, name), { recursive: true });
    }
    fs.writeFileSync(path.join(source, 'src/environments/environment.ts'),
      "export const environment = { production: true, apiUrl: new URL('/api', globalThis.location.origin).href } as const;\n");
    const indexPath = path.join(source, 'src/index.html');
    const html = fs.readFileSync(indexPath, 'utf8');
    if (!html.includes("connect-src 'self'")) throw new Error('No se encontro la politica CSP del frontend.');
    fs.writeFileSync(indexPath, html.replace(/connect-src[^;]+;/, "connect-src 'self';"));
    junction = path.join(source, 'node_modules');
    fs.symlinkSync(path.join(frontend, 'node_modules'), junction, 'junction');

    const product = path.join(stage, 'SysMant-Windows');
    fs.mkdirSync(product);
    run(process.execPath, [cli, 'build', '--configuration', 'production', '--output-path', path.join(product, 'angular')], source);
    fs.renameSync(path.join(product, 'angular/browser'), path.join(product, 'web'));
    const notices = path.join(product, 'angular/3rdpartylicenses.txt');
    if (fs.existsSync(notices)) fs.copyFileSync(notices, path.join(product, 'web/3rdpartylicenses.txt'));
    fs.rmSync(path.join(product, 'angular'), { recursive: true });
    const backend = path.join(product, 'backend');
    fs.mkdirSync(backend);
    for (const name of ['src', 'package.json', 'package-lock.json']) {
      fs.cpSync(path.join(REPO, 'backend', name), path.join(backend, name), { recursive: true });
    }
    // npm se ejecuta con Node explicito, sin cmd.exe ni interpolacion de argumentos.
    const npmCandidates = [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
      path.join(process.env.APPDATA || '', 'npm/node_modules/npm/bin/npm-cli.js')];
    const npm = npmCandidates.find((candidate) => fs.existsSync(candidate));
    if (!npm) throw new Error('No se encontro npm-cli.js junto a Node o en APPDATA/npm.');
    run(process.execPath, [npm, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], backend);
    fs.cpSync(path.join(HERE, 'runtime'), path.join(product, 'runtime'), { recursive: true });
    fs.mkdirSync(path.join(product, 'node'));
    fs.copyFileSync(process.execPath, path.join(product, 'node/node.exe'));
    for (const license of [
      { url: `https://raw.githubusercontent.com/nodejs/node/v${process.versions.node}/LICENSE`, file: 'node/LICENSE' },
      { url: 'https://raw.githubusercontent.com/winsw/winsw/v2.12.0/LICENSE.txt', file: 'WinSW-LICENSE.txt' },
    ]) {
      const response = await fetch(license.url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`No se pudo obtener la licencia: ${license.file}.`);
      fs.writeFileSync(path.join(product, license.file), await response.text());
    }
    fs.copyFileSync(wrapper, path.join(product, 'SysMantLocal.exe'));
    for (const name of ['Instalar.cmd', 'Instalar-Servicio.ps1', 'Administrar-Servicio.ps1', 'Servidor-Comun.ps1', 'Instalar-Acceso.ps1', 'Instalar-Acceso.cmd', 'LEEME.txt', 'TERCEROS.txt']) {
      fs.copyFileSync(path.join(HERE, name), path.join(product, name));
    }
    const files = inventory(product);
    if (files.some((file) => /(^|\/)\.env(?:\.|$)|credentials|\.pfx$/i.test(file.path))) {
      throw new Error('El paquete contiene configuracion privada.');
    }
    const manifest = { product: 'SysMant-Windows', version: 1, createdAt: new Date().toISOString(),
      nodeVersion: process.versions.node, wrapper: WINSW, files };
    fs.writeFileSync(path.join(product, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const output = path.join(HERE, 'output');
    fs.mkdirSync(output, { recursive: true });
    const name = `SysMant-Windows-${manifest.createdAt.replace(/[-:.]/g, '').replace('T', '-').replace('Z', '')}`;
    const destination = path.join(output, name);
    fs.renameSync(product, destination);
    run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(HERE, 'Comprimir-Paquete.ps1'), '-PackagePath', destination], HERE);
    fs.writeFileSync(`${destination}.zip.sha256`, `${sha256(`${destination}.zip`)}  ${name}.zip\n`);
    console.log(`\nPaquete listo: ${destination}`);
    console.log('Copia la carpeta completa al servidor y ejecuta Instalar.cmd como administrador.');
    return destination;
  } finally {
    if (junction && fs.existsSync(junction)) fs.unlinkSync(junction);
    const absolute = path.resolve(stage);
    if (!absolute.startsWith(`${path.resolve(cache)}${path.sep}`)) throw new Error('Ruta de limpieza invalida.');
    fs.rmSync(absolute, { recursive: true, force: true });
  }
}

if (require.main === module) prepare().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { prepare, inventory, WINSW };
