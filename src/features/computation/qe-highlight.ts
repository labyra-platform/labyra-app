/**
 * Minimal syntax highlighter for a Quantum ESPRESSO input file (Fortran namelist
 * format). No dependency — a per-line tokenizer emits escaped `<span>`s with
 * `qe-*` classes styled in globals.css. Handles namelist headers (&CONTROL),
 * card headers (ATOMIC_SPECIES), keys, strings, numbers, .true./.false., the
 * closing `/`, and `!` comments (respecting single-quoted strings).
 *
 * @phase R337 — input preview syntax highlight
 */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function span(cls: string, s: string): string {
  return `<span class="${cls}">${esc(s)}</span>`;
}

// Order matters: namelist header, string, boolean, number, identifier, then a
// catch-all so every character is emitted (and thus escaped).
const TOKEN =
  /(&[A-Za-z_]+)|('[^']*')|(\.(?:true|false|t|f)\.)|(-?\d+(?:\.\d*)?(?:[eEdD][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_()%]*)|(\s+)|([\s\S])/g;

function highlightCode(code: string): string {
  let out = '';
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(code)) !== null) {
    const [, namelist, str, bool, num, ident, ws, other] = m;
    if (namelist !== undefined) out += span('qe-namelist', namelist);
    else if (str !== undefined) out += span('qe-string', str);
    else if (bool !== undefined) out += span('qe-const', bool);
    else if (num !== undefined) out += span('qe-number', num);
    else if (ident !== undefined) {
      // ALL-CAPS (≥2) → card header / keyword; otherwise a key/parameter name.
      out += /^[A-Z][A-Z0-9_]+$/.test(ident) ? span('qe-card', ident) : span('qe-key', ident);
    } else if (ws !== undefined) out += ws;
    else if (other !== undefined) {
      out += other === '/' ? span('qe-punct', other) : esc(other);
    }
  }
  return out;
}

export function highlightQeInput(src: string): string {
  return src
    .split('\n')
    .map((line) => {
      // Find the first '!' that is not inside a single-quoted string → comment.
      let inStr = false;
      let commentIdx = -1;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === "'") inStr = !inStr;
        else if (c === '!' && !inStr) {
          commentIdx = i;
          break;
        }
      }
      const code = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
      const comment = commentIdx >= 0 ? line.slice(commentIdx) : '';
      return highlightCode(code) + (comment ? span('qe-comment', comment) : '');
    })
    .join('\n');
}
