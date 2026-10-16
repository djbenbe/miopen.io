const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../extras/web_interface_data/js/twow.js'), 'utf8');

function fixture(response = { success: true, message: 'Command executed' }) {
    const timers = new Map();
    const requests = [];
    let nextTimer = 0;
    const status = { textContent: '', classList: { toggle(name, enabled) { status.error = enabled; } } };
    const app = {
        elements: { twowStatus: status },
        i18nText: (key, fallback) => fallback,
        logStatus: () => {}
    };
    const context = {
        window: { MiOpenApi: { async postJson(url, payload) { requests.push({ url, payload }); return typeof response === 'function' ? response() : response; } } },
        setTimeout(callback, delay) { timers.set(++nextTimer, { callback, delay }); return nextTimer; },
        clearTimeout(id) { timers.delete(id); }
    };
    vm.runInNewContext(source, context);
    context.window.MiOpenTwoW.init(app);
    return { app, status, timers, requests };
}

for (const command of ['pair2W', 'pair2Walt', 'pair2Wkey']) {
    test(`${command}: waits for completion instead of accepting unrelated radio traffic`, async () => {
        const { app, timers, requests } = fixture();
        await app.sendTwoWCommand(command);
        assert.equal(requests[0].url, '/api/command');
        assert.equal(requests[0].payload.command, command);
        assert.equal([...timers.values()][0].delay, 90000);
        app.applyTwoWStatus({ pairingActive: true, lastRxCounter: 1, lastRxCmd: '29' });
        assert.equal(app.pendingTwoWResponse.isPairing, true);
        assert.equal(timers.size, 1);
        app.applyTwoWStatus({
            pairingActive: false, lastTxCommand: 'pair2W',
            lastTxResult: '2W pairing completed and saved: 123456', lastRxCounter: 4
        });
        assert.equal(app.pendingTwoWResponse, null);
        assert.equal(timers.size, 0);
    });
}

test('a device rejection or firmware timeout remains visible', async () => {
    const { app, status, timers } = fixture();
    await app.sendTwoWCommand('pair2Wkey');
    app.applyTwoWStatus({
        pairingActive: false, lastTxCommand: 'pair2W', lastTxError: true,
        lastTxResult: '2W pairing rejected: CMD FE 70', lastRxCounter: 2, lastRxCmd: 'FE'
    });
    assert.equal(status.textContent, '2W pairing rejected: CMD FE 70');
    assert.equal(status.error, true);
    assert.equal(timers.size, 0);
});

test('API failure does not become a sent command or open a wait timer', async () => {
    const { app, status, timers } = fixture({ success: false, message: 'Unknown command' });
    await app.sendTwoWCommand('pair2Wkey');
    assert.equal(status.textContent, 'Unknown command');
    assert.equal(status.error, true);
    assert.equal(timers.size, 0);
});

test('ordinary discovery still stops its timer on a received frame', async () => {
    const { app, timers } = fixture();
    await app.sendTwoWCommand('discover28');
    assert.equal([...timers.values()][0].delay, 5000);
    app.applyTwoWStatus({ lastRxCounter: 1, lastRxCmd: '29' });
    assert.equal(app.pendingTwoWResponse, null);
    assert.equal(timers.size, 0);
});

test('double clicks do not send two pairing commands while HTTP is pending', async () => {
    let resolve;
    const { app, requests } = fixture(() => new Promise(done => { resolve = done; }));
    const first = app.sendTwoWCommand('pair2W');
    assert.equal(await app.sendTwoWCommand('pair2W'), false);
    assert.equal(requests.length, 1);
    resolve({ success: true });
    await first;
});

test('confirmed pairing before HTTP response does not create a stale timeout', async () => {
    let resolve;
    let refreshes = 0;
    const { app, status, timers } = fixture(() => new Promise(done => { resolve = done; }));
    app.fetchAndDisplayDevices = () => { refreshes++; };
    const sending = app.sendTwoWCommand('pair2W');
    const completed = { pairingActive: false, lastTxCommand: 'pair2W', lastTxResult: '2W pairing completed and saved: 123456' };
    app.applyTwoWStatus(completed);
    resolve({ success: true });
    await sending;
    assert.equal(timers.size, 0);
    assert.equal(status.textContent, completed.lastTxResult);
    assert.equal(refreshes, 1);
    app.applyTwoWStatus(completed);
    assert.equal(refreshes, 1);
});

test('2W status remains available before the technical 2W page is loaded', () => {
    const { app } = fixture();
    app.elements = {};
    let received;
    app.onTwoWStatus = status => { received = status; };
    app.applyTwoWStatus({ pairingActive: true, pairingRemainingMs: 65000 });
    assert.equal(received.pairingRemainingMs, 65000);
    assert.equal(app.twoWStatus.pairingActive, true);
});
