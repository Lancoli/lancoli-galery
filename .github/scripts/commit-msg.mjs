#!/usr/bin/env node
// Vérifie qu'un message de commit suit la norme (docs/COMMITS.md). Appelé par le hook commit-msg de chaque dépôt.
//   node tools/commit-msg.mjs <fichier du message>     code de sortie 1 si le message est refusé
//   node tools/commit-msg.mjs --texte "feat: …"          pour essayer un message
//   node tools/commit-msg.mjs --preparer <fichier>     hook prepare-commit-msg : ajoute l'emoji du type s'il manque
// Laisse passer les messages produits par git lui-même (merge, revert automatique, fixup/squash).
import { readFileSync, writeFileSync } from 'node:fs';

export const TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];
// emoji du type (gitmoji), placé au début du résumé : « feat(carte): ✨ … » reste du Conventional Commits
export const EMOJI = { feat: '✨', fix: '🐛', docs: '📝', style: '💄', refactor: '♻️', perf: '⚡', test: '✅', build: '📦', ci: '👷', chore: '🔧', revert: '⏪' };
const ENTETE = `^(${TYPES.join('|')})(\\([a-z0-9][a-z0-9-]*\\))?(!)?: (.+)$`;
const RE = new RegExp(ENTETE);
const RE_LIGNE = new RegExp(ENTETE, 'm');
const PICTO = /^\p{Extended_Pictographic}️?\s*/u;

export function verifier(message) {
  const lignes = message.split(/\r?\n/).filter((l) => !l.startsWith('#'));
  const t = lignes[0] || '';
  if (/^(Merge |Revert "|fixup! |squash! |amend! )/.test(t)) return [];
  const e = [];
  const m = t.match(RE);
  if (!m) e.push(`première ligne « ${t.slice(0, 60)} » : attendu « type(portée): résumé », type parmi ${TYPES.join(', ')}`);
  else {
    const r = m[4].replace(PICTO, ''); // l'emoji ne compte pas pour la casse
    if (/^[A-ZÉÈÀ]/.test(r) && !/^[A-Z]{2,}/.test(r)) e.push('le résumé commence par une minuscule (sauf sigle)');
    if (/[.!]$/.test(r)) e.push('pas de point final au résumé');
    if (/^(wip|update|maj|divers|modifs?|changes?)$/i.test(r.trim())) e.push(`résumé trop vague : « ${r} »`);
  }
  if (t.length > 72) e.push(`première ligne trop longue : ${t.length} caractères (72 au plus)`);
  if (lignes.length > 1 && lignes[1].trim() !== '') e.push('une ligne vide entre le résumé et le corps');
  if (/^Ticket #\d+ :/.test(t)) e.push('ancien format : mettre « Ticket: #id » en pied de message');
  // aucune signature d'outil : l'auteur du commit est la personne qui le fait
  if (lignes.some((l) => /co-authored-by:.*(claude|anthropic)|generated with \[?claude|🤖/i.test(l)))
    e.push('signature d’outil interdite (Co-Authored-By Claude, « Generated with Claude Code ») : retirer la ligne');
  return e;
}

// ajoute l'emoji du type au résumé d'un message conforme qui n'en a pas ; ne touche à rien d'autre
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
    console.error('✗ message de commit refusé (norme : docs/COMMITS.md à la racine du portfolio)');
    for (const x of e) console.error('  · ' + x);
    console.error('  exemple : feat(carte): ✨ ajouter l\'itinéraire en transports');
    process.exit(1);
  }
}
