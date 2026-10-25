// Visual and route verification only. No real account or backend requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.MINHAVOZ_PLAYWRIGHT);
const base = process.env.MINHAVOZ_WEB_URL || 'http://localhost:3000';
const output = path.resolve(__dirname, '../../.local-backups/welcome-visual');

function contrast(a, b) {
  const luminance = (rgb) => rgb.slice(0, 3).map((v) => {
    v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const [x, y] = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (x + .05) / (y + .05);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [], requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/api/**', (route) => {
      requests.push(route.request().url());
      return route.fulfill({ status: 401, json: { detail: 'No real API access in visual verification' } });
    });
    for (const [width, height] of [[280, 640], [320, 568], [360, 640], [390, 844], [430, 932], [667, 375], [768, 1024], [1024, 768], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await page.goto(base + '/');
      await page.getByTestId('welcome-title').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => {
        const root = document.querySelector('[data-testid="welcome-title"]');
        const img = root?.tagName === 'IMG' ? root : root?.querySelector('img');
        return img?.complete && img.naturalWidth > 0;
      });
      await page.screenshot({ path: path.join(output, `welcome-${width}x${height}.png`) });
      const geometry = await page.evaluate(() => {
        const rect = (id) => {
          const el = document.querySelector(`[data-testid="${id}"]`), r = el.getBoundingClientRect();
          return { id, x: r.x, y: r.y, right: r.right, width: r.width, height: r.height, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
        };
        return { viewport: innerWidth, pageWidth: document.documentElement.scrollWidth,
          card: rect('welcome-support-card'), logo: rect('welcome-title'),
          roles: ['responsavel', 'cuidador', 'professor', 'terapeuta'].map((key) => rect('welcome-role-' + key)),
          text: ['welcome-slogan', 'welcome-notice'].map(rect),
          clipped: [...document.querySelectorAll('[data-testid="welcome-screen"] *')].filter((el) => {
            const style = getComputedStyle(el);
            return !el.children.length && el.textContent.trim() && style.fontFamily.includes('Jakarta') &&
              (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2);
          }).map((el) => ({ text: el.textContent, width: el.clientWidth, contentWidth: el.scrollWidth, height: el.clientHeight, contentHeight: el.scrollHeight })) };
      });
      assert.ok(geometry.pageWidth <= width + 1, 'Horizontal page overflow at ' + width);
      assert.ok(geometry.card.width <= 700 + 1, 'Desktop content width must stay readable');
      assert.ok(Math.abs(geometry.logo.width - geometry.logo.height) <= 1, 'Logo proportion must be preserved');
      for (const box of [...geometry.roles, ...geometry.text]) {
        assert.ok(box.x >= -1 && box.right <= width + 1, 'Content outside viewport at ' + width);
        assert.ok(box.scrollWidth <= box.clientWidth + 1, 'Clipped text at ' + width + ': ' + JSON.stringify(box));
      }
      assert.deepEqual(geometry.clipped, [], 'No text clipping at ' + width);
      assert.ok(Math.max(...geometry.roles.map((t) => t.width)) - Math.min(...geometry.roles.map((t) => t.width)) <= 1, 'Inconsistent role cards');
      assert.ok(Math.abs(geometry.roles[0].y - geometry.roles[1].y) <= 1 && Math.abs(geometry.roles[2].y - geometry.roles[3].y) <= 1, 'Grid must have two rows');
      for (const key of ['responsavel', 'cuidador', 'professor', 'terapeuta']) {
        const card = page.getByTestId('welcome-role-' + key);
        assert.notEqual(await card.getAttribute('role'), 'button');
        assert.equal(await card.locator('button, a, [role="button"]').count(), 0, 'Role cards are informational');
      }
      for (const id of ['welcome-login-button', 'welcome-register-button']) {
        const button = page.getByTestId(id);
        await button.scrollIntoViewIfNeeded();
        await button.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const box = await button.boundingBox();
        assert.ok(box.height >= 64 && box.y >= -1 && box.y + box.height <= height + 1, 'Button must remain reachable at ' + width + ': ' + id + ' ' + JSON.stringify(box));
      }
      const samples = await page.evaluate(() => {
        const rgba = (s) => s.match(/[\d.]+/g).map(Number);
        function background(el) {
          if (!el) return [255, 255, 255];
          const color = rgba(getComputedStyle(el).backgroundColor);
          const alpha = color[3] ?? 1, behind = alpha < 1 ? background(el.parentElement) : color;
          return color.slice(0, 3).map((v, i) => v * alpha + behind[i] * (1 - alpha));
        }
        return [...document.querySelectorAll('[data-testid="welcome-screen"] *')].filter((el) => !el.children.length && el.textContent.trim() && getComputedStyle(el).fontFamily.includes('Jakarta')).map((el) => {
          const style = getComputedStyle(el);
          const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && /bold/i.test(style.fontFamily));
          const gradient = el.closest('[data-testid="welcome-login-button"]')?.querySelector('[style*="linear-gradient"]');
          const stops = gradient ? [...getComputedStyle(gradient).backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => rgba(m[0])) : null;
          return { id: el.textContent, text: rgba(style.color), backgrounds: stops ?? [background(el)], minimum: large ? 3 : 4.5 };
        });
      });
      for (const sample of samples) for (const background of sample.backgrounds) assert.ok(contrast(sample.text, background) >= sample.minimum, 'Text contrast: ' + sample.id);
      await page.getByTestId('welcome-screen').evaluate((el) => { el.scrollTop = 0; });
      await page.screenshot({ path: path.join(output, `welcome-${width}x${height}.png`) });
      console.log(`PASS ${width}x${height}: layout, cards, text, reachable buttons and contrast`);
    }
    // Keyboard and existing navigation destinations.
    await page.goto(base + '/');
    await page.getByTestId('welcome-login-button').waitFor();
    for (const key of ['responsavel', 'cuidador', 'professor', 'terapeuta']) {
      await page.getByTestId('welcome-role-' + key).click();
      assert.equal(page.url(), base + '/', 'Informational cards must not select a role or navigate');
    }
    const restingBorder = await page.getByTestId('welcome-login-button').evaluate((el) => getComputedStyle(el).borderColor);
    await page.getByTestId('welcome-login-button').focus();
    await page.waitForFunction((restingBorder) => getComputedStyle(document.querySelector('[data-testid="welcome-login-button"]')).borderColor !== restingBorder, restingBorder);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-testid')), 'welcome-register-button');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-testid')), 'welcome-login-button');
    await page.keyboard.press('Enter'); await page.waitForURL(base + '/login');
    await page.goto(base + '/');
    await page.getByTestId('welcome-register-button').click(); await page.waitForURL(base + '/cadastro');
    assert.deepEqual(requests, [], 'Anonymous welcome must not request account data');
    assert.deepEqual(errors, [], 'No browser runtime errors');
    await context.close();
    // Preserve existing authenticated redirects, with synthetic API responses.
    for (const role of ['cuidador', null]) {
      const ctx = await browser.newContext();
      await ctx.addInitScript(() => localStorage.setItem('auth_token', JSON.stringify('synthetic-token')));
      await ctx.route('**/api/**', (route) => route.fulfill({ json: new URL(route.request().url()).pathname === '/api/auth/me'
        ? { id: 'synthetic-welcome-adult', full_name: 'Teste', username: 'test', email: 'test@example.com', role } : [] }));
      const p = await ctx.newPage(); await p.goto(base + '/');
      await p.waitForURL(base + (role ? '/painel' : '/perfil'));
      await ctx.close();
    }
    console.log('PASS: ENTRAR -> /login; CRIAR CONTA -> /cadastro; keyboard and existing auth redirects preserved');
    console.log('Screenshots: ' + output);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
