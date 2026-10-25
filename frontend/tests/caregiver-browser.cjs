// Uses an already installed Playwright path, without adding dependencies.
// Every API request is intercepted: no real accounts or backend writes.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.MINHAVOZ_PLAYWRIGHT);
const base = process.env.MINHAVOZ_WEB_URL || 'http://localhost:3000';
const settings = { pictogram_size: 'grande', text_size: 'grande', speech_rate: 1,
  voice: 'coral', volume: 1, hidden_categories: [], history_enabled: true, speak_on_tap: false, grid_columns: 3 };
const user = { id: 'synthetic-adult', full_name: 'Conta de teste', username: 'synthetic', email: 'synthetic@example.com', role: 'responsavel' };
const profiles = [{ id: 'test-care', name: 'Pessoa de teste A', my_role: 'cuidador', settings },
  { id: 'test-owner', name: 'Pessoa de teste B', my_role: 'responsavel', settings }];
let shared = false;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const unexpected = [], errors = [], seen = [];
  let page;
  try {
    await context.addInitScript(({ user }) => {
      localStorage.setItem('auth_token', JSON.stringify('synthetic-token'));
      localStorage.setItem('auth_user', JSON.stringify(JSON.stringify(user)));
    }, { user });
    await context.route('**/api/**', async (route) => {
      const req = route.request(), path = new URL(req.url()).pathname;
      seen.push(path);
      let data;
      if (req.method() !== 'GET') {
        unexpected.push(req.method() + ' ' + path);
        return route.fulfill({ status: 403, json: { detail: 'Mutation blocked in UI verification' } });
      }
      if (path === '/api/auth/me') data = user;
      else if (path === '/api/comm-users') data = profiles;
      else if (path === '/api/invitations') data = [];
      else {
        const p = profiles.find((p) => path === `/api/comm-users/${p.id}` || path.startsWith(`/api/comm-users/${p.id}/`));
        if (p && path === `/api/comm-users/${p.id}`) data = p;
        else if (p && path.endsWith('/therapy-notes')) data = shared ? [{ id: 'excerpt', title: 'Trecho autorizado', text: 'Apoio permitido', is_author: false }] : [];
        else if (p && path.endsWith('/board')) data = { comm_user: p, settings, categories: [], pictograms: [], quick_phrases: [], activities: [], routines: [] };
        else if (p && path.endsWith('/links')) data = [{ id: 'own-link', role: p.my_role, is_me: true }];
        else { unexpected.push(path); return route.fulfill({ status: 403, json: { detail: 'Unexpected request' } }); }
      }
      return route.fulfill({ status: 200, json: data });
    });
    page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.setDefaultTimeout(30000);
    const visible = async (id) => page.getByTestId(id).waitFor({ state: 'visible' });
    const checkCareMenu = async () => {
      await visible('hub-item-cuidado');
      const ids = await page.locator('[data-testid^="hub-item-"]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-testid')));
      assert.deepEqual(ids, shared ? ['hub-item-cuidado', 'hub-item-acompanhamento', 'hub-item-rede'] : ['hub-item-cuidado', 'hub-item-rede']);
      assert.equal(await page.getByTestId('hub-edit-user-button').count(), 0);
      assert.equal(await page.getByTestId('hub-item-rede').getAttribute('aria-label'), 'Meu vínculo');
    };
    await page.goto(base + '/usuario/test-care');
    await checkCareMenu();
    console.log('PASS: caregiver menu, even with global account role responsavel');
    await page.getByTestId('hub-item-cuidado').click();
    await page.waitForURL('**/usuario/test-care/cuidado');
    await page.getByText('Apoio ao cuidado', { exact: true }).waitFor();
    await page.goBack();
    await checkCareMenu();
    await page.getByTestId('hub-item-rede').click();
    await page.waitForURL('**/usuario/test-care/rede');
    await page.getByText('Papel: Cuidador', { exact: true }).waitFor();
    assert.equal(await page.getByText('Adicionar integrante', { exact: true }).count(), 0);
    await page.goBack();
    await checkCareMenu();
    console.log('PASS: allowed care and own-link navigation remains usable');
    // Same SPA and account: switch to owner link, then browser-back to caregiver.
    await page.goto(base + '/painel');
    await page.getByTestId('comm-user-open-test-owner').click();
    await visible('hub-item-pictograma');
    await page.goBack();
    await page.getByTestId('comm-user-open-test-care').click();
    await checkCareMenu();
    console.log('PASS: same account, separate owner/caregiver links, SPA navigation');
    const forbidden = ['prancha', 'pictograma', 'historico', 'indicadores', 'configuracoes', 'atividades', 'rotinas', 'frases', 'escolar', 'acompanhamento'];
    for (const route of forbidden) {
      await page.goto(base + '/usuario/test-care/' + route);
      await page.waitForURL('**/usuario/test-care/cuidado');
      await page.getByText('Apoio ao cuidado', { exact: true }).waitFor();
    }
    await page.goto(base + '/usuario/form?id=test-care');
    await page.waitForURL('**/usuario/test-care');
    await checkCareMenu();
    console.log('PASS: 11 direct administrative URLs redirect without requesting forbidden APIs');
    shared = true;
    await page.goto(base + '/usuario/test-care');
    await checkCareMenu();
    await page.getByTestId('hub-item-acompanhamento').click();
    await page.getByText('Apoio permitido', { exact: true }).waitFor();
    shared = false;
    await page.goBack();
    await checkCareMenu();
    console.log('PASS: authorized excerpt shown; revocation hides follow-up on return');
    assert.deepEqual(unexpected, [], 'No forbidden API or mutation should be attempted');
    assert.deepEqual(errors, [], 'No browser runtime errors');
  } catch (error) {
    console.error({ url: page?.url(), body: (await page?.locator('body').innerText())?.slice(0, 1600), errors, requests: seen.slice(-15) });
    throw error;
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
