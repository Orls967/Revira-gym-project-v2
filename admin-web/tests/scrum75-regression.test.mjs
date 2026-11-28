import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.SCRUM75_PLAYWRIGHT || 'playwright-core');
const root = fileURLToPath(new URL('../', import.meta.url));
const servers = [];
let browser;
let apiOrigin;
let mockOrigin;

async function startServer(mock) {
  process.env.VITE_API_URL = '/api/v1';
  process.env.VITE_SCRUM75_MOCK = String(mock);
  const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  servers.push(server);
  return 'http://127.0.0.1:' + server.httpServer.address().port;
}

before(async () => {
  apiOrigin = await startServer(false);
  mockOrigin = await startServer(true);
  browser = await chromium.launch({ executablePath: process.env.SCRUM75_BROWSER, headless: true });
});

after(async () => {
  await browser?.close();
  await Promise.all(servers.map((server) => server.close()));
});

function tx(id, status = 'pending', options = {}) {
  return {
    id, member: { id, name: 'Fixture ' + id, email: 'fixture@example.test', phone_number: null },
    plan: { id: 1, name: 'Bulanan', duration_days: 30 },
    record_type: 'registration', start_date: null, amount: 150000, payment_method: 'on_the_spot',
    verification_status: status, has_receipt: false, receipt_url: null,
    reject_reason: null, verified_at: null, created_at: '2026-11-14T00:00:00Z',
    ...options,
  };
}

const receiptTx = (id) => tx(id, 'pending', { payment_method: 'transfer', has_receipt: true });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const listData = (rows, current = 1, total = rows.length) => ({
  data: rows, links: {},
  meta: { current_page: current, last_page: Math.max(1, Math.ceil(total / 15)), per_page: 15,
    total, from: rows.length ? (current - 1) * 15 + 1 : null,
    to: rows.length ? (current - 1) * 15 + rows.length : null },
});
const success = { message: 'Keputusan tersimpan' };

async function setup(t, handle, mock = false) {
  const context = await browser.newContext();
  t.after(() => context.close());
  await context.addInitScript(() => {
    localStorage.setItem('auth_token', 'synthetic-regression-session');
    localStorage.setItem('auth_user', JSON.stringify({ id: 1, name: 'Fixture', role: 'admin' }));
    window.receiptUrls = { created: [], revoked: [] };
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const value = create(blob);
      window.receiptUrls.created.push(value);
      return value;
    };
    URL.revokeObjectURL = (value) => {
      window.receiptUrls.revoked.push(value);
      revoke(value);
    };
  });
  const page = await context.newPage();
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ json: body, status });
    await handle({ request, route, url, json });
  });
  await page.goto((mock ? mockOrigin : apiOrigin) + '/transaksi');
  return page;
}

const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const row = (page, id) => page.getByRole('row').filter({ has: page.getByText('ID #' + id, { exact: true }) });
const dialog = (page, name) => page.getByRole('dialog', { name, exact: true });
const approveDialog = (page) => dialog(page, 'Konfirmasi Setujui Transaksi');
const rejectDialog = (page) => dialog(page, 'Tolak Transaksi Membership');

async function startApprove(page, target) {
  await button(target, 'Setujui').click();
  await button(approveDialog(page), 'Ya, Setujui').waitFor();
  return button(approveDialog(page), 'Ya, Setujui');
}

async function waitForText(page, text) {
  await page.getByText(text, { exact: true }).first().waitFor();
}

