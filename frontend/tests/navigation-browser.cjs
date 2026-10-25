// Real web UI, synthetic accounts, every API request intercepted. No real writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.MINHAVOZ_PLAYWRIGHT);
const base = process.env.MINHAVOZ_WEB_URL || 'http://localhost:3000';
const settings = { pictogram_size: 'grande', text_size: 'grande', speech_rate: 1, voice: 'coral', volume: 1, hidden_categories: [], history_enabled: true, speak_on_tap: false, grid_columns: 3 };
const menus = {
  responsavel: ['prancha', 'pictograma', 'frases', 'rotinas', 'atividades', 'rede', 'historico', 'indicadores', 'acompanhamento', 'configuracoes'],
  cuidador: ['cuidado', 'acompanhamento', 'rede'],
  professor: ['atividades', 'rotinas', 'frases', 'escolar', 'acompanhamento', 'rede'],
  terapeuta: ['indicadores', 'historico', 'acompanhamento', 'rede'],
};
const labels = { responsavel: 'Responsável', cuidador: 'Cuidador', professor: 'Professor', terapeuta: 'Terapeuta' };
const allRoutes = [...new Set(Object.values(menus).flat())];
const account = (role) => ({ id: 'synthetic-' + role, full_name: 'Teste ' + role, email: role + '@example.com', username: 'synthetic-' + role, role });
const otherRole = (role) => role === 'cuidador' ? 'responsavel' : role === 'responsavel' ? 'cuidador' : role;
const profile = (id, role) => ({ id, name: id === 'test-person' ? 'Pessoa teste' : 'Outra pessoa teste', my_role: role, settings });

