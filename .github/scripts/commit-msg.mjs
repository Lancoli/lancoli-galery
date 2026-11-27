#!/usr/bin/env node
// Checks that a commit message follows the standard (docs/COMMITS.md). Called by the commit-msg hook of each repository.
//   node tools/commit-msg.mjs <message file>     exit code 1 if the message is rejected
//   node tools/commit-msg.mjs --texte "feat: …"  to test a message
//   node tools/commit-msg.mjs --preparer <file>  prepare-commit-msg hook: adds the type emoji if missing
// Lets through messages produced by git itself (merge, automatic revert, fixup/squash).
import { readFileSync, writeFileSync } from 'node:fs';

export const TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];
// type emoji (gitmoji), placed at the start of the summary: "feat(map): ✨ …" follows Conventional Commits
export const EMOJI = { feat: '✨', fix: '🐛', docs: '📝', style: '💄', refactor: '♻️', perf: '⚡', test: '✅', build: '📦', ci: '👷', chore: '🔧', revert: '⏪' };
const ENTETE = `^(${TYPES.join('|')})(\\([a-z0-9][a-z0-9-]*\\))?(!)?: (.+)$`;
const RE = new RegExp(ENTETE);
const RE_LIGNE = new RegExp(ENTETE, 'm');
const PICTO = /^\p{Extended_Pictographic}️?\s*/u;

export function verifier(message) {
  const lines = message.split(/\r?\n/).filter((l) => !l.startsWith('#'));
  const t = lines[0] || '';
  if (/^(Merge |Revert "|fixup! |squash! |amend! )/.test(t)) return [];
  const e = [];
  const m = t.match(RE);
  if (!m) e.push(`first line "${t.slice(0, 60)}" expected "type(scope): summary", type among ${TYPES.join(', ')}`);
  else {
    const r = m[4].replace(PICTO, ''); // emoji does not count for casing
    if (/^[A-ZÉÈÀ]/.test(r) && !/^[A-Z]{2,}/.test(r)) e.push('summary must start with lowercase (except acronyms)');
    if (/[.!]$/.test(r)) e.push('no period at the end of summary');
    if (/^(wip|update|maj|divers|modifs?|changes?)$/i.test(r.trim())) e.push(`summary too vague: "${r}"`);
  }
  if (t.length > 72) e.push(`first line too long: ${t.length} characters (72 max)`);
  if (lines.length > 1 && lines[1].trim() !== '') e.push('blank line between summary and body');
  if (/^Ticket #\d+ :/.test(t)) e.push('old format: put "Ticket: #id" in message footer');
  // no tool signature: the author of the commit is the person who makes it
  if (lines.some((l) => /co-authored-by:.*(claude|anthropic)|generated with \[?claude|🤖/i.test(l)))
    e.push('tool signature forbidden (Co-Authored-By Claude, "Generated with Claude Code"): remove line');
  return e;
}

// adds the type emoji to the summary of a conforming message that does not have one; touches nothing else
export function preparer(t) {
  return t.replace(RE_LIGNE, (l, ty, po, br, r) => (PICTO.test(r) ? l : `${ty}${po || ''}${br || ''}: ${EMOJI[ty]} ${r}`));
}

const args = process.argv.slice(2);
if (args[0] === '--preparer') {
  const t = readFileSync(args[1], 'utf8');
  const u = preparer(t);
  if (u !== t) writeFileSync(args[1], u);
} else if (args.length) {
  const msg = args[0] === '--texte' ? args.slice(1).join(' ') : readFileSync(args[0], 'utf8');
  const e = verifier(msg);
  if (e.length) {
    console.error('✗ commit message rejected (standard: docs/COMMITS.md at portfolio root)');
    for (const x of e) console.error('  · ' + x);
    console.error('  example: feat(map): ✨ add public transit route');
    process.exit(1);
  }
}
