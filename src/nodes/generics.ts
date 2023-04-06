import type { TypeNode } from '../typesys';

/** Temporary specific TypeNode before we introduce proper generics combining both `Option`s & `Result`s. */
export class Optional {
  constructor(
    public inner: TypeNode,
    public withError = false,
  ) {}
}

export const opt = (inner: TypeNode, withError = false) => new Optional(inner, withError);
