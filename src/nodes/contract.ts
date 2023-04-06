import { Rustify, RustableContext, RustableCallback } from '../types';
import { resolveType, TypeArg } from '../typesys/resolve';
import type { TypeNode } from '../typesys/typenode';
import { block, dict, fn, mod, pascalcase } from '../utils';
import type { CWSStmt } from './stmts/cws-stmts';
import { Enum, MapVariant, Struct, TupleVariant, Variant } from './structs';

export class Contract {
  states: Record<string, TypeNode> = {};
  errors: Record<string, ErrorNode> = {};
  instantiate: FnNode[] = [];
  queries: Record<string, FnNode> = {};
  executions: Record<string, FnNode> = {};
  
  constructor(
    public name: string,
  ) {}

  toRust(ctx: RustableContext): string {
    return mod(this.name, [
      this._generateStateMod(),
      this._generateErrorMod(),
      this._generateMsgMod(),
      this._generateContractMod(),
    ])(ctx);
  }
  
  protected _generateStateMod(): RustableCallback {
    return mod('state', [
      'use cosmwasm_std::*;',
      'use cw_storage_plus::Item;',
      new Struct('State', ctx => Object.fromEntries(Object.entries(this.states).map(
        ([name, type]) => [name, resolveType(type, ctx)],
      )), true),
    ]);
  }
  
  protected _generateErrorMod(): RustableCallback {
    return mod('errors', [
      'use cosmwasm_std::StdError;',
      'use cws_runtime::CWSRuntimeError;',
      'use thiserror::Error;',
      new Enum({
        name: 'ContractError',
        variants: [
          new TupleVariant({
            name: 'StdError',
            fields: ['#[from] cosmwasm_std::StdError'],
            macros: ['error("{0}")'],
          }),
          new TupleVariant({
            name: 'CWSRuntimeError',
            fields: ['#[from] cws_runtime::CWSRuntimeError'],
            macros: ['error("{0}")'],
          }),
          new TupleVariant({
            name: 'GenericError',
            fields: ['String'],
            macros: [`error("${this.name} contract error: {0}")`],
          }),
          ...Object.values(this.errors).map(n => n.toEnumVariant()),
        ],
        pub: true,
        macros: ['derive(Error, Debug)'],
      }),
    ]);
  }
  
  protected _generateMsgMod(): RustableCallback {
    return mod('msg', [
      'use cosmwasm_schema::{cw_serde, QueryResponses};',
      this._generateInstantiateMsg(),
      this._generateExecuteMsg(),
      this._generateQueryMsg(),
      ...this._generateQueryResponses(),
    ]);
  }
  
  protected _generateInstantiateMsg(): Struct | Enum {
    switch (this.instantiate.length) {
      case 0:
        return new Struct('InstantiateMsg', {}, true, ['cw_serde']);
      case 1:
        return new Struct('InstantiateMsg', ctx => getMessageFromFunction(this.instantiate[0], ctx), true, ['cw_serde']);
      default:
        return new Enum({
          name: 'InstantiateMsg',
          variants: this.instantiate.map((fn, i) => new MapVariant({
            name: 'variant' + (i + 1),
            fields: ctx => getMessageFromFunction(fn, ctx),
          })),
          pub: true,
          macros: ['cw_serde'],
        });
    }
  }
  
  protected _generateExecuteMsg(): Enum {
    return new Enum({
      name: 'ExecuteMsg',
      variants: Object.values(this.executions).map(fn => new MapVariant({
        name: pascalcase(fn.name),
        fields: ctx => getMessageFromFunction(fn, ctx),
      })),
      pub: true,
      macros: ['cw_serde'],
    });
  }
  
  protected _generateQueryMsg(): Enum {
    return new Enum({
      name: 'QueryMsg',
      variants: Object.values(this.queries).map(fn => new MapVariant({
        name: pascalcase(fn.name),
        fields: ctx => getMessageFromFunction(fn, ctx),
      })),
      pub: true,
      macros: ['cw_serde', 'derive(QueryResponses)'],
    })
  }
  
  protected _generateQueryResponses(): (Struct | Enum)[] {
    // TODO: since it's tough to determine if a struct is only used for query responses we should
    // probably separate this out into its own submodule - otherwise we'd probably end up with
    // duplicate structs which probably doesn't work well with Rust
    const responses: (Struct | Enum)[] = [];
    Object.values(this.queries).forEach(({ ret }) => {
      if (!ret) throw Error('Query function must return a value');
      if (ret instanceof Struct || ret instanceof Enum) {
        responses.push(ret);
      }
    });
    return responses;
  }
  
