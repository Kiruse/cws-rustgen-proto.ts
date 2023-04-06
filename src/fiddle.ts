#!/usr/bin/env ts-node
import fs from 'fs';
import * as Nodes from './nodes';
import { opt, Optional } from './nodes';
import { RustableContext } from './types';

const GetCountResponse = new Nodes.Struct('GetCountResponse', {
  count: 'u64',
}, true, ['cw_serde']);

const contract = new Nodes.Contract('test');

contract.states.owner = 'Addr';
contract.states.counter = 'u64';

contract.errors['Unauthorized'] = new Nodes.ErrorNode('Unauthorized', {});

contract.instantiate.push(new Nodes.FnNode({
  kind: 'instantiate',
  name: 'instantiate',
  args: [
    ['counter', 'u64'],
  ],
  body: [
    new Nodes.CWSWriteStateStmt('owner', new Nodes.CWSIdentifierExpr('ctx.info.sender')),
    new Nodes.CWSWriteStateStmt('counter', new Nodes.CWSIdentifierExpr('msg.counter')),
  ],
}));

contract.executions.increment = new Nodes.FnNode({
  kind: 'execution',
  name: 'increment',
  body: [
    new Nodes.CWSWriteStateStmt(
      'counter',
      new Nodes.CWSBinaryExpr('+',
        new Nodes.CWSReadStateExpr('counter'),
        new Nodes.CWSLiteralExpr('1', 'u64'),
      ),
    ),
  ],
});

contract.executions.reset = new Nodes.FnNode({
  kind: 'execution',
  name: 'reset',
  args: [['value', opt('u64')]],
  body: [
    new Nodes.CWSExprStmt(new Nodes.CWSIfExpr(
      [
        [
          new Nodes.CWSBinaryExpr('!=', new Nodes.CWSIdentifierExpr('ctx.info.sender'), new Nodes.CWSReadStateExpr('owner')),
          new Nodes.CWSBlock([new Nodes.CWSFailStmt('Unauthorized')]),
        ],
      ],
    )),
    new Nodes.CWSWriteStateStmt('counter', new Nodes.CWSIdentifierExpr('value')),
  ],
})

contract.queries.get_count = new Nodes.FnNode({
  kind: 'query',
  name: 'get_count',
  ret: GetCountResponse,
  body: [
    new Nodes.CWSReturnStmt(
      new Nodes.CWSStructExpr(GetCountResponse, {
        counter: new Nodes.CWSReadStateExpr('counter'),
      }),
    ),
  ],
})

fs.writeFileSync('test.rs', contract.toRust(new RustableContext({ contract })));
