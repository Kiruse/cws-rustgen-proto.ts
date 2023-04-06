import { block, rustify } from '../../utils';
import type { Rustable, RustableContext, Rustify } from '../../types';
import { resolveType, TypeNode } from '../../typesys';
import type { CWSExpr } from '../exprs';

export abstract class CWSStmt implements Rustable {
  abstract toRust(ctx: RustableContext): string;
}

export class CWSLetStmt extends CWSStmt {
  constructor(
    public decls: CWSLetDecl[],
  ) {
    super();
  }
  
  toRust(ctx: RustableContext): string {
    return 'let ' + this.decls.map(
      decl => {
        let result = decl.name;
        if ('type' in decl)
          result += `: ${resolveType(decl.type, ctx.descendant)}`;
        if ('init' in decl)
          result += ` = ${rustify(decl.init, ctx.descendant)}`;
        return result;
      }
    )
  }
}

/** One of many possible `let` declarations, consisting of either name & type, or name & initializer. */
export type CWSLetDecl =
  | {
      name: string;
      type: TypeNode;
    }
  | {
      name: string;
      init: CWSExpr;
    }
  | {
      name: string;
      type: TypeNode;
      init: CWSExpr;
    };

/** A statement which simply consists of an expression. */
export class CWSExprStmt extends CWSStmt {
  constructor(
    public expr: CWSExpr,
  ) {
    super();
  }
  
  toRust(ctx: RustableContext): string {
    return this.expr.toRust(ctx);
  }
}

export class CWSWriteStateStmt extends CWSStmt {
  constructor(
    public name: string,
    public value: CWSExpr,
  ) {
    super();
  }
  
  toRust(ctx: RustableContext): string {
    return 'STATE.update(ctx.deps.storage, |mut state| -> Result<State, ContractError> ' + block([
      `state.${this.name} = ${rustify(this.value, ctx.descendant)};`,
      'Ok(state)',
    ])(ctx) + ')?;';
  }
}

// TODO: throw predefined contract error rather than just generic
export class CWSFailStmt extends CWSStmt {
  constructor(
    public message?: string,
  ) {
    super();
  }
  
  toRust(ctx: RustableContext): string {
    const msg = (this.message ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `return Err(ContractError::Generic("${msg}"))`;
  }
}

export class CWSReturnStmt extends CWSStmt {
  constructor(
    public value?: CWSExpr,
  ) {
    super();
  }
  
  toRust(ctx: RustableContext): string {
    return 'return ' + (this.value ? rustify(this.value, ctx.descendant) : '()');
  }
}
