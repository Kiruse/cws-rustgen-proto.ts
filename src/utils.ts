import type { RustableCallback, RustableContext, Rustify } from './types';
import { resolveType, TypeArg } from './typesys';

export const block = (nodes: Rustify[], sep = ''): RustableCallback =>
  ({ nl, descendant }: RustableContext) => {
    if (!nodes.length) return '{}';
    const nl2 = descendant.nl;
    return `{${nl2}` +
      nodes.map(node => rustify(node, descendant)).join(sep + nl2) +
      `${nl}}`;
  };

export const mod = (name: string, nodes: Rustify[]): RustableCallback =>
  (ctx) => `mod ${name} ${block(nodes)(ctx)}`;

export const dict = (map: [string, Rustify][] | Record<string, Rustify>): RustableCallback =>
  (ctx) => {
    const entries = Array.isArray(map) ? map : Object.entries(map);
    return block(entries.map(([key, value]) =>
      `${key}: ${rustify(value, ctx)},`
    ))(ctx)
  };

export interface FnOpts {
  name: string;
  pub?: boolean;
  args?: [string, TypeArg][];
  ret?: TypeArg;
  body: Rustify[];
}

export function fn({
  name,
  pub = false,
  args = [],
  ret,
  body: nodes,
}: FnOpts): RustableCallback {
  return ctx => {
    let result = '';
    if (pub) result += 'pub ';
    
    let { descendant } = ctx;
    result += `fn ${name}(\n${descendant.indent}`;
    result += args.map(([arg, type]) => `${arg}: ${resolveType(type, descendant)}`).join(`,\n${descendant.indent}`);
    result += `\n${ctx.indent})`;
    
    if (ret) result += ` -> ${resolveType(ret, ctx)}`;
    result += ' ' + block(nodes, ';')(ctx);
    
    return result;
  }
}

export function rustify(node: Rustify, ctx: RustableContext): string {
  switch (typeof node) {
    case 'string': return node;
    case 'function': return node(ctx);
    default: return node.toRust(ctx);
  }
}

export function rustifyMacros(macros: string[], ctx: RustableContext): string {
  if (!macros.length) return '';
  return '#[' + macros.join(', ') + ']' + ctx.nl;
}

export const pascalcase = (str: string) => str[0].toUpperCase() + str.slice(1).replace(/_./g, s => s[1].toUpperCase());
export const snakecase = (str: string) => str.replace(/[a-z][A-Z]/g, s => s[0] + '_' + s[1].toLowerCase());
