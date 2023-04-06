import { block, dict, rustify } from '../../utils';
import type { Rustable, RustableContext } from '../../types';
import { TypeNode, unwrapType } from '../../typesys';
import { CWSExprStmt, CWSStmt } from '../stmts';
import type { Struct } from '../structs';

export type CWSScope = CWSExpr | CWSBlock;

export abstract class CWSExpr implements Rustable {
  /** Convert this expression into Rust source code.
   * 
   * **Caution:** This will likely be removed in future as we progress to a more advanced system
   * rather than blatant 1:1 translation.
   */
  abstract toRust(ctx: RustableContext): string;
  /** Get the `TypeNode` resembling the type of the evaluated result */
  abstract getType(ctx: RustableContext): TypeNode;
}

export class CWSIdentifierExpr extends CWSExpr {
  constructor(
    public identifier: string,
  ) {
    super();
    this.identifier = identifier.trim();
  }
  
  toRust(ctx: RustableContext): string {
    return this.identifier;
  }
  
  getType(ctx: RustableContext): TypeNode {
    const path = this.identifier.split('.');
    const root = ctx.getVar(path[0]);
    if (!root) return 'Error: Unknown identifier';
    
    if (path.length > 1) throw Error('not yet implemented');
    return root.type;
  }
}

export class CWSLiteralExpr extends CWSExpr {
  constructor(
    public value: any,
    public type: TypeNode,
  ) {
    super();
  }
  
  toRust(ctx: RustableContext): string {
    if (typeof this.type === 'string') {
      if (['u64', 'u128', 'u256', 'u512'].includes(this.type)) {
        const [_, bits] = this.type.match(/^u(\d+)$/)!;
        return `cosmwasm_std::Uint${bits}::from(${this.value})`;
      }
      else if (['u8', 'u16', 'u32'].includes(this.type)) {
        return `${this.value}${this.type}`;
      }
      else if (this.type === 'bool') {
        return this.value ? 'true' : 'false';
      }
    }
    // fallback: just return raw stringified value
    return this.value + '';
  }
  
  getType(ctx: RustableContext): TypeNode {
    return this.type;
  }
}

export class CWSBinaryExpr extends CWSExpr {
  constructor(
    public op: '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||' | 'is' | 'or' | 'and',
    public lhs: CWSExpr,
    public rhs: CWSExpr,
  ) {
    super();
  }
  
  toRust(ctx: RustableContext): string {
    const op: string = this.op
      // 'or' is an alias for '||', and 'and' is an alias for '&&'
      .replace('or', '||')
      .replace('and', '&&');
    
    const ctx2 = ctx.descendant;
    const ctx3 = ctx2.descendant;
    
    if (['+', '-', '*', '/', '%', '==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(op)) {
      return `(${rustify(this.lhs, ctx3)} ${op} ${rustify(this.rhs, ctx3)})`;
    }
    
    // 'is' operator requires special treatment, as it effectively translates to
    // `if let Some(..) = y { ... } else { ... }`
    // this is hackish & can & will generate some confusing code, but it works
    else if (op === 'is') {
      return `if let ${rustify(this.rhs, ctx2)}(..) = ${rustify(this.lhs, ctx2)} { true } else { false }`;
    }
    
    else throw Error(`Unknown binary operator: ${op}`);
  }
  
  getType(ctx: RustableContext): TypeNode {
    // TODO: type promotion, i.e. u8 + u16 should ensure the lhs is converted to u16 before adding
    if (this.op === 'is') return 'bool';
    
    const ltype = this.lhs.getType(ctx), rtype = this.rhs.getType(ctx);
    
    if (ltype !== rtype)
      throw Error('Currently, both sides of a binary expression must have the same type');
    return ltype;
  }
}

export class CWSUnaryPrefixExpr extends CWSExpr {
  constructor(
    public op: '-' | '+' | '--' | '++' | '!' | 'not',
    public expr: CWSExpr,
  ) {
    super();
  }
  
  toRust(ctx: RustableContext): string {
    const op: string = this.op
      // 'not' is an alias for '!'
      .replace('not', '!');
    
    if (['-', '+', '--', '++', '!'].includes(op)) {
      if (['--', '++'].includes(op) && !(this.expr instanceof CWSIdentifierExpr))
        throw Error('Only identifiers can be used with the -- and ++ operators');
      return `(${op}${rustify(this.expr, ctx.descendant)})`;
    }
    
    else throw Error(`Unknown unary operator: ${op}`);
  }
  
