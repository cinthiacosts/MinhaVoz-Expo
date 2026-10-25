import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function load(file, dependencies) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require(name) {
    if (name === 'react/jsx-runtime') return jsx;
    if (!(name in dependencies)) throw new Error('Unexpected dependency ' + name);
    return dependencies[name];
  } });
  return exports;
}
const theme = load('../src/theme.ts', {
  react: { useMemo: (f) => f() },
  'react-native': { Appearance: { setColorScheme() {} }, StyleSheet: { create: (s) => s }, useColorScheme: () => 'light' },
});
const colors = theme.themes.light;
function contrast(a, b) {
  const l = (hex) => hex.match(/\w\w/g).map((v) => parseInt(v, 16) / 255)
    .map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const [x, y] = [l(a.slice(1)), l(b.slice(1))].sort((a, b) => b - a);
  return (x + .05) / (y + .05);
}

test('institutional text pairs and gradient stops meet AA normal-text contrast', () => {
  for (const bg of ['surface', 'surfaceSecondary', 'surfaceTertiary', 'surfaceInverse', 'brand', 'brandPrimary', 'brandSecondary', 'brandTertiary', 'success', 'error', 'warning', 'info', 'selected']) {
    const fg = colors['on' + bg[0].toUpperCase() + bg.slice(1)];
    assert.ok(contrast(colors[bg], fg) >= 4.5, bg);
  }
  for (const surface of ['surface', 'surfaceSecondary', 'surfaceTertiary']) {
    for (const text of ['muted', 'brandPrimary', 'brandSecondary']) assert.ok(contrast(colors[surface], colors[text]) >= 4.5, surface + '/' + text);
    for (const border of ['focusBorder', 'borderStrong']) assert.ok(contrast(colors[surface], colors[border]) >= 3, surface + '/' + border);
  }
  for (const stop of theme.brandGradient) assert.ok(contrast(stop, colors.onBrandPrimary) >= 4.5);
  for (const category of theme.CATEGORY_COLORS) assert.ok(contrast(colors[category], colors.onCategory) >= 4.5, 'CAA label ' + category);
});

test('CAA category colors, favorites and success/error/warning colors remain unchanged', () => {
  const expected = { categoryPeople: '#F4C044', categoryActions: '#65966B', categoryNouns: '#E06D53',
    categoryFeelings: '#C96480', categoryPlaces: '#F28F79', categoryNeeds: '#D9534F',
    categoryActivities: '#D98E32', categorySchool: '#3F8A8C', favorite: '#F4C044',
    success: '#3F6E4D', onSuccess: '#FFFFFF', error: '#C2413C', onError: '#FFFFFF',
    warning: '#F4C044', onWarning: '#1A1A1A' };
  for (const [token, value] of Object.entries(expected)) assert.equal(colors[token], value, token);
  assert.equal(theme.CATEGORY_COLORS.length, 8);
  assert.equal(theme.catColor(colors, 'categoryPeople'), expected.categoryPeople);
  assert.notEqual(colors.brandTertiary, colors.favorite);
});

test('Welcome reuses its approved palette without local institutional color literals', () => {
  const source = fs.readFileSync(new URL('../app/index.tsx', import.meta.url), 'utf8');
  assert.match(source, /brandPalette as color/);
  assert.match(source, /brandGradient as entryGradient/);
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(source));
});

test('focus recoloring preserves input props and forwards focus/blur callbacks; errors stay red', () => {
  let focused = false, focusEvents = 0, blurEvents = 0;
  const react = { useState: () => [focused, (v) => { focused = v; }] };
  const ui = load('../src/ui.tsx', {
    react, '@react-native-vector-icons/ionicons': { Ionicons: 'icon' }, 'expo-image': { Image: 'image' },
    'expo-haptics': {}, 'react-native': { Text: 'text', View: 'view', TextInput: 'input' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/src/api': { fileUrl: (v) => v }, '@/src/theme': theme,
  });
  const onChangeText = () => {};
  const props = { label: 'Campo', testID: 'field', value: 'texto preservado', onChangeText,
    onFocus: () => { focusEvents++; }, onBlur: () => { blurEvents++; } };
  const input = (extra = {}) => ui.Field({ ...props, ...extra }).props.children.find((c) => c?.type === 'input');
  const first = input();
  first.props.onFocus({});
  assert.equal(focused, true); assert.equal(focusEvents, 1);
  const active = input();
  assert.ok(active.props.style.some((s) => s?.borderColor === colors.focusBorder));
  assert.equal(active.props.value, props.value); assert.equal(active.props.onChangeText, onChangeText);
  const invalid = input({ error: 'Erro' });
  assert.equal(invalid.props.style.filter(Boolean).at(-1).borderColor, colors.error);
  active.props.onBlur({});
  assert.equal(focused, false); assert.equal(blurEvents, 1);
});
