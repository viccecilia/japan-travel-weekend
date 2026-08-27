export type DispatchTaskStatus='draft'|'sent'|'delivered'|'viewed'|'accepted'|'rejected'|'en_route'|'arrived'|'passengers_onboard'|'in_progress'|'completed'|'cancelled'|'failed';
export type DispatchTaskRequest={taskId:string;vehicleAssignmentId:string;driverExternalId:string;vehicleType:string;startsAt:string;endsAt:string;meetingName:string;meetingAddress:string;meetingLatitude:number|null;meetingLongitude:number|null;passengerCount:number;operationalNotes:string[];idempotencyKey:string};
export type DispatchTaskResult={accepted:boolean;externalTaskId:string|null;status:DispatchTaskStatus;reason:string|null};
export interface DispatchProvider{readonly name:string;readonly available:boolean;createTask(input:DispatchTaskRequest):Promise<DispatchTaskResult>;getTask(externalTaskId:string):Promise<DispatchTaskResult>;cancelTask(externalTaskId:string,idempotencyKey:string):Promise<DispatchTaskResult>}

export class UnavailableDispatchProvider implements DispatchProvider{readonly name='unavailable';readonly available=false;async createTask(){return {accepted:false,externalTaskId:null,status:'failed' as const,reason:'dispatch_not_configured'}}async getTask(){return {accepted:false,externalTaskId:null,status:'failed' as const,reason:'dispatch_not_configured'}}async cancelTask(){return {accepted:false,externalTaskId:null,status:'failed' as const,reason:'dispatch_not_configured'}}}

export class MemoryDispatchProvider implements DispatchProvider{
  readonly name='memory';readonly available=true;private readonly tasks=new Map<string,DispatchTaskResult>();private readonly idempotency=new Map<string,string>();
  async createTask(input:DispatchTaskRequest){const existing=this.idempotency.get(input.idempotencyKey);if(existing)return this.tasks.get(existing)!;const result={accepted:true,externalTaskId:`mock-${input.taskId}`,status:'sent' as const,reason:null};this.tasks.set(result.externalTaskId,result);this.idempotency.set(input.idempotencyKey,result.externalTaskId);return result}
  async getTask(externalTaskId:string){return this.tasks.get(externalTaskId)??{accepted:false,externalTaskId,status:'failed' as const,reason:'task_not_found'}}
  async cancelTask(externalTaskId:string,_idempotencyKey:string){const current=this.tasks.get(externalTaskId);if(!current)return {accepted:false,externalTaskId,status:'failed' as const,reason:'task_not_found'};const result={accepted:true,externalTaskId,status:'cancelled' as const,reason:null};this.tasks.set(externalTaskId,result);return result}
}

export class YuzuDispatchHttpAdapter implements DispatchProvider{
  readonly name='yuzu';readonly available:boolean;
  constructor(private readonly baseUrl:string,private readonly apiToken:string,private readonly transport:typeof fetch=fetch){this.available=this.validBaseUrl(baseUrl)&&Boolean(apiToken.trim())}
  private validBaseUrl(value:string){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash}catch{return false}}
  private async request(path:string,init:RequestInit):Promise<DispatchTaskResult>{if(!this.available)return {accepted:false,externalTaskId:null,status:'failed',reason:'dispatch_not_configured'};const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8_000);try{const response=await this.transport(new URL(path,this.baseUrl),{...init,signal:controller.signal,headers:{authorization:`Bearer ${this.apiToken}`,'content-type':'application/json',...init.headers}});if(!response.ok)return {accepted:false,externalTaskId:null,status:'failed',reason:`dispatch_http_${response.status}`};const body=await response.json() as {taskId?:string;status?:DispatchTaskStatus};return {accepted:true,externalTaskId:body.taskId??null,status:body.status??'sent',reason:null}}catch{return {accepted:false,externalTaskId:null,status:'failed',reason:'dispatch_request_failed'}}finally{clearTimeout(timer)}}
  createTask(input:DispatchTaskRequest){return this.request('/v1/tasks',{method:'POST',headers:{'idempotency-key':input.idempotencyKey},body:JSON.stringify(input)})}
  getTask(externalTaskId:string){return this.request(`/v1/tasks/${encodeURIComponent(externalTaskId)}`,{method:'GET'})}
  cancelTask(externalTaskId:string,idempotencyKey:string){return this.request(`/v1/tasks/${encodeURIComponent(externalTaskId)}/cancel`,{method:'POST',headers:{'idempotency-key':idempotencyKey}})}
}
