// This challenge prevents accidental exits; it is not account authentication.
export function createExitChallenge(random: () => number = Math.random) {
  const a = 3 + Math.floor(random() * 6);
  const b = 2 + Math.floor(random() * 6);
  const ans = a + b;
  const opts = [ans, ans - 1, ans + 1, ans + 2];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return { a, b, ans, opts };
}
