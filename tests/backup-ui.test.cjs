const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(error) {
    const clicks = new Map();
    const downloads = [];
    const messages = [];
    const ids = ['download-backup', 'download-2w-backup'];
    let ready;
    const window = {
        location: { hash: '#settings' },
        addEventListener() {},
        MiOpenPopup: { init() {} },
        MiOpenDevices: { init() {} },
        MiOpenTwoW: { init() {} },
        MiOpenDevicePairing: { init() {} },
        MiOpenRemotes: { init() {} },
        showToast(message, isError) { messages.push({ message, isError }); },
        MiOpenApi: {
            async downloadFile(url, filename) {
                if (error) throw new Error(error);
                downloads.push({ url, filename });
            }
        }
    };
    const document = {
        querySelector() { return null; },
        querySelectorAll() { return []; },
        getElementById(id) {
            return ids.includes(id) ? { addEventListener(event, callback) { clicks.set(id, callback); } } : null;
        },
        addEventListener(event, callback) { if (event === 'DOMContentLoaded') ready = callback; }
    };
    const source = fs.readFileSync(path.join(__dirname, '../extras/web_interface_data/js/app.js'), 'utf8');
    vm.runInNewContext(source, { window, document, localStorage: { getItem() {} }, setTimeout() {} });
    ready();
    return { clicks, downloads, messages };
}

test('separate 2W backup uses its own endpoint and filename', async () => {
    const { clicks, downloads } = fixture();
    clicks.get('download-2w-backup')();
    await Promise.resolve();
    assert.deepEqual(downloads, [{ url: '/api/download/backup/2w', filename: 'miopen-2w-backup.json' }]);
});

test('full backup keeps its existing download route', () => {
    const { clicks, downloads } = fixture();
    clicks.get('download-backup')();
    assert.deepEqual(downloads, [{ url: '/api/download/backup', filename: 'miopen-backup.json' }]);
});

test('failed 2W download is visible in settings', async () => {
    const { clicks, messages, downloads } = fixture('Wait until pairing has finished');
    clicks.get('download-2w-backup')();
    await Promise.resolve();
    assert.equal(downloads.length, 0);
    assert.deepEqual(messages, [{ message: 'Wait until pairing has finished', isError: true }]);
});

test('2W backup control has translations in every bundled language', () => {
    const base = path.join(__dirname, '../extras/web_interface_data');
    const html = fs.readFileSync(path.join(base, 'pages/settings.html'), 'utf8');
    assert.match(html, /id="download-2w-backup"/);
    for (const lang of ['nl', 'en', 'de', 'fr']) {
        const translations = JSON.parse(fs.readFileSync(path.join(base, `lang/${lang}.json`), 'utf8'));
        assert.ok(translations['button.download_2w_backup'], lang);
    }
});
