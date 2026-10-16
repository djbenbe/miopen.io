const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { createPreviewServer } = require('./ui-preview.cjs');

(async () => {
    const server = createPreviewServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const output = path.join(process.env.TEMP || '/tmp', 'miopen-ui-check', 'screenshots');
    fs.mkdirSync(output, { recursive: true });
    try {
        for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 720 }]) {
            const page = await browser.newPage({ viewport, locale: 'nl-BE' });
            const errors = [];
            const commands = [];
            let status = { pairingActive: false, lastTxCommand: '', lastTxResult: '' };
            let offline = false;
            let added = false;
            const devices = [
                { id: '123456', protocol: '1W', name: 'Woonkamer achteraan', position: 65, travel_time: 20, paired: true },
                { id: '123456', protocol: '2W', name: '123456', state: 'SAVED' }
            ];
            page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
            page.on('console', message => { if (message.type() === 'error') console.error('Browser console:', message.text()); });
            await page.addInitScript(() => {
                // Browser tests do not contact an ESP32 or transmit radio commands.
                window.WebSocket = class { static OPEN = 1; readyState = 1; send() {} };
                localStorage.setItem('lang', 'nl');
            });
            await page.route('**/api/devices?*', route => route.fulfill({ json: devices }));
            await page.route('**/api/2w/status?*', route => route.fulfill(offline
                ? { status: 503, json: { message: 'ESP offline' } } : { json: status }));
            await page.route('**/api/command', async route => {
                const { command } = route.request().postDataJSON();
                commands.push(command);
                if (command === 'pair2W') status = { pairingActive: true, pairingRemainingMs: 89000, lastTxCommand: 'pair2W', lastTxResult: '2W pairing started; waiting for device' };
                if (command.startsWith('new1W ')) added = true;
                await route.fulfill({ json: { success: true, message: 'Command executed' } });
            });
            await page.goto(`http://127.0.0.1:${server.address().port}`);
            await page.screenshot({ path: path.join(output, `initial-${viewport.width}.png`) });
            await page.waitForSelector('.device[data-protocol="2W"]');
            assert.equal(await page.locator('.device-protocol').allTextContents().then(x => x.join(',')), '1W,2W');
            const badgeLayout = await page.locator('.device').evaluateAll(cards => cards.map(card => {
                const label = card.querySelector('.device-protocol');
                const badge = label.getBoundingClientRect();
                const bounds = card.getBoundingClientRect();
                return {
                    floating: getComputedStyle(label).position === 'absolute',
                    left: Math.round(badge.left - bounds.left),
                    bottom: Math.round(bounds.bottom - badge.bottom),
                    overlap: Array.from(card.querySelectorAll('button')).some(button => {
                        const control = button.getBoundingClientRect();
                        return badge.left < control.right && badge.right > control.left && badge.top < control.bottom && badge.bottom > control.top;
                    })
                };
            }));
            for (const badge of badgeLayout) {
                assert.equal(badge.floating, true);
                assert.ok(badge.left >= 8 && badge.left <= 9);
                assert.ok(badge.bottom >= 8 && badge.bottom <= 9);
                assert.equal(badge.overlap, false);
            }
            assert.equal(await page.locator('.device[data-protocol="2W"] .open').count(), 0);
            assert.equal(await page.evaluate(() => window.MiOpenApp.state.devicesCache.length), 1);
            await page.evaluate(() => window.MiOpenApp.updateDeviceFill('123456', 20));
            assert.equal(await page.locator('.device[data-protocol="2W"] .device-state').textContent(), 'Opgeslagen');
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
            await page.screenshot({ path: path.join(output, `home-${viewport.width}.png`), fullPage: true });

            await page.click('#add-popup');
            assert.equal(await page.locator('#popup.open #device-protocol-choice').isVisible(), true);
            assert.equal(await page.locator('#device-add-dialog').count(), 0);
            assert.equal(commands.length, 0);
            await page.waitForTimeout(150);
            await page.screenshot({ path: path.join(output, `choice-${viewport.width}.png`) });
            await page.click('#device-add-1w');
            await page.waitForSelector('#popup.open');
            assert.equal(await page.locator('#device-add-panel').isVisible(), false);
            await page.fill('#popup-input', 'Nieuwe 1W');
            await page.click('#popup-save');
            await page.waitForFunction(() => !document.getElementById('popup').classList.contains('open'));
            assert.equal(added, true);
            assert.equal(commands[0], 'new1W Nieuwe 1W');

            await page.click('#add-popup');
            await page.evaluate(() => { document.getElementById('device-add-2w').click(); document.getElementById('device-add-2w').click(); });
            await page.waitForFunction(() => document.getElementById('device-pair-time').textContent.includes('89'));
            assert.equal(commands.filter(x => x === 'pair2W').length, 1);
            await page.screenshot({ path: path.join(output, `search-${viewport.width}.png`) });
            await page.evaluate(() => window.MiOpenApp.applyTwoWStatus({ pairingActive: true, pairingRemainingMs: 80000, lastRxCounter: 3, lastRxCmd: '29' }));
            assert.equal(await page.locator('#device-pair-status').textContent(), 'Zoeken naar een 2W-apparaat...');

            await page.click('#popup-close');
            await page.click('#add-popup');
            await page.click('#device-add-2w');
            await page.waitForFunction(() => document.getElementById('device-pair-time').textContent.includes('89'));
            assert.equal(commands.filter(x => x === 'pair2W').length, 1);
            offline = true;
            await page.waitForFunction(() => document.getElementById('device-pair-status').textContent.includes('Verbinding onderbroken'));
            assert.equal(await page.locator('#device-pair-retry').isVisible(), false);
            offline = false;
            status = { pairingActive: false, lastTxCommand: 'pair2W', lastTxError: true, lastTxResult: '2W pairing timed out before key confirmation (0x33)' };
            await page.waitForSelector('#device-pair-retry:visible');
            await page.click('#device-pair-retry');
            await page.waitForFunction(() => document.getElementById('device-pair-time').textContent.includes('89'));
            assert.equal(commands.filter(x => x === 'pair2W').length, 2);
            devices.push({ id: 'abcdef', protocol: '2W', name: 'abcdef', state: 'SAVED' });
            status = { pairingActive: false, lastTxCommand: 'pair2W', lastTxResult: '2W pairing completed and saved: abcdef' };
            await page.waitForFunction(() => document.getElementById('device-pair-status').textContent === 'Gekoppeld en opgeslagen');
            await page.waitForSelector('.device[data-protocol="2W"][data-id="abcdef"]');
            await page.screenshot({ path: path.join(output, `saved-${viewport.width}.png`) });
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('#popup').isVisible(), false);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
            assert.deepEqual(errors, []);
            console.log(`PASS ${viewport.width}px: choice, 1W form, 2W search, duplicate guard, resume, offline, retry, confirmed save, cards, no overflow`);
            await page.close();
        }
        console.log(`Screenshots: ${output}`);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
