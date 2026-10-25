import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, dependencies = {}, globals = {}) {
  const output = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require: (name) => {
    if (!(name in dependencies)) throw new Error('Unexpected module: ' + name);
    return dependencies[name];
  }, setTimeout, clearTimeout, ...globals });
  return exports;
}

test('speech sends all communication text to a local browser voice, never HTTP', async () => {
  const spoken = [];
  const voice = { localService: true, lang: 'pt-BR', voiceURI: 'local-br', name: 'Local' };
  class Utterance { constructor(text) { this.text = text; } }
  const engine = { getVoices: () => [voice], cancel() {}, speak(u) { spoken.push(u); u.onend(); } };
  const speech = load('../src/voice-engine.web.ts', {}, { window: { speechSynthesis: engine }, SpeechSynthesisUtterance: Utterance });
  for (const text of ['Eu', 'Eu quero água.', 'Preciso de ajuda.', 'Abra o livro.', 'Escovar os dentes', 'Texto digitado'])
    await speech.speak(text, { voice: 'coral', speed: .75, volume: .5 });
  assert.equal(spoken.length, 6);
  assert.ok(spoken.every((u) => u.voice === voice && u.rate === .75 && u.volume === .5));
});

test('web refuses cloud-only voices instead of transmitting private text', async () => {
  const speech = load('../src/voice-engine.web.ts', {}, { window: { speechSynthesis: {
    getVoices: () => [{ localService: false, lang: 'pt-BR', voiceURI: 'cloud' }], cancel() {},
    speak() { throw new Error('Cloud speech must not run'); },
  } } });
  await assert.rejects(speech.speak('Privado', { voice: '', speed: 1, volume: 1 }), /voz local/);
});

test('native speech uses the installed voice and cancels previous playback', async () => {
  let stopped = 0; let spoken;
  const speech = load('../src/voice-engine.ts', { 'expo-speech': {
    getAvailableVoicesAsync: async () => [
      { identifier: 'pt-br-network', language: 'pt-BR', name: 'Online' },
      { identifier: 'pt-br-local', language: 'pt-BR', name: 'Offline' },
    ], stop: async () => { stopped++; }, speak: (text, options) => { spoken = { text, options }; options.onDone(); },
  } });
  await speech.speak('Eu quero água.', { voice: 'coral', speed: 1, volume: .75 });
  assert.equal(spoken.options.voice, 'pt-br-local'); assert.equal(stopped, 1);
  assert.equal(spoken.text, 'Eu quero água.');
});

test('exit challenge has one correct option and no infinite retry loop', () => {
  const { createExitChallenge } = load('../src/comm/exit-policy.ts');
  for (const value of [0, .1, .5, .999999]) {
    const q = createExitChallenge(() => value);
    assert.equal(q.ans, q.a + q.b); assert.equal(q.opts.length, 4);
    assert.equal(new Set(q.opts).size, 4); assert.ok(q.opts.every((n) => n > 0));
    assert.equal(q.opts.filter((n) => n === q.ans).length, 1);
  }
});

test('revoked board access never falls back to another account offline data', async () => {
  class ApiError extends Error { constructor(status) { super('denied'); this.status = status; } }
  const values = new Map([['auth_user', JSON.stringify({ id: 'adult-a' })],
    ['private_adult-a_board_v4_profile', JSON.stringify({ comm_user: { name: 'Private' } })]]);
  const storage = { getItem: async (k, fallback) => values.get(k) ?? fallback,
    setItem: async (k, v) => values.set(k, v), removeItem: async (k) => values.delete(k) };
  let status = 0;
  const offline = load('../src/offline.ts', { '@/src/api': { ApiError, api: async () => { throw new ApiError(status); } },
    '@/src/utils/storage': { storage } });
  assert.equal((await offline.loadBoard('profile')).offline, true);
  values.set('auth_user', JSON.stringify({ id: 'adult-b' }));
  await assert.rejects(offline.loadBoard('profile'));
  values.set('auth_user', JSON.stringify({ id: 'adult-a' })); status = 403;
  await assert.rejects(offline.loadBoard('profile'));
  assert.equal(values.has('private_adult-a_board_v4_profile'), false);
});

test('profile navigation gives caregivers only care, excerpts and their own link', () => {
  const { HUB_ORDER } = load('../src/hub-policy.ts');
  assert.deepEqual(Array.from(HUB_ORDER.cuidador), ['cuidado', 'acompanhamento', 'rede']);
  assert.ok(HUB_ORDER.responsavel.includes('configuracoes'));
  assert.ok(HUB_ORDER.professor.includes('escolar'));
  assert.ok(HUB_ORDER.terapeuta.includes('indicadores'));
});

test('old broad board caches cannot be reused after caregiver policy revision', async () => {
  class ApiError extends Error { constructor(status) { super('offline'); this.status = status; } }
  const values = new Map([['auth_user', JSON.stringify({ id: 'adult-a' })],
    ['private_adult-a_board_v3_profile', JSON.stringify({ comm_user: { notes: 'Private' } })]]);
  const storage = { getItem: async (k, fallback) => values.get(k) ?? fallback,
    setItem: async (k, v) => values.set(k, v), removeItem: async (k) => values.delete(k) };
  const offline = load('../src/offline.ts', { '@/src/api': { ApiError, api: async () => { throw new ApiError(0); } },
    '@/src/utils/storage': { storage } });
  await assert.rejects(offline.loadBoard('profile'));
});