test('409: last page recovers from 16 → 15, and correction failure retries the valid page', async (t) => {
  let processed = false;
  let failCorrection = true;
  const requests = [];
  const page = await setup(t, async ({ url, request, json }) => {
    if (request.method() === 'POST') {
      processed = true;
      return json({ message: 'Transaksi ini sudah disetujui sebelumnya.' }, 409);
    }
    const current = Number(url.searchParams.get('page'));
    requests.push(current);
    if (processed && current === 1 && failCorrection) {
      failCorrection = false;
      return json({ message: 'Refresh fixture gagal' }, 500);
    }
    const rows = current === 1
      ? Array.from({ length: 15 }, (_, index) => tx(index + 1))
      : processed ? [] : [tx(16)];
    return json(listData(rows, current, processed ? 15 : 16));
  });
  await button(page, 'Selanjutnya').click();
  await (await startApprove(page, row(page, 16))).click();
  await waitForText(page, 'Transaksi ini sudah disetujui sebelumnya.');
  await waitForText(page, 'Refresh fixture gagal');
  assert.equal(await page.getByText('Daftar transaksi telah dimuat ulang', { exact: false }).count(), 0);
  await button(page, 'Coba Lagi').click();
  await row(page, 15).waitFor();
  assert.deepEqual(requests, [1, 2, 2, 1, 1]);
  assert.equal(await page.getByRole('row').count(), 16);
});

test('success: last page recovers from 31 → 30 and manual refresh handles total 0', async (t) => {
  let total = 31;
  const requests = [];
  const page = await setup(t, async ({ request, url, json }) => {
    if (request.method() === 'POST') {
      total = 30;
      return json(success);
    }
    const current = Number(url.searchParams.get('page'));
    requests.push(current);
    const from = (current - 1) * 15;
    const rows = Array.from({ length: Math.max(0, Math.min(15, total - from)) }, (_, index) => tx(from + index + 1));
    return json(listData(rows, current, total));
  });
  await button(page, 'Selanjutnya').click();
  await row(page, 30).waitFor();
  await button(page, 'Selanjutnya').click();
  await (await startApprove(page, row(page, 31))).click();
  await row(page, 30).waitFor();
  await waitForText(page, success.message);
  assert.deepEqual(requests, [1, 2, 3, 3, 2]);
  assert.equal(await button(page, 'Selanjutnya').isDisabled(), true);
  total = 0;
  await button(page, 'Muat Ulang').click();
  await page.getByText('Tidak ada transaksi pada tab', { exact: false }).waitFor();
  assert.deepEqual(requests, [1, 2, 3, 3, 2, 2, 1]);
  assert.equal(await page.getByRole('row').count(), 2);
});

test('out-of-order status and page responses cannot take over the selected view', async (t) => {
  const signaled = [deferred(), deferred()];
  const released = [deferred(), deferred()];
  const completed = [deferred(), deferred()];
  let pendingCount = 0;
  const page = await setup(t, async ({ url, json }) => {
    const status = url.searchParams.get('status');
    const current = Number(url.searchParams.get('page'));
    if (status === 'pending' && ++pendingCount <= 2) {
      const index = pendingCount - 1;
      signaled[index].resolve();
      await released[index].promise;
      await json(listData([tx(80 + index)], current, 31)).catch(() => {});
      completed[index].resolve();
    } else {
      return json(listData([tx(200 + current, status)], current, status === 'verified' ? 31 : 1));
    }
  });
  await signaled[0].promise;
  await button(page, 'Disetujui').click();
  await row(page, 201).waitFor();
  released[0].resolve();
  await completed[0].promise;
  await button(page, 'Selanjutnya').click();
  await row(page, 202).waitFor();
  await button(page, 'Menunggu Verifikasi').click();
  await signaled[1].promise;
  await button(page, 'Disetujui').click();
  await row(page, 201).waitFor();
  released[1].resolve();
  await completed[1].promise;
  assert.equal(await row(page, 81).count(), 0);
});

test('rapid page navigation rejects a late response for the superseded page', async (t) => {
  const requested = deferred();
  const release = deferred();
  const completed = deferred();
  const page = await setup(t, async ({ url, json }) => {
    const current = Number(url.searchParams.get('page'));
    if (current === 2) {
      requested.resolve();
      await release.promise;
      await json(listData([tx(16)], 2, 31)).catch(() => {});
      completed.resolve();
    } else {
      return json(listData([tx(current === 1 ? 1 : 31)], current, 31));
    }
  });
  await row(page, 1).waitFor();
  await button(page, 'Selanjutnya').click();
  await requested.promise;
  await button(page, 'Selanjutnya').click();
  await row(page, 31).waitFor();
  release.resolve();
  await completed.promise;
  assert.equal(await row(page, 16).count(), 0);
});

