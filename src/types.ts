import type { Contract } from './nodes';
import type { TypeNode } from './typesys';

export type Rustify = string | Rustable | RustableCallback;

export interface Rustable {
  toRust(ctx: RustableContext): string;
}

namespace Rustable {
  export const toRustable = (cb: RustableCallback): Rustable => ({ toRust: cb });
  export const toCallback = (node: Rustable): RustableCallback => node.toRust.bind(node);
}

export type RustableCallback = (ctx: RustableContext) => string;

export interface RustableContextOptions {
  indentText?: string;
  indentLevel?: number;
  frames?: Frame[];
  contract?: Contract;
}
export class RustableContext {
  indentText: string;
  indentLevel: number;
  
  frames: Frame[];
  contract: Contract | null;
  
  constructor(opts: RustableContextOptions = {}) {
    this.indentText = opts.indentText ?? '  ';
    this.indentLevel = opts.indentLevel ?? 0;
    this.frames = opts.frames ?? [];
    this.contract = opts.contract ?? null;
  }
  
  get nl() { return `\n${this.indent}` }
  get indent() { return this.indentText.repeat(this.indentLevel) }
  get descendant() {
    const clone = this.clone();
    clone.indentLevel++;
    return clone;
  }
  
  getVar(name: string) {
    for (let i = this.frames.length - 1; i >= 0; --i) {
      const frame = this.frames[i];
      const value = frame.vars.find(v => v.name === name);
      if (value) return value;
    }
  }
  
  clone(): RustableContext {
    const clone = new RustableContext();
    clone.indentText = this.indentText;
    clone.indentLevel = this.indentLevel;
    clone.frames = this.frames;
    clone.contract = this.contract;
    return clone;
  }
}

export interface Frame {
  vars: Variable[];
}

export interface Variable {
  name: string;
  type: TypeNode;
}
