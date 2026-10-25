import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, URL, URLSearchParams });
  return exports;
}
const policy = load('../src/navigation-policy.ts');
const roles = load('../src/hub-policy.ts');

test('login return destinations preserve internal context and reject external or looping destinations', () => {
  assert.equal(policy.safeReturnTo('/usuario/person/cuidado'), '/usuario/person/cuidado');
  assert.equal(policy.safeReturnTo('/comunicacao/person'), '/comunicacao/person');
  assert.equal(policy.protectedReturnTo('/usuario/form', { id: 'person' }), '/usuario/form?id=person');
  assert.equal(policy.protectedReturnTo('/usuario/person/pictograma', { pid: 'picture', id: 'person' }), '/usuario/person/pictograma?pid=picture');
  for (const path of ['https://example.com', '//example.com', '/\\example.com', '/login', '/perfil', '/recuperar', '/usuario/person/old-admin', '/unknown', null, ['//example.com']])
    assert.equal(policy.safeReturnTo(path), null, String(path));
});

test('each allowed role destination remains accessible and forbidden screens have explicit safe destinations', () => {
  for (const role of Object.keys(roles.HUB_ORDER)) {
    const p = { id: 'person', my_role: role };
    assert.equal(roles.profileRouteRedirect(p, 'person', '', true), null);
    for (const route of roles.HUB_ORDER[role]) assert.equal(roles.profileRouteRedirect(p, 'person', route, true), null, role + ':' + route);
    for (const route of policy.PROFILE_ROUTES) {
      const redirect = roles.profileRouteRedirect(p, 'person', route, true);
      if (redirect) {
        assert.ok(redirect.startsWith('/usuario/person'));
        const target = redirect.split('/')[3] ?? '';
        assert.equal(roles.profileRouteRedirect(p, 'person', target, true), null, 'redirect must not loop');
      }
    }
    assert.equal(roles.profileRouteRedirect(p, 'someone-else', 'rede', true), '/painel');
  }
});

test('app screens never dispatch blind back/goBack/dismiss actions', () => {
  const root = new URL('../app/', import.meta.url);
  for (const entry of fs.readdirSync(root, { recursive: true })) {
    if (!String(entry).endsWith('.tsx')) continue;
    const file = new URL(String(entry).replaceAll('\\', '/'), root);
    const source = ts.createSourceFile(String(file), fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression))
        assert.ok(!['back', 'goBack', 'dismiss', 'dismissAll'].includes(node.expression.name.text), String(entry));
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
});

test('every declared profile screen exists and has an explicit parent or layout', () => {
  const root = new URL('../app/usuario/[id]/', import.meta.url);
  const screens = fs.readdirSync(root).filter((file) => file.endsWith('.tsx') && file !== '_layout.tsx').map((file) => file === 'index.tsx' ? '' : file.replace('.tsx', ''));
  assert.deepEqual([...screens].sort(), [...policy.PROFILE_ROUTES].sort());
  for (const route of screens) {
    const text = fs.readFileSync(new URL((route || 'index') + '.tsx', root), 'utf8');
    assert.ok(text.includes(route ? 'router.replace(`/usuario/${id}`)' : 'router.replace("/painel")'), route);
  }
});