test('opt-in mock isolates colliding 9001 from all real API calls and persists simulation decisions', async (t) => {
  const calls = [];
  const page = await setup(t, async ({ request, json }) => {
    calls.push(request.method() + ' ' + new URL(request.url()).pathname);
    return json(listData([receiptTx(9001)]));
  }, true);
  const mockRow = page.getByRole('row').filter({ hasText: 'ID #9001' });
  await button(mockRow, 'Lihat Bukti').click();
  await waitForText(page, 'Preview bukti tidak tersedia dalam mode simulasi.');
  await button(dialog(page, 'Detail Transaksi #9001'), 'Tutup').click();
  await (await startApprove(page, mockRow)).click();
  await waitForText(page, 'Simulasi: transaksi #9001 disetujui.');
  const second = page.getByRole('row').filter({ hasText: 'ID #9002' });
  await button(second, 'Tolak').click();
  await rejectDialog(page).getByRole('textbox').fill('Simulasi alasan');
  await button(rejectDialog(page), 'Konfirmasi Tolak').click();
  await waitForText(page, 'Simulasi: transaksi #9002 ditolak.');
  await button(page, 'Disetujui').click();
  await mockRow.waitFor();
  await button(page, 'Ditolak').click();
  await second.waitFor();
  assert.deepEqual(calls, []);
});

test('real mode exposes an offline list error and retries without fixture fallback', async (t) => {
  let requests = 0;
  const page = await setup(t, async ({ route, json }) => {
    if (++requests === 1) return route.abort('internetdisconnected');
    return json(listData([tx(9001)]));
  });
  await button(page, 'Coba Lagi').waitFor();
  assert.equal(await page.getByText('Mode simulasi', { exact: false }).count(), 0);
  await button(page, 'Coba Lagi').click();
  await row(page, 9001).waitFor();
  assert.equal(requests, 2);
});

const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL9sAAAAASUVORK5CYII=', 'base64');