async function runRole(browser, startingRole) {
  const context = await browser.newContext(process.env.MINHAVOZ_COLOR_AUDIT ? { viewport: { width: 390, height: 844 } } : {});
  const errors = [], unexpected = [], calls = [];
  let failContent = false;
  let observeContentFault;
  const page = await context.newPage();
  const colorCapture = async (name) => {
    if (!process.env.MINHAVOZ_COLOR_AUDIT) return;
    const output = path.resolve(__dirname, '../../.local-backups/color-audit');
    fs.mkdirSync(output, { recursive: true });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(output, startingRole + '-' + name + '.png') });
    const samples = await page.evaluate(() => {
      const rgba = (s) => s.match(/[\d.]+/g).map(Number);
      const background = (el) => {
        if (!el) return [255, 255, 255];
        const c = rgba(getComputedStyle(el).backgroundColor), alpha = c[3] ?? 1;
        const behind = alpha < 1 ? background(el.parentElement) : c;
        return c.slice(0, 3).map((v, i) => v * alpha + behind[i] * (1 - alpha));
      };
      return [...document.querySelectorAll('*')].filter((el) => {
        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        return !el.children.length && el.textContent.trim() && s.fontFamily.includes('Jakarta') &&
          r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0 && s.visibility !== 'hidden';
      }).map((el) => {
        const s = getComputedStyle(el);
        return { text: el.textContent.slice(0, 70), fg: rgba(s.color), bg: background(el),
          min: parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && /bold/i.test(s.fontFamily)) ? 3 : 4.5 };
      });
    });
    const luminance = (c) => c.slice(0, 3).map((v) => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; })
      .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    for (const sample of samples) {
      const [a, b] = [luminance(sample.fg), luminance(sample.bg)].sort((a, b) => b - a);
      assert.ok((a + .05) / (b + .05) >= sample.min, startingRole + '/' + name + ': contrast ' + sample.text);
    }
  };
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (/GO_BACK|not handled by any navigator|Attempted to navigate before mounting|Maximum update depth/.test(message.text())) errors.push(message.text());
  });
  // A reload inside Communication Mode may show a native browser confirmation.
  page.on('dialog', (dialog) => dialog.accept());
  await context.route('**/api/**', async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const method = req.method();
    calls.push(method + ' ' + path);
    let role = req.headers().authorization?.replace('Bearer synthetic-', '');
    if (path === '/api/auth/login') {
      role = req.postDataJSON().email.split('@')[0];
      return route.fulfill({ json: { token: 'synthetic-' + role, user: account(role) } });
    }
    if (!menus[role]) return route.fulfill({ status: 401, json: { detail: 'Test session required' } });
    const p = profile('test-person', role), other = profile('test-other', otherRole(role));
    if (path.startsWith('/api/comm-users/test-unlinked')) return route.fulfill({ status: 403, json: { detail: 'No link' } });
    const match = [p, other].find((p) => path === `/api/comm-users/${p.id}` || path.startsWith(`/api/comm-users/${p.id}/`));
    let data;
    if (path === '/api/auth/me') data = account(role);
    else if (path === '/api/auth/role' && method === 'PUT') data = account(req.postDataJSON().role);
    else if (path === '/api/comm-users' && method === 'GET') data = [p, other];
    else if (path === '/api/invitations') data = [];
    else if (/^\/api\/sessions\/.*\/end$/.test(path) && method === 'POST') data = { ok: true };
    else if (match) {
      const suffix = path.slice(`/api/comm-users/${match.id}`.length);
      if (failContent && ['/board', '/therapy-notes'].includes(suffix)) {
        observeContentFault?.();
        return route.fulfill({ status: 500, json: { detail: 'Simulated load failure' } });
      }
      if (!suffix && method === 'GET') data = match;
      else if (suffix === '/board') data = { comm_user: match, settings, categories: [], pictograms: [], quick_phrases: [], activities: [], routines: [] };
      else if (suffix === '/therapy-notes') data = [{ id: 'test-excerpt', title: 'Trecho de teste', text: 'Orientação autorizada', is_author: match.my_role === 'terapeuta', shared: { roles: [] } }];
      else if (suffix === '/links') data = [{ id: 'own-link', role: match.my_role, is_me: true, member_name: 'Teste', member_email: 'synthetic@example.com' }];
      else if (suffix === '/invitations' && match.my_role === 'responsavel') data = [];
      else if (suffix === '/activities' && ['responsavel', 'professor'].includes(match.my_role)) data = [];
      else if (suffix === '/routines' && ['responsavel', 'professor'].includes(match.my_role)) data = [];
      else if (suffix === '/history' && ['responsavel', 'terapeuta'].includes(match.my_role)) data = [];
      else if (suffix === '/stats' && ['responsavel', 'terapeuta'].includes(match.my_role)) data = { total_phrases: 0, total_sessions: 0, total_minutes: 0, by_source: {}, daily: [], top_pictograms: [], top_categories: [], recent_sessions: [] };
      else if (suffix === '/school/history' && match.my_role === 'professor') data = [];
      else if (suffix === '/school/stats' && match.my_role === 'professor') data = { my_school_phrases: 0, pending_activities: 0, completed_activities: 0 };
      else if (suffix === '/sessions/start' && method === 'POST') data = { id: 'synthetic-session' };
    }
    if (data === undefined) { unexpected.push(method + ' ' + path); return route.fulfill({ status: 403, json: { detail: 'Unexpected test request' } }); }
    return route.fulfill({ json: data });
  });
  const byId = (id) => page.locator('[data-testid="' + id + '"]:visible' + (id === 'header-back-button' ? ':not([data-testid="profile-access-loading"] *):not([data-testid="navigation-pending"] *)' : ''));
  const visible = (id) => byId(id).waitFor({ state: 'visible' });
  const login = async (role) => {
    await visible('login-submit-button');
    if (process.env.MINHAVOZ_COLOR_AUDIT) {
      await byId('login-email-input').focus();
      assert.equal(await byId('login-email-input').evaluate((el) => getComputedStyle(el).borderColor), 'rgb(112, 45, 197)');
      await colorCapture('login-focus');
    }
    await byId('login-email-input').fill(role + '@example.com');
    await byId('login-password-input').fill('synthetic-password');
    await byId('login-submit-button').click();
  };
  const hub = async (id = 'test-person', role = startingRole) => {
    await page.waitForURL(base + '/usuario/' + id);
    await visible('hub-open-comm-button');
    await page.locator('[data-testid="hub-header"]:visible').getByText('Você: ' + labels[role], { exact: true }).waitFor();
  };
  const panel = async () => { await page.waitForURL(base + '/painel'); await visible('comm-user-open-test-person'); };
  const goHub = async () => { await byId('header-back-button').click(); await hub(); };
  const goPanel = async () => { await byId('header-back-button').click(); await panel(); };
  const solveExit = async () => {
    await visible('exit-guard-question');
    const values = (await byId('exit-guard-question').innerText()).match(/\d+/g).map(Number);
    await byId('exit-guard-option-' + (values[0] + values[1])).click();
    await hub();
  };
  try {
    // Login, account list, per-person hub.
    await page.goto(base + '/login'); await login(startingRole); await panel();
    await colorCapture('list');
    await byId('comm-user-open-test-person').click(); await hub();
    await colorCapture('hub');
    await goPanel();
    const listTitles = { responsavel: 'Usuários', cuidador: 'Usuários', professor: 'Meus alunos', terapeuta: 'Meus pacientes' };
    await page.getByRole('heading', { name: listTitles[startingRole], exact: true }).waitFor();
    console.log('PASS ' + startingRole + ': login -> list -> person -> list');

    // Every permitted menu function; every direct entry + refresh + explicit exit.
    for (const route of menus[startingRole]) {
      await byId('comm-user-open-test-person').click(); await hub();
      await byId('hub-item-' + route).click();
      await page.waitForURL(base + '/usuario/test-person/' + route);
      await visible('header-back-button');
      await colorCapture(route);
      const modal = { atividades: ['activity-add-button', 'activity-sheet'], rotinas: ['routine-add-button', 'routine-sheet'], frases: ['phrases-add-button', 'phrase-sheet'],
        ...(startingRole === 'responsavel' ? { rede: ['network-add-button', 'network-add-sheet'] } : {}),
        ...(startingRole === 'terapeuta' ? { acompanhamento: ['new-private-note', 'therapy-note-sheet'] } : {}) }[route];
      if (modal) {
        await byId(modal[0]).click(); await visible(modal[1] + '-close');
        await byId(modal[1] + '-close').click();
        await page.getByTestId(modal[1]).waitFor({ state: 'hidden' });
      }
      await goHub(); await goPanel();
      await page.goto(base + '/usuario/test-person/' + route);
      await visible('header-back-button');
      await page.reload(); await visible('header-back-button');
      await goHub(); await goPanel();
    }
    console.log('PASS ' + startingRole + ': all ' + menus[startingRole].length + ' permitted functions, back, direct URL and refresh');

    await page.goto(base + '/usuario/test-person'); await hub();
    await page.reload(); await hub(); await goPanel();
    await byId('comm-user-open-test-other').click(); await hub('test-other', otherRole(startingRole));
    await byId('header-back-button').click(); await panel();
    await byId('comm-user-open-test-person').click(); await hub();

    // Hardware/browser back must prompt, cancel must keep the board; success
    // returns to this person's adult hub without losing the token or link.
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    await byId('hub-open-comm-button').click(); await visible('communication-mode');
    await page.evaluate(() => window.history.back());
    await visible('exit-guard-question');
    await byId('exit-guard-stay-button').click(); await visible('communication-mode');
    await byId('comm-exit-lock-button').click();
    await solveExit();
    assert.equal(await page.evaluate(() => localStorage.getItem('auth_token')), token);
    await goPanel();
    await page.goto(base + '/comunicacao/test-person'); await visible('communication-mode');
    await page.reload(); await visible('communication-mode');
    await byId('comm-exit-lock-button').click(); await solveExit(); await goPanel();
    console.log('PASS ' + startingRole + ': protected exit (cancel/answer/browser back/direct/refresh), session and link preserved');

    failContent = true;
    const faultObserved = new Promise((resolve) => { observeContentFault = resolve; });
    const pendingRoute = { responsavel: 'prancha', cuidador: 'cuidado', professor: 'frases', terapeuta: 'acompanhamento' }[startingRole];
    await page.goto(base + '/usuario/test-person/' + pendingRoute);
    await Promise.race([faultObserved, new Promise((_, reject) => setTimeout(() => reject(new Error('Expected content fault was not requested')), 10000))]);
    await page.locator('[data-testid="navigation-pending"]:visible').waitFor();
    await page.locator('[data-testid="navigation-pending"]:visible [data-testid="header-back-button"]').click();
    failContent = false;
    await hub(); await goPanel();
    await page.goto(base + '/usuario/test-unlinked'); await panel();
    await page.goto(base + '/comunicacao/test-unlinked'); await visible('comm-error-back-button');
    await byId('comm-error-back-button').click(); await panel();
    console.log('PASS ' + startingRole + ': failed content requests and unlinked profiles have safe exits');

    // Denied route navigation must resolve to an allowed screen with an exit.
    for (const route of allRoutes.filter((route) => !menus[startingRole].includes(route))) {
      await page.goto(base + '/usuario/test-person/' + route);
      const target = startingRole === 'cuidador' ? '/usuario/test-person/cuidado'
        : startingRole === 'professor' && ['historico', 'indicadores'].includes(route) ? '/usuario/test-person/escolar' : '/usuario/test-person';
      await page.waitForURL(base + target); await visible('header-back-button');
      if (target.endsWith('/test-person')) await goPanel(); else { await goHub(); await goPanel(); }
    }
    // Orphan/old paths have a safe escape, not a GO_BACK action.
    await page.goto(base + '/caminho-antigo-inexistente'); await visible('not-found-leave-button');
    await byId('not-found-leave-button').click(); await panel();
    await byId('panel-change-role-button').click();
    await visible('profile-back-panel-button'); await byId('profile-back-panel-button').click(); await panel();

    if (['responsavel', 'cuidador'].includes(startingRole)) {
      await page.goto(base + '/usuario/form'); await visible('header-back-button');
      await byId('header-back-button').click(); await panel();
    } else { await page.goto(base + '/usuario/form'); await panel(); }
    await page.goto(base + '/usuario/form?id=test-person');
    if (startingRole === 'responsavel') { await visible('header-back-button'); await goHub(); await goPanel(); }
    else { await hub(); await goPanel(); }

    // Logout is explicit; protected links after logout retain their safe target
    // through login. Switching account recomputes the same person's link.
    await byId('panel-logout-button').click();
    await byId('logout-confirm-confirm').click(); await visible('welcome-login-button');
    assert.equal(await page.evaluate(() => localStorage.getItem('auth_token')), null);
    const firstFunction = menus[startingRole][0];
    await page.goto(base + '/usuario/test-person/' + firstFunction); await login(startingRole);
    await page.waitForURL(base + '/usuario/test-person/' + firstFunction);
    await visible('header-back-button'); await goHub(); await goPanel();
    await byId('panel-logout-button').click(); await byId('logout-confirm-confirm').click();
    await visible('welcome-login-button');
    await page.goto(base + '/usuario/test-person/pictograma');
    const switchedRole = startingRole === 'responsavel' ? 'cuidador' : 'responsavel';
    await login(switchedRole);
    if (switchedRole === 'responsavel') { await page.waitForURL(base + '/usuario/test-person/pictograma'); await visible('header-back-button'); await byId('header-back-button').click(); }
    else { await page.waitForURL(base + '/usuario/test-person/cuidado'); await visible('header-back-button'); await byId('header-back-button').click(); }
    await hub('test-person', switchedRole);
    await byId('header-back-button').click(); await panel();
    if (startingRole === 'responsavel') {
      await byId('panel-logout-button').click(); await byId('logout-confirm-confirm').click();
      await visible('welcome-login-button');
      await page.goto(base + '/usuario/form?id=test-person'); await login('responsavel');
      await page.waitForURL(base + '/usuario/form?id=test-person'); await visible('comm-user-name-input');
      await byId('header-back-button').click(); await hub('test-person', 'responsavel');
      await byId('header-back-button').click(); await panel();
    }
    console.log('PASS ' + startingRole + ': forbidden routes, orphan fallback, role screen, forms, logout, login deep link and account switch');
    assert.deepEqual(errors, [], 'Runtime or navigation errors');
    assert.deepEqual(unexpected, [], 'Unauthorized API requests');
  } catch (error) {
    console.error({ role: startingRole, url: page.url(), body: (await page.locator('body').innerText()).slice(0, 1800), errors, unexpected, requests: calls.slice(-15) });
    throw error;
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const roles = process.env.MINHAVOZ_TEST_ROLE ? [process.env.MINHAVOZ_TEST_ROLE] : Object.keys(menus);
    const results = await Promise.allSettled(roles.map((role) => runRole(browser, role)));
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) throw failures[0].reason;
    // Public screens also work when entered with no browser history.
    const context = await browser.newContext();
    const page = await context.newPage();
    for (const [route, target] of [['login', '/'], ['cadastro', '/'], ['recuperar', '/login']]) {
      await page.goto(base + '/' + route); await page.getByTestId('header-back-button').click(); await page.waitForURL(base + target);
    }
    await context.close();
    console.log('PASS: public routes have explicit exits without history');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
