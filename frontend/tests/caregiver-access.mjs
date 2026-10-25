import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

function load(path, dependencies = {}) {
  const output = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require(name) {
    if (name === 'react/jsx-runtime') return jsx;
    if (!(name in dependencies)) throw new Error('Unexpected module: ' + name);
    return dependencies[name];
  } });
  return exports;
}
const policy = load('../src/hub-policy.ts');
const profile = (id, role) => ({ id, my_role: role, name: 'Pessoa ' + id, settings: {} });
const primitive = (tag) => ({ children, testID, accessibilityLabel }) => React.createElement(tag,
  { 'data-testid': testID, 'aria-label': accessibilityLabel }, children);
const ui = {
  Loading: () => React.createElement('div', null, 'Validando vínculo'),
  AppHeader: ({ title, subtitle, right }) => React.createElement('header', null, title, subtitle, right),
  BigButton: ({ label, testID }) => React.createElement('button', { 'data-testid': testID }, label),
  PictoVisual: () => null,
};

function renderHub(role, hasSharedContent = false) {
  const Hub = load('../app/usuario/[id]/index.tsx', {
    'expo-router': { useLocalSearchParams: () => ({ id: 'test-communicator' }), useRouter: () => ({ push() {}, back() {} }) },
    '@react-native-vector-icons/ionicons': { Ionicons: () => null },
    'react-native': { Pressable: primitive('button'), ScrollView: primitive('div'), Text: primitive('span'), View: primitive('div') },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@/src/hub-policy': policy,
    '@/src/profile-access': { useProfileAccessContext: () => ({ profile: profile('test-communicator', role), hasSharedContent }) },
    '@/src/types': { ROLE_LABEL: { cuidador: 'Cuidador', responsavel: 'Responsável', professor: 'Professor', terapeuta: 'Terapeuta' } },
    '@/src/theme': { fonts: {}, spacing: { lg: 16 }, radius: {}, makeStyles: () => () => ({}), useTheme: () => ({ colors: {} }) },
    '@/src/ui': ui,
    '@/src/navigation-ui': { PendingScreen: ui.Loading },
  }).default;
  return renderToStaticMarkup(React.createElement(Hub));
}

test('rendered caregiver hub has no administrative controls, including accessibility labels', () => {
  const html = renderHub('cuidador');
  for (const id of ['hub-open-comm-button', 'hub-item-cuidado', 'hub-item-rede']) assert.ok(html.includes(id));
  for (const key of ['prancha', 'pictograma', 'historico', 'indicadores', 'configuracoes', 'atividades', 'rotinas', 'frases', 'escolar', 'acompanhamento'])
    assert.ok(!html.includes('hub-item-' + key), key);
  assert.ok(html.includes('Meu vínculo'));
  assert.ok(!html.includes('Rede de apoio'));
  assert.ok(!html.includes('hub-edit-user-button'));
  assert.ok(renderHub('responsavel').includes('hub-item-pictograma'));
});

test('shared follow-up is rendered only when backend returned an authorized excerpt', () => {
  assert.ok(!renderHub('cuidador', false).includes('hub-item-acompanhamento'));
  assert.ok(renderHub('cuidador', true).includes('hub-item-acompanhamento'));
});

test('menu uses each profile link and fails closed for mismatched or unknown links', () => {
  assert.deepEqual(Array.from(policy.hubKeys(profile('a', 'cuidador'), 'a', false)), ['cuidado', 'rede']);
  assert.ok(policy.hubKeys(profile('b', 'responsavel'), 'b', false).includes('pictograma'));
  assert.equal(policy.hubKeys(profile('a', 'responsavel'), 'b', true).length, 0);
  assert.equal(policy.hubKeys(profile('a', 'unknown'), 'a', true).length, 0);
});

function renderRoute(route, access, failed = false) {
  const Layout = load('../app/usuario/[id]/_layout.tsx', {
    'expo-router': {
      Navigator: ({ children }) => children,
      useLocalSearchParams: () => ({ id: 'test-communicator' }), usePathname: () => '/usuario/test-communicator/' + route,
      useSegments: () => ['usuario', '[id]', ...(route ? route.split('/') : [])],
      Redirect: ({ href }) => React.createElement('div', { 'data-redirect': href }),
      Slot: () => React.createElement('button', null, 'PROHIBITED_CHILD_MOUNTED'),
    },
    '@/src/hub-policy': policy,
    '@/src/profile-access': { ProfileAccessContext: React.createContext(null), useVerifiedProfile: () => ({ access, failed }) },
    '@/src/ui': ui,
    '@/src/navigation-ui': { PendingScreen: ui.Loading },
  }).default;
  return renderToStaticMarkup(React.createElement(Layout));
}

