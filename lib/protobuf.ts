/**
 * A minimal protobuf wire-format reader — enough to find the text inside a message whose schema we
 * do not have.
 *
 * Antigravity (the Gemini CLI and IDE) stores each conversation as a SQLite database whose steps
 * hold protobuf blobs, and ships no .proto for them. The wire format is still self-describing
 * enough to walk: every field carries its number and one of four wire types, so the tree can be
 * recovered even though the names cannot. Fields are therefore addressed by number — "19.2" is
 * field 2 inside field 19 — which is what lib/antigravity-session.ts reads.
 *
 * The one ambiguity that matters: a length-delimited field is either a nested message, a string or
 * raw bytes, and nothing in the encoding says which. Guessing goes wrong in both directions — "hi"
 * is a well-formed varint field, while a nested message's own bytes are often perfectly printable
 * (a length byte of 10 or 13 is a newline). So this does not guess: when a field reads as both, it
 * is recorded as both, under the same field number. Addressing an exact path then picks the
 * interpretation that was meant, and the wrong one sits unreferenced under a path nobody asks for.
 */

/** One decoded field: a nested message, a string, or a number we do not care about. */
type Node = { field: number; msg?: Node[]; s?: string };

/**
 * Read one varint, returning its value and the offset after it (-1 when the buffer runs out).
 *
 * Plain numbers rather than BigInt: the only values actually used are field tags and byte lengths,
 * both far below 2^53. Multiplying by a power of two rather than shifting keeps that true past 31
 * bits, where `<<` would wrap. A 64-bit field's value can therefore lose precision, which is fine
 * — those are skipped, never read.
 */
function varint(buf: Uint8Array, i: number): [number, number] {
  let result = 0;
  let scale = 1;
  while (i < buf.length) {
    const b = buf[i++];
    result += (b & 0x7f) * scale;
    if (!(b & 0x80)) return [result, i];
    scale *= 128;
    if (scale > Number.MAX_SAFE_INTEGER) return [0, -1];
  }
  return [0, -1];
}

/** Text that a human wrote, rather than bytes that happen to be printable. */
function looksLikeText(buf: Uint8Array): boolean {
  if (!buf.length) return false;
  const s = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  if (s.includes("�")) return false; // not valid UTF-8
  // Control characters other than tab/newline/carriage return mean this is structure, not prose.
  return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s);
}

function decode(buf: Uint8Array, depth: number): Node[] | null {
  const out: Node[] = [];
  let i = 0;
  while (i < buf.length) {
    const [tag, afterTag] = varint(buf, i);
    if (afterTag < 0) return null;
    i = afterTag;
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (field === 0) return null;
    if (wire === 0) {
      const [, n] = varint(buf, i);
      if (n < 0) return null;
      i = n;
    } else if (wire === 1) {
      if (i + 8 > buf.length) return null;
      i += 8;
    } else if (wire === 5) {
      if (i + 4 > buf.length) return null;
      i += 4;
    } else if (wire === 2) {
      const [len, n] = varint(buf, i);
      if (n < 0) return null;
      i = n;
      const end = i + len;
      if (end > buf.length) return null;
      const sub = buf.subarray(i, end);
      i = end;
      // Record both readings rather than choosing between them (see the note at the top).
      const asText = looksLikeText(sub);
      if (asText) out.push({ field, s: new TextDecoder().decode(sub) });
      const nested = depth < 16 ? decode(sub, depth + 1) : null;
      if (nested?.length) out.push({ field, msg: nested });
      else if (!asText) out.push({ field, s: new TextDecoder("utf-8", { fatal: false }).decode(sub) });
    } else {
      return null; // wire types 3 and 4 are deprecated groups; treat as undecodable
    }
  }
  return out;
}

/**
 * Every string in the message, keyed by its dotted field path ("19.2"). A path can repeat, so the
 * values are arrays in the order they appeared.
 */
export function protoStrings(payload: Uint8Array): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const walk = (nodes: Node[], path: number[]) => {
    for (const n of nodes) {
      const here = [...path, n.field];
      if (n.msg) walk(n.msg, here);
      else if (typeof n.s === "string") {
        const key = here.join(".");
        const list = found.get(key);
        if (list) list.push(n.s);
        else found.set(key, [n.s]);
      }
    }
  };
  walk(decode(payload, 0) ?? [], []);
  return found;
}

/** The first non-empty string at any of these paths, in order of preference. */
export function firstAtPath(strings: Map<string, string[]>, paths: readonly string[]): string {
  for (const path of paths) {
    for (const value of strings.get(path) ?? []) {
      if (value.trim()) return value;
    }
  }
  return "";
}
