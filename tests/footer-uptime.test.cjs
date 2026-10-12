const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(requestJson) {
    const timers = new Map();
    const intervals = [];
    const events = new Map();
    const elements = {
        'system-uptime': { textContent: 'Uptime: --' },
        'firmware-version': { textContent: '' }
    };
    let nextTimer = 0;
    const document = {
        hidden: false,
        getElementById(id) { return elements[id] || null; },
        querySelector() { return null; },
        addEventListener(event, callback) { events.set(event, callback); }
    };
    const window = {
        location: { hash: '#settings' },
        addEventListener() {},
        MiOpenPopup: { init() {} },
        MiOpenDevices: { init() {} },
        MiOpenRemotes: { init() {} },
        MiOpenApi: { requestJson }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extras/web_interface_data/js/app.js'), 'utf8'), {
        window, document, AbortController,
        localStorage: { getItem() {} },
        setTimeout(callback, delay) { timers.set(++nextTimer, { callback, delay }); return nextTimer; },
        clearTimeout(id) { timers.delete(id); },
        setInterval(callback, delay) { intervals.push({ callback, delay }); }
    });
    events.get('DOMContentLoaded')();
    return { elements, document, timers, intervals, events,
        refresh: [...timers.values()].find(timer => timer.delay === 250).callback };
}

test('uses the existing uptimeMs API and preserves the firmware label', async () => {
    const f = fixture(async url => {
        assert.equal(url, '/api/info');
        return { version: 'v2.0.7-Beta', branch: 'Beta', uptimeMs: 93780000 };
    });
    await f.refresh();
    assert.equal(f.elements['system-uptime'].textContent, 'Uptime: 1d 2h 3m');
    assert.equal(f.elements['firmware-version'].textContent, 'Firmware: v2.0.7-Beta (Beta)');
    assert.equal(f.intervals[0].delay, 60000);
});

test('refresh reflects an ESP restart instead of continuing browser uptime', async () => {
    let uptimeMs = 604800000;
    const f = fixture(async () => ({ uptimeMs }));
    await f.refresh();
    assert.equal(f.elements['system-uptime'].textContent, 'Uptime: 7d 0h 0m');
    uptimeMs = 1000;
    await f.intervals[0].callback();
    assert.equal(f.elements['system-uptime'].textContent, 'Uptime: 0d 0h 0m');
});

test('missing or invalid uptime is not displayed as a zero-day uptime', async () => {
    for (const uptimeMs of [undefined, null, -1, '60000', Infinity]) {
        const f = fixture(async () => ({ uptimeMs }));
        await f.refresh();
        assert.equal(f.elements['system-uptime'].textContent, 'Uptime: --');
    }
});

test('failed requests clear stale uptime and can recover', async () => {
    let offline = false;
    const f = fixture(async () => {
        if (offline) throw new Error('offline');
        return { uptimeMs: 60000 };
    });
    await f.refresh();
    offline = true;
    await f.refresh();
    assert.equal(f.elements['system-uptime'].textContent, 'Uptime: --');
    offline = false;
    await f.refresh();
    assert.equal(f.elements['system-uptime'].textContent, 'Uptime: 0d 0h 1m');
});

test('hidden tabs do not poll and becoming visible refreshes the footer', async () => {
    let calls = 0;
    const f = fixture(async () => { calls++; return { uptimeMs: 0 }; });
    f.document.hidden = true;
    await f.refresh();
    assert.equal(calls, 0);
    f.document.hidden = false;
    await f.events.get('visibilitychange')();
    assert.equal(calls, 1);
});

test('slow requests do not overlap and abort after ten seconds', async () => {
    let calls = 0;
    const f = fixture((url, options) => {
        calls++;
        return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout'))));
    });
    const pending = f.refresh();
    await f.refresh();
    assert.equal(calls, 1);
    [...f.timers.values()].find(timer => timer.delay === 10000).callback();
    await pending;
    assert.equal(f.elements['system-uptime'].textContent, 'Uptime: --');
    assert.equal([...f.timers.values()].some(timer => timer.delay === 10000), false);
});
