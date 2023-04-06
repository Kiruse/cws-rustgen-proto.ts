import type { Rustable, RustableContext, Rustify } from '../types';
import { resolveType, TypeArg } from '../typesys/resolve';
import { dict, rustifyMacros } from '../utils';

type FieldMap = Record<string, TypeArg> | ((ctx: RustableContext) => Record<string, TypeArg>);
type FieldList = TypeArg[] | ((ctx: RustableContext) => TypeArg[]);

export class Struct {
  constructor(
    public name: string | undefined,
    public fields: FieldMap,
    public pub = false,
    public macros: string[] = [],
  ) {}
  
  toRust(ctx: RustableContext): string {
    if (!this.name) throw Error('No generated name for struct');
    const { descendant, nl } = ctx;
    const nl2 = descendant.nl;
    
    const pub = this.pub ? 'pub ' : '';
    const fields = typeof this.fields === 'function' ? this.fields(ctx) : this.fields;
    
    return rustifyMacros(this.macros, ctx) +
      pub + `struct ${this.name} ` +
      dict(Object.entries(fields).map(
        ([field, type]) => [field, ctx => resolveType(type, ctx)] as [string, Rustify]
      ))(ctx);
  }
}

export interface EnumArgs {
  name: string;
  variants?: Variant[];
  pub?: boolean;
  macros?: string[];
}
export class Enum {
  name: string;
  variants: Variant[];
  pub: boolean;
  macros: string[];
  
  constructor(args: EnumArgs) {
    this.name = args.name;
    this.variants = args.variants ?? [];
    this.pub = args.pub ?? false;
    this.macros = args.macros ?? [];
    args.variants?.forEach(v => v.parent = this);
  }
  
  toRust(ctx: RustableContext): string {
    const { descendant, nl } = ctx;
    const nl2 = descendant.nl;
    const pub = this.pub ? 'pub ' : '';
    return rustifyMacros(this.macros, ctx) +
      pub + `enum ${this.name} {${nl2}` +
      this.variants.map(
        variant => variant.toRust(descendant) + ','
      ).join(nl2) + nl +
      '}';
  }
}

export abstract class Variant implements Rustable {
  parent: Enum = null as any;
  abstract get name(): string;
  abstract toRust(ctx: RustableContext): string;
  
  get typename() { return this.parent.name + '::' + this.name }
}

export interface TupleVariantArgs {
  name: string;
  fields?: FieldList;
  macros?: string[];
}
export class TupleVariant extends Variant {
  name: string;
  fields: FieldList;
  macros: string[];
  
  constructor(args: TupleVariantArgs) {
    super();
    this.name = args.name;
    this.fields = args.fields ?? [];
    this.macros = args.macros ?? [];
  }
  
  toRust(ctx: RustableContext): string {
    const { descendant, nl } = ctx;
    const nl2 = descendant.nl;
    
    const fields = typeof this.fields === 'function' ? this.fields(ctx) : this.fields;
    const fieldstring = fields.length
      ? '(' + nl2 +
          fields.map(
            field => resolveType(field, descendant) + ',',
          ).join(nl2) + nl +
        ')'
      : '()';
    
    return rustifyMacros(this.macros, ctx) + this.name + fieldstring;
  }
}

export interface MapVariantArgs {
  name: string;
  fields?: FieldMap;
  macros?: string[];
}
export class MapVariant extends Variant {
  name: string;
  fields: FieldMap;
  macros: string[];
  
  constructor(args: MapVariantArgs) {
    super();
    this.name = args.name;
    this.fields = args.fields ?? {};
    this.macros = args.macros ?? [];
  }
  
  toRust(ctx: RustableContext): string {
    const { nl, descendant } = ctx;
    const nl2 = descendant.nl;
    
    const fields = typeof this.fields === 'function' ? this.fields(ctx) : this.fields;
    
    return rustifyMacros(this.macros, ctx) +
      `${this.name} ` + dict(Object.entries(fields).map(
        ([field, type]) => [field, ctx => resolveType(type, ctx)] as [string, Rustify]
      ))(ctx);
  }
}
