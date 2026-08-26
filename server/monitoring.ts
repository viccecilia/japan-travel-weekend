export type MonitorState={consecutiveFailures:number;incidentOpen:boolean};
export type MonitorTransition={state:MonitorState;event:'none'|'alert'|'recovery'};

export const initialMonitorState:MonitorState={consecutiveFailures:0,incidentOpen:false};

export function applyProbeResult(state:MonitorState,healthy:boolean,failureThreshold=3):MonitorTransition{
  if(healthy){return {state:initialMonitorState,event:state.incidentOpen?'recovery':'none'}}
  const consecutiveFailures=state.consecutiveFailures+1;
  if(!state.incidentOpen&&consecutiveFailures>=failureThreshold)return {state:{consecutiveFailures,incidentOpen:true},event:'alert'};
  return {state:{consecutiveFailures,incidentOpen:state.incidentOpen},event:'none'};
}
