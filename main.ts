// Tiny stack VM, ISA v1. Faithful port of the kit reference vm.mjs:
// every trap, limit and wrapping rule in ISA.md, in the order it states.
// Step order per step: step limit (10), pc outside (9), unknown opcode (5),
// immediate cut off (9), then stack underflow (2) / overflow (3), then the
// instruction's own traps, then its effect. A trap keeps earlier output.
// Run: node main.ts, with MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR, or /input /output.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function run(p: Uint8Array, inp: Uint8Array): { out: Uint8Array; code: number } {
  const n = p.length;
  const D = new Int32Array(256);
  let sp = 0;
  const C = new Int32Array(64);
  let csp = 0;
  const M = new Int32Array(256);
  const out = new Uint8Array(65536);
  let olen = 0;
  let inPos = 0;
  let pc = 0;
  let steps = 0;
  const done = (code: number): { out: Uint8Array; code: number } => ({ out: out.slice(0, olen), code });
  for (;;) {
    if (steps === 1000000) return done(10);
    if (pc < 0 || pc >= n) return done(9);
    const op = p[pc];
    let imm = 0;
    let pops = 0;
    let pushes = 0;
    if (op === 0x00) { imm = 0; pops = 0; pushes = 0; }
    else if (op === 0x01) { imm = 1; pops = 0; pushes = 1; }
    else if (op === 0x02) { imm = 4; pops = 0; pushes = 1; }
    else if (op === 0x03) { imm = 0; pops = 1; pushes = 0; }
    else if (op === 0x04) { imm = 0; pops = 1; pushes = 2; }
    else if (op === 0x05) { imm = 0; pops = 2; pushes = 2; }
    else if (op === 0x06) { imm = 0; pops = 2; pushes = 3; }
    else if (op === 0x07) { imm = 0; pops = 3; pushes = 3; }
    else if (op >= 0x10 && op <= 0x16) { imm = 0; pops = 2; pushes = 1; }
    else if (op === 0x17 || op === 0x1b) { imm = 0; pops = 1; pushes = 1; }
    else if (op >= 0x18 && op <= 0x1e) { imm = 0; pops = 2; pushes = 1; }
    else if (op >= 0x20 && op <= 0x22) { imm = 0; pops = 2; pushes = 1; }
    else if (op === 0x30) { imm = 2; pops = 0; pushes = 0; }
    else if (op === 0x31 || op === 0x32) { imm = 2; pops = 1; pushes = 0; }
    else if (op === 0x33) { imm = 2; pops = 0; pushes = 0; }
    else if (op === 0x34) { imm = 0; pops = 0; pushes = 0; }
    else if (op === 0x40) { imm = 0; pops = 1; pushes = 1; }
    else if (op === 0x41) { imm = 0; pops = 2; pushes = 0; }
    else if (op === 0x50 || op === 0x51 || op === 0x53) { imm = 0; pops = 1; pushes = 0; }
    else if (op === 0x52) { imm = 0; pops = 0; pushes = 1; }
    else return done(5);
    if (pc + imm >= n) return done(9);
    steps++;
    const next = pc + 1 + imm;
    if (sp < pops) return done(2);
    if (sp - pops + pushes > 256) return done(3);
    pc = next;
    if (op === 0x00) return done(0);
    if (op === 0x01) { D[sp++] = (p[next - 1] << 24) >> 24; continue; }
    if (op === 0x02) { D[sp++] = p[next - 4] | (p[next - 3] << 8) | (p[next - 2] << 16) | (p[next - 1] << 24); continue; }
    if (op === 0x03) { sp--; continue; }
    if (op === 0x04) { D[sp] = D[sp - 1]; sp++; continue; }
    if (op === 0x05) { const tmp = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = tmp; continue; }
    if (op === 0x06) { D[sp] = D[sp - 2]; sp++; continue; }
    if (op === 0x07) { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; continue; }
    if (op === 0x17) { D[sp - 1] = -D[sp - 1] | 0; continue; }
    if (op === 0x1b) { D[sp - 1] = ~D[sp - 1]; continue; }
    if (op >= 0x10 && op <= 0x22 && op !== 0x17 && op !== 0x1b) {
      const b = D[sp - 1];
      const a = D[sp - 2];
      let r = 0;
      if (op === 0x10) r = (a + b) | 0;
      else if (op === 0x11) r = (a - b) | 0;
      else if (op === 0x12) r = Math.imul(a, b);
      else if (op === 0x13) { if (b === 0) return done(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; }
      else if (op === 0x14) { if (b === 0) return done(4); r = b === -1 ? 0 : (a % b) | 0; }
      else if (op === 0x15) { if (b === 0) return done(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
      else if (op === 0x16) { if (b === 0) return done(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
      else if (op === 0x18) r = a & b;
      else if (op === 0x19) r = a | b;
      else if (op === 0x1a) r = a ^ b;
      else if (op === 0x1c) r = a << (b & 31);
      else if (op === 0x1d) r = a >> (b & 31);
      else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
      else if (op === 0x20) r = a === b ? 1 : 0;
      else if (op === 0x21) r = a < b ? 1 : 0;
      else if (op === 0x22) r = (a >>> 0) < (b >>> 0) ? 1 : 0;
      sp -= 2;
      D[sp++] = r;
      continue;
    }
    if (op === 0x30 || op === 0x31 || op === 0x32) {
      const rel = ((p[next - 2] | (p[next - 1] << 8)) << 16) >> 16;
      let take = true;
      if (op !== 0x30) { const v = D[--sp]; take = op === 0x31 ? v === 0 : v !== 0; }
      if (take) pc = next + rel;
      continue;
    }
    if (op === 0x33) {
      if (csp === 64) return done(7);
      C[csp++] = next;
      pc = p[next - 2] | (p[next - 1] << 8);
      continue;
    }
    if (op === 0x34) {
      if (csp === 0) return done(8);
      pc = C[--csp];
      continue;
    }
    if (op === 0x40) {
      const addr = D[sp - 1];
      if (addr < 0 || addr >= 256) return done(6);
      D[sp - 1] = M[addr];
      continue;
    }
    if (op === 0x41) {
      const addr = D[sp - 1];
      const v = D[sp - 2];
      if (addr < 0 || addr >= 256) return done(6);
      sp -= 2;
      M[addr] = v;
      continue;
    }
    if (op === 0x50) {
      const s = String(D[sp - 1]);
      if (olen + s.length > 65536) return done(11);
      sp--;
      for (let i = 0; i < s.length; i++) out[olen++] = s.charCodeAt(i);
      continue;
    }
    if (op === 0x51) {
      if (olen + 1 > 65536) return done(11);
      out[olen++] = D[--sp] & 255;
      continue;
    }
    if (op === 0x52) { D[sp++] = inPos < inp.length ? inp[inPos++] : -1; continue; }
    if (op === 0x53) return done(D[--sp] & 255);
    return done(5);
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), `${r.code}\n`);
}