test('direct caregiver URLs redirect before any administrative child can render', () => {
  const access = { profile: profile('test-communicator', 'cuidador'), hasSharedContent: false };
  for (const route of ['prancha', 'pictograma', 'historico', 'indicadores', 'configuracoes', 'atividades', 'rotinas', 'frases', 'escolar', 'acompanhamento', 'future-admin']) {
    const html = renderRoute(route, access);
    assert.ok(html.includes('data-redirect="/usuario/test-communicator/cuidado"'), route);
    assert.ok(!html.includes('PROHIBITED_CHILD_MOUNTED'), route);
  }
  for (const route of ['', 'cuidado', 'rede']) assert.ok(renderRoute(route, access).includes('PROHIBITED_CHILD_MOUNTED'));
  assert.ok(renderRoute('acompanhamento', { ...access, hasSharedContent: true }).includes('PROHIBITED_CHILD_MOUNTED'));
  assert.ok(!renderRoute('pictograma', null).includes('PROHIBITED_CHILD_MOUNTED'));
  assert.ok(renderRoute('pictograma', null, true).includes('data-redirect="/painel"'));
  assert.ok(renderRoute('pictograma', { profile: profile('test-communicator', 'responsavel'), hasSharedContent: false }).includes('PROHIBITED_CHILD_MOUNTED'));
});

// Exercise the actual hook with deterministic focus, state and deferred HTTP.
function hookHarness() {
  let user = { id: 'test-caregiver-account', role: 'responsavel' }, token = 'session-a';
  let cursor = 0, memoFocus, nextFocus, cleanup;
  const slots = [], requests = [];
  const hooks = {
    createContext: React.createContext, useContext: React.useContext,
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((d, n) => d !== slots[i].deps[n])) slots[i] = { deps, fn };
      return slots[i].fn;
    },
  };
  const { useVerifiedProfile } = load('../src/profile-access.tsx', {
    react: hooks, 'expo-router': { useFocusEffect: (fn) => { nextFocus = fn; } },
    '@/src/auth': { useAuth: () => ({ user }) }, '@/src/hub-policy': policy,
    '@/src/api': { getToken: () => token, api: (path) => new Promise((resolve, reject) => requests.push({ path, resolve, reject })) },
  });
  return {
    requests,
    session(u, t) { user = u; token = t; },
    render(id, route = '') {
      cursor = 0;
      const result = useVerifiedProfile(id, route);
      if (nextFocus !== memoFocus) { cleanup?.(); memoFocus = nextFocus; cleanup = memoFocus(); }
      return result;
    },
    blur() { cleanup?.(); memoFocus = undefined; },
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('actual role loader ignores global account role and scopes links to each person', async () => {
  const h = hookHarness();
  assert.equal(h.render('test-communicator').access, null);
  h.requests[0].resolve(profile('test-communicator', 'cuidador')); await tick();
  h.requests[1].resolve([]); await tick();
  assert.equal(h.render('test-communicator').access.profile.my_role, 'cuidador');
  assert.equal(h.render('other').access, null);
  h.requests[2].resolve(profile('other', 'responsavel')); await tick();
  assert.equal(h.render('other').access.profile.my_role, 'responsavel');
  assert.equal(h.render('test-communicator').access, null);
  h.requests[3].resolve(profile('test-communicator', 'cuidador')); await tick();
  h.requests[4].resolve([{ text: 'authorized excerpt' }]); await tick();
  assert.equal(h.render('test-communicator').access.hasSharedContent, true);
});

test('late owner responses and old sessions cannot populate a caregiver screen', async () => {
  const h = hookHarness();
  h.render('test-communicator', 'pictograma');
  h.session({ id: 'different-account', role: 'cuidador' }, 'session-b');
  assert.equal(h.render('test-communicator', 'pictograma').access, null);
  h.requests[1].resolve(profile('test-communicator', 'cuidador')); await tick();
  h.requests[2].resolve([]); await tick();
  h.requests[0].resolve(profile('test-communicator', 'responsavel')); await tick();
  const result = h.render('test-communicator', 'pictograma');
  assert.equal(result.access.profile.my_role, 'cuidador');
  assert.equal(policy.caregiverRedirect(result.access.profile, 'test-communicator', 'pictograma', false), '/usuario/test-communicator/cuidado');
  assert.equal(h.render('test-communicator', 'configuracoes').access, null);
  h.requests[3].reject(new Error('403')); await tick();
  assert.equal(h.render('test-communicator', 'configuracoes').failed, true);
});

test('failed sharing check hides follow-up while preserving daily care', async () => {
  const h = hookHarness(); h.render('test-communicator');
  h.requests[0].resolve(profile('test-communicator', 'cuidador')); await tick();
  h.requests[1].reject(new Error('offline')); await tick();
  const { access } = h.render('test-communicator');
  assert.deepEqual(Array.from(policy.hubKeys(access.profile, 'test-communicator', access.hasSharedContent)), ['cuidado', 'rede']);
  h.blur();
  assert.equal(h.render('test-communicator').access, null);
});