  protected _generateContractMod(): RustableCallback {
    return mod('contract', [
      'use cosmwasm_std::{Binary, Deps, DepsMut, entry_point, Env, from_binary, MessageInfo, Response, StdResult, to_binary};',
      'use cw2::set_contract_version;',
      'use cwscript_runtime::{CWSContext, CWSQueryContext};', // TODO: write & publish this crate
      'use super::state::*;',
      'use super::errors::ContractError;',
      'use super::msg::{InstantiateMsg, ExecuteMsg, QueryMsg};',
      
      // instantiate dispatcher
      '#[cfg_attr(not(feature = "library"), entry_point)]',
      fn({
        name: 'instantiate',
        args: [
          ['deps', 'DepsMut'],
          ['env', 'Env'],
          ['info', 'MessageInfo'],
          ['msg', 'InstantiateMsg'],
        ],
        ret: 'Result<Response, ContractError>',
        body: [
          // NOTE: this moves deps into ctx
          'let ctx = CWSContext::new(deps, env.clone(), info.clone())',
          // TODO: get version from CWS script
          `set_contract_version(ctx.deps.storage, "crates.io:${this.name}", "0.1.0")?`,
          // TODO
          ...this._generateInstantiateBody(),
        ],
      }),
      
      // execute dispatcher
      '#[cfg_attr(not(feature = "library"), entry_point)]',
      fn({
        name: 'execute',
        args: [
          ['deps', 'DepsMut'],
          ['env', 'Env'],
          ['info', 'MessageInfo'],
          ['msg', 'ExecuteMsg'],
        ],
        ret: 'Result<Response, ContractError>',
        body: [
          'let ctx = CWSContext::new(deps, env.clone(), info.clone())',
          ctx => 'match msg ' + block(Object.values(this.executions).map(
            fn => `ExecuteMsg::${pascalcase(fn.name)} {..} => exec::${fn.name}(&ctx, msg)?`,
          ), ',')(ctx),
        ],
      }),
      
      // query dispatcher
      fn({
        name: 'query',
        args: [
          ['deps', 'Deps'],
          ['env', 'Env'],
          ['msg', 'QueryMsg'],
        ],
        ret: 'StdResult<Binary>',
        body: [
          'let ctx = CWSQueryContext::new(deps, env.clone())',
          ctx => 'match msg ' + block(Object.values(this.queries).map(
            fn => `QueryMsg::${pascalcase(fn.name)} {..} => Ok(to_binary(qry::${fn.name}(&ctx, msg))?)`,
          ), ',')(ctx),
        ],
      }),
      
      this._generateExecuteMod(),
      this._generateQueryMod(),
    ]);
  }
  
  protected _generateExecuteMod(): RustableCallback {
    return mod('exec', [
      'use super::super::msg::ExecuteMsg;',
      ...Object.values(this.executions).map(
        data => fn({
          name: data.name,
          args: [
            ['ctx', '&CWSContext'],
            ['msg', 'ExecuteMsg'],
          ],
          ret: 'Result<Response, ContractError>',
          body: wrapMessageHandlerBody(data),
        }),
      ),
    ]);
  }
  
  protected _generateQueryMod(): RustableCallback {
    return mod('qry', [
      'use super::super::msg::*;',
      ...Object.values(this.queries).map(
        data => {
          const { name, ret } = data;
          if (!ret) throw Error('Queries must return a value');
          return fn({
            name,
            args: [
              ['ctx', '&CWSQueryContext'],
              ['msg', 'QueryMsg'],
            ],
            ret: ctx => `Result<${resolveType(ret, ctx)}, ContractError>`,
            body: wrapMessageHandlerBody(data),
          });
        },
      ),
    ]);
  }
  
  protected _generateInstantiateBody(): Rustify[] {
    if (this.instantiate.length === 0)
      return [];
    if (this.instantiate.length === 1)
      return this.instantiate[0].body;
    throw Error('not yet implemented');
  }
}

export class ErrorNode {
  // TODO: how do errors in CWS look like? are they always struct enums in rust?
  constructor(
    public name: string,
    public args: Record<string, TypeNode>,
  ) {}
  
  toEnumVariant(): Variant {
    return new MapVariant({
      name: this.name,
      fields: this.args,
      macros: [`error("${this.name}")`],
    });
  }
}

export interface FnNodeParams {
  kind: FnNode['kind'];
  name: FnNode['name'];
  args?: FnNode['args'];
  ret?: FnNode['ret'];
  body?: FnNode['body'];
}
export class FnNode {
  kind: 'instantiate' | 'query' | 'execution' | 'method';
  name: string;
  args: [string, TypeArg][];
  ret: TypeArg | undefined;
  body: CWSStmt[];
  
  constructor({ kind, name, args, ret, body }: FnNodeParams) {
    this.kind = kind;
    this.name = name;
    this.args = args ?? [];
    this.ret  = ret;
    this.body = body ?? [];
  }
}

function getMessageFromFunction(fn: FnNode, ctx: RustableContext) {
  return Object.fromEntries(fn.args.map(([name, type]) => [name, resolveType(type, ctx)]));
}

function wrapMessageHandlerBody(fn: FnNode): Rustify[] {
  const msgname = `ExecuteMsg::${pascalcase(fn.name)}`;
  const msgvars = fn.args.map(([name]) => name);
  return [
    ctx => `if let ${msgname} { ${msgvars.join(', ')} } = msg ` +
      block(fn.body, ';')(ctx) +
      ' else ' +
      block([
        'return Err(ContractError::CWSRuntimeError(CWSRuntimeError::ShouldNotEnter()))',
      ])(ctx),
  ]
}
