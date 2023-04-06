mod test {
  mod state {
    use cosmwasm_std::*;
    use cw_storage_plus::Item;
    pub struct State {
      owner: cosmwasm_std::Addr,
      counter: cosmwasm_std::Uint64,
    }
  }
  mod errors {
    use cosmwasm_std::StdError;
    use cws_runtime::CWSRuntimeError;
    use thiserror::Error;
    #[derive(Error, Debug)]
    pub enum ContractError {
      #[error("{0}")]
      StdError(
        #[from] cosmwasm_std::StdError,
      ),
      #[error("{0}")]
      CWSRuntimeError(
        #[from] cws_runtime::CWSRuntimeError,
      ),
      #[error("test contract error: {0}")]
      GenericError(
        String,
      ),
      #[error("Unauthorized")]
      Unauthorized {},
    }
  }
  mod msg {
    use cosmwasm_schema::{cw_serde, QueryResponses};
    #[cw_serde]
    pub struct InstantiateMsg {
      counter: cosmwasm_std::Uint64,
    }
    #[cw_serde]
    pub enum ExecuteMsg {
      Increment {},
      Reset {
        value: Option<cosmwasm_std::Uint64>,
      },
    }
    #[cw_serde, derive(QueryResponses)]
    pub enum QueryMsg {
      GetCount {},
    }
    #[cw_serde]
    pub struct GetCountResponse {
      count: cosmwasm_std::Uint64,
    }
  }
  mod contract {
    use cosmwasm_std::{Binary, Deps, DepsMut, entry_point, Env, from_binary, MessageInfo, Response, StdResult, to_binary};
    use cw2::set_contract_version;
    use cwscript_runtime::{CWSContext, CWSQueryContext};
    use super::state::*;
    use super::errors::ContractError;
    use super::msg::{InstantiateMsg, ExecuteMsg, QueryMsg};
    #[cfg_attr(not(feature = "library"), entry_point)]
    fn instantiate(
      deps: DepsMut,
      env: Env,
      info: MessageInfo,
      msg: InstantiateMsg
    ) -> Result<Response, ContractError> {
      let ctx = CWSContext::new(deps, env.clone(), info.clone());
      set_contract_version(ctx.deps.storage, "crates.io:test", "0.1.0")?;
      STATE.update(ctx.deps.storage, |mut state| -> Result<State, ContractError> {
        state.owner = ctx.info.sender;
        Ok(state)
      })?;;
      STATE.update(ctx.deps.storage, |mut state| -> Result<State, ContractError> {
        state.counter = msg.counter;
        Ok(state)
      })?;
    }
    #[cfg_attr(not(feature = "library"), entry_point)]
    fn execute(
      deps: DepsMut,
      env: Env,
      info: MessageInfo,
      msg: ExecuteMsg
    ) -> Result<Response, ContractError> {
      let ctx = CWSContext::new(deps, env.clone(), info.clone());
      match msg {
        ExecuteMsg::Increment {..} => exec::increment(&ctx, msg)?,
        ExecuteMsg::Reset {..} => exec::reset(&ctx, msg)?
      }
    }
    fn query(
      deps: Deps,
      env: Env,
      msg: QueryMsg
    ) -> StdResult<Binary> {
      let ctx = CWSQueryContext::new(deps, env.clone());
      match msg {
        QueryMsg::GetCount {..} => Ok(to_binary(qry::get_count(&ctx, msg))?)
      }
    }
    mod exec {
      use super::super::msg::ExecuteMsg;
      fn increment(
        ctx: CWSContext,
        msg: ExecuteMsg
      ) -> Result<Response, ContractError> {
        if let ExecuteMsg::Increment {  } = msg {
          STATE.update(ctx.deps.storage, |mut state| -> Result<State, ContractError> {
            state.counter = (STATE.load(ctx.deps.storage)?.counter + cosmwasm_std::Uint64::from(1));
            Ok(state)
          })?;
        } else {
          return Err(ContractError::CWSRuntimeError(CWSRuntimeError::ShouldNotEnter()))
        }
      }
      fn reset(
        ctx: CWSContext,
        msg: ExecuteMsg
      ) -> Result<Response, ContractError> {
        if let ExecuteMsg::Reset { value } = msg {
          if (ctx.info.sender != STATE.load(ctx.deps.storage)?.owner) {
            return Err(ContractError::Generic("Unauthorized"))
          };
          STATE.update(ctx.deps.storage, |mut state| -> Result<State, ContractError> {
            state.counter = value;
            Ok(state)
          })?;
        } else {
          return Err(ContractError::CWSRuntimeError(CWSRuntimeError::ShouldNotEnter()))
        }
      }
    }
    mod qry {
      use super::super::msg::*;
      fn get_count(
        ctx: CWSQueryContext,
        msg: QueryMsg
      ) -> Result<GetCountResponse, ContractError> {
        if let ExecuteMsg::GetCount {  } = msg {
          return {
              counter: STATE.load(ctx.deps.storage)?.counter,
            }
        } else {
          return Err(ContractError::CWSRuntimeError(CWSRuntimeError::ShouldNotEnter()))
        }
      }
    }
  }
}