test('private blob: late receipt, empty/MIME/decode errors, retry, stale image event, revoke on close and unmount', async (t) => {
  const aRequested = deferred();
  const releaseA = deferred();
  const aCompleted = deferred();
  let bRequests = 0;
  const page = await setup(t, async ({ request, route, url, json }) => {
    if (!url.pathname.endsWith('/receipt')) {
      return json(listData([receiptTx(1), receiptTx(2), tx(3)]));
    }
    assert.equal(request.headers().authorization, 'Bearer synthetic-regression-session');
    if (url.pathname.includes('/1/')) {
      aRequested.resolve();
      await releaseA.promise;
      await route.fulfill({ body: png, contentType: 'image/png' }).catch(() => {});
      aCompleted.resolve();
      return;
    }
    const variants = [
      { body: Buffer.alloc(0), contentType: 'image/png' },
      { body: gif, contentType: 'image/gif' },
      { body: 'invalid', contentType: 'image/png' },
      { body: png, contentType: 'image/png' },
    ];
    return route.fulfill(variants[Math.min(bRequests++, variants.length - 1)]);
  });
  await button(row(page, 1), 'Lihat Bukti').click();
  await aRequested.promise;
  await button(dialog(page, 'Detail Transaksi #1'), 'Tutup').click();
  await button(row(page, 2), 'Lihat Bukti').click();
  const detailB = dialog(page, 'Detail Transaksi #2');
  const retry = button(detailB, 'Muat Ulang Bukti');
  await waitForText(page, 'File bukti transfer kosong.');
  assert.equal(await button(detailB, '300%').count(), 0);
  await retry.click();
  await waitForText(page, 'Format bukti transfer tidak didukung. Gunakan JPEG, PNG, atau WebP.');
  await retry.click();
  await waitForText(page, 'Gambar bukti transfer rusak atau tidak dapat dibaca.');
  await retry.click();
  await button(detailB, '300%').waitFor();
  releaseA.resolve();
  await aCompleted.promise;
  const src = await detailB.getByAltText('Bukti transfer transaksi #2').getAttribute('src');
  assert.match(src, /^blob:/);
  const before = await page.evaluate(() => window.receiptUrls);
  assert.equal(before.created.length, 2);
  assert.deepEqual(before.revoked, [before.created[0]]);
  const oldImage = await detailB.getByAltText('Bukti transfer transaksi #2').elementHandle();
  await button(detailB, 'Tutup').click();
  await button(row(page, 2), 'Lihat Bukti').click();
  await button(detailB, '300%').waitFor();
  await oldImage.evaluate((image) => image.dispatchEvent(new Event('error')));
  assert.equal(await retry.count(), 0);
  await button(detailB, 'Tutup').click();
  await button(row(page, 3), 'Detail').click();
  await detailB.waitFor({ state: 'hidden' });
  await waitForText(page, 'Bayar di tempat, tanpa bukti');
  await button(dialog(page, 'Detail Transaksi #3'), 'Tutup').click();
  await button(row(page, 2), 'Lihat Bukti').click();
  await button(detailB, '300%').waitFor();
  // A same-document route change unmounts Transaksi and leaves URL instrumentation intact.
  await page.evaluate(() => {
    history.pushState(null, '', '/');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await detailB.waitFor({ state: 'hidden' });
  const result = await page.evaluate(() => window.receiptUrls);
  assert.equal(result.created.length, 4);
  assert.deepEqual(result.revoked, result.created);
});

test('approve same-tick and overlapping reject blocked; POST reconciles the current tab', async (t) => {
  const posted = deferred();
  const release = deferred();
  const all = [];
  const page = await setup(t, async ({ request, url, json }) => {
    all.push(request.method() + ' ' + url.pathname + url.search);
    if (request.method() === 'POST') {
      posted.resolve();
      await release.promise;
      return json(success);
    }
    const status = url.searchParams.get('status');
    return json(listData([tx(status === 'verified' ? 3 : 1, status)]));
  });
  const confirm = await startApprove(page, row(page, 1));
  await confirm.evaluate((element) => {
    element.click();
    element.click();
    [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Tolak').click();
  });
  await posted.promise;
  await page.keyboard.press('Escape');
  assert.equal(await approveDialog(page).isVisible(), true);
  assert.equal(await rejectDialog(page).count(), 0);
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => {
    const active = document.activeElement;
    return active === document.body || active.closest('dialog[open]') !== null;
  }), true);
  // Dispatch a controlled context change while the native dialog keeps user input modal.
  await page.getByText('Disetujui', { exact: true }).evaluate((element) => element.click());
  release.resolve();
  await waitForText(page, success.message);
  await row(page, 3).waitFor();
  assert.deepEqual(all.filter((item) => item.startsWith('POST')),
    ['POST /api/v1/admin/transactions/1/approve']);
  assert.match(all.at(-1), /status=verified&page=1$/);
});

test('reject same-tick, trimmed Unicode boundaries and inline 422 from Laravel contract', async (t) => {
  const posts = [];
  const page = await setup(t, async ({ request, json }) => {
    if (request.method() === 'POST') {
      posts.push(request.postDataJSON());
      return json({ errors: { reject_reason: ['Alasan ditolak fixture'] } }, 422);
    }
    return json(listData([tx(1)]));
  });
  await button(row(page, 1), 'Tolak').click();
  const decision = rejectDialog(page);
  const input = decision.getByRole('textbox');
  const confirm = button(decision, 'Konfirmasi Tolak');
  assert.equal(await confirm.isDisabled(), true);
  await input.fill('   ');
  assert.equal(await confirm.isDisabled(), true);
  await input.fill('😀'.repeat(256));
  await waitForText(page, '256/255');
  assert.equal(await confirm.isDisabled(), true);
  assert.equal(Array.from(await input.inputValue()).length, 256);
  const reason = '😀'.repeat(255);
  await input.fill(' ' + reason + ' ');
  await waitForText(page, '255/255');
  assert.equal(await confirm.isEnabled(), true);
  await confirm.evaluate((element) => {
    element.form.requestSubmit(element);
    element.form.requestSubmit(element);
  });
  await waitForText(page, 'Alasan ditolak fixture');
  assert.deepEqual(posts, [{ reject_reason: reason }]);
});

test('unknown POST outcome blocks retry until successful GET; 409 overlap leaves a pending action', async (t) => {
  let posts = 0;
  let failed = false;
  const page = await setup(t, async ({ request, route, json }) => {
    if (request.method() === 'POST') {
      posts++;
      if (posts === 1) return route.abort('timedout');
      return json({ message: 'Periode membership bertabrakan.' }, 409);
    }
    if (posts === 1 && !failed) {
      failed = true;
      return json({ message: 'Retrieval interrupted' }, 500);
    }
    return json(listData([tx(1)]));
  });
  await (await startApprove(page, row(page, 1))).click();
  await waitForText(page, 'Hasil keputusan belum dapat dipastikan. Periksa status transaksi sebelum mencoba lagi.');
  await waitForText(page, 'Retrieval interrupted');
  assert.equal(await row(page, 1).count(), 0);
  await button(page, 'Coba Lagi').click();
  await (await startApprove(page, row(page, 1))).click();
  await waitForText(page, 'Periode membership bertabrakan.');
  await button(row(page, 1), 'Setujui').waitFor();
  assert.equal(posts, 2);
});

test('unmount during POST does not publish result or start a late GET', async (t) => {
  const posted = deferred();
  const release = deferred();
  const sent = deferred();
  let lists = 0;
  const page = await setup(t, async ({ request, json }) => {
    if (request.method() === 'POST') {
      posted.resolve();
      await release.promise;
      await json(success);
      sent.resolve();
      return;
    }
    lists++;
    return json(listData([tx(1)]));
  });
  await (await startApprove(page, row(page, 1))).click();
  await posted.promise;
  await page.evaluate(() => {
    history.pushState(null, '', '/');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await approveDialog(page).waitFor({ state: 'hidden' });
  release.resolve();
  await sent.promise;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(lists, 1);
  assert.equal(await page.getByText(success.message, { exact: true }).count(), 0);
});


test('a delayed 409 refresh cannot reclaim a different tab selected by the admin', async (t) => {
  const refreshStarted = deferred();
  const release = deferred();
  const finished = deferred();
  let decisionPosted = false;
  const page = await setup(t, async ({ request, url, json }) => {
    if (request.method() === 'POST') {
      decisionPosted = true;
      return json({ message: 'Transaksi ini sudah ditolak sebelumnya.' }, 409);
    }
    const status = url.searchParams.get('status');
    if (status === 'pending' && decisionPosted) {
      refreshStarted.resolve();
      await release.promise;
      await json(listData([tx(99)])).catch(() => {});
      finished.resolve();
    } else {
      return json(listData([status === 'pending' ? tx(1) : tx(1, 'rejected')]));
    }
  });
  await (await startApprove(page, row(page, 1))).click();
  await refreshStarted.promise;
  await waitForText(page, 'Transaksi ini sudah ditolak sebelumnya.');
  await button(page, 'Ditolak').click();
  await row(page, 1).waitFor();
  release.resolve();
  await finished.promise;
  assert.equal(await row(page, 99).count(), 0);
  assert.equal(await button(row(page, 1), 'Setujui').count(), 0);
});