  getType(ctx: RustableContext): TypeNode {
    switch (this.op) {
      case '!':
      case 'not':
        return 'bool';
      case '-':
      case '+':
      case '--':
      case '++':
        return this.expr.getType(ctx);
      default: throw Error(`Unknown unary operator: ${this.op}`);
    }
  }
}

export class CWSUnaryPostfixExpr extends CWSExpr {
  constructor(
    public op: '++' | '--' | '?' | '!',
    public expr: CWSExpr,
  ) {
    super();
  }
  
  toRust(ctx: RustableContext): string {
    const op: string = this.op;
    
    if (['++', '--'].includes(op)) {
      if (!(this.expr instanceof CWSIdentifierExpr))
        throw Error('Only identifiers can be used with the -- and ++ operators');
      return `(${rustify(this.expr, ctx.descendant)}${op})`;
    }
    
    // nullish/some check
    // we assume the evaluated expression was integrated with the cws_runtime library and thus has
    // a trait impl for `cws_nullish()`
    else if (op === '?') {
      return `${rustify(this.expr, ctx.descendant)}.cws_nullish()`;
    }
    
    // smart unwrap
    // we assume the evaluated expression was integrated with the cws_runtime library and thus has
    // a trait impl for `cws_unwrap()`
    else if (op === '!') {
      return `${rustify(this.expr, ctx.descendant)}.cws_unwrap()?`;
    }
    
    else throw Error(`Unknown unary operator: ${op}`);
  }
  
  getType(ctx: RustableContext): TypeNode {
    switch (this.op) {
      case '++':
      case '--':
        return this.expr.getType(ctx);
      case '?':
        return 'bool';
      case '!':
        return unwrapType(this.expr.getType(ctx));
      default: throw Error(`Unknown unary operator: ${this.op}`);
    }
  }
}

export class CWSReadStateExpr extends CWSExpr {
  constructor(
    public name: string,
  ) {
    super();
  }
  
  toRust(ctx: RustableContext) {
    if (!ctx.contract) return 'panic!("Error: state variable outside of contract");';
    return `STATE.load(ctx.deps.storage)?.${this.name}`;
  }
  
  getType(ctx: RustableContext) {
    if (!ctx.contract) return 'Error: state variable outside of contract';
    return ctx.contract!.states[this.name];
  }
}

export class CWSIfExpr extends CWSExpr {
  constructor(
    public branches: [CWSExpr, CWSScope][],
    public elseBranch?: CWSScope,
  ) {
    super();
  }
  
  toRust(ctx: RustableContext): string {
    if (!this.branches.length) throw Error('Empty if expression');
    
    let result = this.branches.map(
      b => `if ${rustify(b[0], ctx.descendant)} ${rustify(b[1], ctx)}`
    ).join(' else ');
    
    if (this.elseBranch) {
      result += ` else ${rustify(this.elseBranch, ctx)}`;
    }
    
    return result;
  }
  
  getType(ctx: RustableContext): TypeNode {
    // TODO: infer common type from all branches
    throw Error('not yet implemented');
  }
  
  protected getScopeType(scope: CWSScope, ctx: RustableContext): TypeNode {
    if (scope instanceof CWSBlock) {
      if (!scope.statements.length) return '()';
      const last = scope.statements[scope.statements.length - 1];
      if (last instanceof CWSExprStmt) {
        return last.expr.getType(ctx);
      } else {
        return '()';
      }
    } else {
      return scope.getType(ctx);
    }
  }
  
  protected rustifyScope(scope: CWSScope, ctx: RustableContext): string {
    if (scope instanceof CWSBlock) {
      return rustify(scope, ctx);
    } else if (scope instanceof CWSExpr) {
      // individual expressions must still be wrapped in a block
      return block([ctx => rustify(scope, ctx)])(ctx);
    } else {
      throw Error('unknown scope type');
    }
  }
}

/** This differs from the `block` function found in utils in that it is more specialized & allows
 * introspection of the block's contents.
 */
export class CWSBlock extends CWSExpr {
  constructor(
    public statements: CWSStmt[],
  ) {
    super();
  }
  
  toRust(ctx: RustableContext) {
    if (!this.statements.length) return '{}';
    const { nl, descendant } = ctx;
    const nl2 = descendant.nl;
    return `{` + nl2 +
      this.statements.map(stmt => stmt.toRust(descendant)).join(`;${nl2}`) + nl +
      '}';
  }
  
  getType(ctx: RustableContext): TypeNode {
    throw Error('not yet implemented');
  }
}

export class CWSStructExpr extends CWSExpr {
  constructor(
    public struct: Struct,
    public fields: Record<string, CWSExpr>,
  ) {
    super();
  }
  
  toRust(ctx: RustableContext) {
    return dict(this.fields)(ctx);
  }
  
  getType(ctx: RustableContext): TypeNode {
    return this.struct;
  }
}
