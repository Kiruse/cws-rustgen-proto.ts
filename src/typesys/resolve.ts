import type { TypeNode } from '.';
import { Optional } from '../nodes/generics';
import { RustableCallback, RustableContext } from '../types';

export type TypeArg = string | TypeNode | RustableCallback;

export function resolveType(type: TypeArg, ctx: RustableContext): string {
  if (typeof type === 'string') return resolveStringType(type);
  if (typeof type === 'function') return type(ctx);
  if (type instanceof Optional) {
    const wrappedType = resolveType(type.inner, ctx);
    if (type.withError)
    return `Result<${wrappedType}, ContractError>`
    else
    return `Option<${wrappedType}>`;
  }
  if ('typename' in type) return type.typename;
  if ('name' in type) {
    if (!type.name) throw Error('No generated name for struct');
    return type.name;
  }
  throw Error('Invalid type');
}

function resolveStringType(type: string): string {
  switch (type) {
    case 'u64': return 'cosmwasm_std::Uint64';
    case 'u128': return 'cosmwasm_std::Uint128';
    case 'u256': return 'cosmwasm_std::Uint256';
    case 'u512': return 'cosmwasm_std::Uint512';
    case 'd128': return 'cosmwasm_std::Decimal';
    case 'd256': return 'cosmwasm_std::Decimal256';
    case 'Addr': return 'cosmwasm_std::Addr';
    default: return type;
  }
}

export function unwrapType(type: TypeNode): TypeNode {
  if (!(type instanceof Optional))
    return 'Error: not an Optional';
  return type.inner;
}

export const isErrorType = (type: TypeNode) => typeof type === 'string' && type.substring(0, 5).toLowerCase() === 'error';
