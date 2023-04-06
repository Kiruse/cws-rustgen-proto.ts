import type { Contract } from '../nodes/contract';
import type { Optional } from '../nodes/generics';
import type { Struct, Enum, Variant } from '../nodes/structs';

export type TypeNode =
  | PrimitiveType
  | NativeType
  | Optional
  | Struct
  | Enum | Variant
  // | AliasTypeNode // currently not supported
  | Contract
  // | InterfaceNode // currently not supported

// 'error' type is a special type to indicate that the type is invalid
export type PrimitiveType = UnnamedErrorType | NamedErrorType | '()' | 'bool' | `u${8 | 16 | 32 | 64 | 128 | 256}` | `d${128 | 256}`;
type UnnamedErrorType = `${'e' | 'E'}rror`;
type NamedErrorType = `${UnnamedErrorType}:${string}`;

export type NativeType = 'Addr';
