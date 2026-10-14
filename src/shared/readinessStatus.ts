export type ReadinessStatus={
  ok:boolean;
  mode:string;
  version?:string;
  checks:Record<string,boolean>;
};

export async function readReadinessStatus(response:Response):Promise<ReadinessStatus>{
  const body:unknown=await response.json().catch(()=>null);
  if(!body||typeof body!=='object')throw new Error('服务状态读取失败');
  const status=body as Partial<ReadinessStatus>;
  if(typeof status.ok!=='boolean'||typeof status.mode!=='string'||!status.checks||typeof status.checks!=='object'){
    throw new Error('服务状态读取失败');
  }
  return status as ReadinessStatus;
}
