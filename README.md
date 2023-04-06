# rustgen-proto
Rust code generation prototype for CWScript. Assumes the existence of a `cws_runtime` crate providing various utility functions and standard types.

## State of this Library
This library is highly experimental & incomplete. It has been written under urgency.

The library has been built around the `rustify` subsystem (*src/types*, *src/utils*). Some Rust AST abstraction exists, such as `Struct` and `Enum`, which integrate with the `rustify` subsystem.

In essence, `rustify` takes a string, a `Rustable` which is an object with a `toRust(ctx: RustableContext)` method, or a callback equivalent to the `toRust` method. Systems integrating with `rustify` should also support the `Rustable` and `RustableCallback` types, i.e. pass down its context where appropriate.

Possibly, you may want to pass down `ctx.descendant`, which increments the indent. Additionally, more loose abstractions like the `mod`, `fn`, and `dict` helper functions exist as well. Unlike `Enum` and `Struct`, these are built exclusively around the `rustify` subsystem and are unaware of more complex operations. For example, we distinguish between the `block` helper and the `CWSBlock`, although `CWSBlock` uses `block` internally. `block` is more generic, but unaware of more advanced logic. For example, `CWSBlock` can be used to identify the "return type" of the code block.

Finally, `resolveType` from *src/typesys/resolve* applies a slightly adjusted logic from `rustify` for fetching & stringifying the corresponding Rust type.

Various vital & quality of life features are currently missing, such as:

- Type Inferrence
- CodeGen Context Frames
- Code optimization

### Type Inferrence
Type Inferrence works twofold: what is the return type of a function call, and what is the type being returned from a function definition? An example in CosmWasm is the return type of a query: often, the result is simply a single-property JSON object. Through inferrence, we can dynamically create Rust types on the fly based on the types we have identified, such that this code is valid:

```cws
contract MyContract {
  // [...]
  query decimals() {
    return { decimals: state.decimals }
  }
}
```

### Context Frames
A context frame adds additional logic for static analysis, such as variables and functions. It also provides scope information, such as code being generated as part of an `if` condition, or as part of a variable initializer.

### Code Optimization
Currently, the code generator translates most code 1-to-1, meaning every translation unit is translated on its own without consideration of its context or surrounding instructions. This also means we blatantly generate multiple state reads & writes for subsequent calls instead of batching them.
