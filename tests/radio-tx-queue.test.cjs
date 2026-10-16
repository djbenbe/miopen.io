const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const sourcePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'src/iohcRadio.cpp');
const source = fs.readFileSync(sourcePath, 'utf8');

function method(signature) {
  // Match line beginnings so the old, commented-out send() is not extracted.
  const start = source.indexOf(`\n${signature}`) + 1;
  assert(start > 0, `Missing ${signature}`);
  const open = source.indexOf('{', start);
  let depth = 1;
  let end = open + 1;
  for (; depth && end < source.length; ++end) {
    if (source[end] === '{') ++depth;
    if (source[end] === '}') --depth;
  }
  assert.equal(depth, 0);
  return source.slice(start, end);
}

test('real queue methods: concurrent handoff and two consecutive cover commands', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miopen-radio-queue-'));
  try {
    const methods = [
      'void iohcRadio::queueSend(',
      'void iohcRadio::startQueuedSend()',
      'void iohcRadio::send(std::vector<iohcPacket *> &iohcTx)',
    ].map(method).join('\n\n');
    fs.writeFileSync(path.join(dir, 'radio_tx_methods.inc'), methods);
    fs.copyFileSync(path.join(__dirname, 'radio_tx_queue_test.cpp'), path.join(dir, 'test.cpp'));
    let build;
    if (process.platform === 'win32') {
      const vswhere = path.join(process.env['ProgramFiles(x86)'], 'Microsoft Visual Studio/Installer/vswhere.exe');
      const vs = spawnSync(vswhere, ['-latest', '-products', '*', '-property', 'installationPath'], { encoding: 'utf8' });
      assert.equal(vs.status, 0, vs.stderr);
      const vcvars = path.join(vs.stdout.trim(), 'VC/Auxiliary/Build/vcvars64.bat');
      const command = `call "${vcvars}" >nul && cl /nologo /EHsc /std:c++17 /W4 test.cpp /Fe:test.exe`;
      build = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], { cwd: dir, encoding: 'utf8', timeout: 60000, windowsVerbatimArguments: true });
    } else {
      build = spawnSync(process.env.CXX || 'c++', ['-std=c++17', '-pthread', '-Wall', '-Wextra', 'test.cpp', '-o', 'test'], { cwd: dir, encoding: 'utf8', timeout: 60000 });
    }
    assert.equal(build.status, 0, `${build.error || ''}\n${build.stdout}\n${build.stderr}`);
    for (let attempt = 0; attempt < 10; ++attempt) {
      const run = spawnSync(path.join(dir, process.platform === 'win32' ? 'test.exe' : 'test'), [], { encoding: 'utf8', timeout: 30000 });
      assert.equal(run.status, 0, `${run.error || ''}\n${run.stdout}\n${run.stderr}`);
      assert.match(run.stdout, /PASS:/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
