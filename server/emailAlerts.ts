import nodemailer from 'nodemailer';

export type EmailAlertEvent='alert'|'recovery'|'low-booking';
export type EmailAlertConfig={host:string;port:number;secure:boolean;user:string;password:string;from:string;to:string};
export type EmailAlertInput={event:EmailAlertEvent;endpoint:string;consecutiveFailures:number;occurredAt?:Date;departureId?:string;tripTitle?:string;departsAt?:string;passengerCount?:number;threshold?:number};

export function readEmailAlertConfig(env:NodeJS.ProcessEnv):EmailAlertConfig|null{
  if(env.JTW_EMAIL_ALERT_ENABLED!=='true')return null;
  const required=['JTW_SMTP_HOST','JTW_SMTP_USER','JTW_SMTP_PASSWORD','JTW_ALERT_EMAIL_FROM','JTW_ALERT_EMAIL_TO'] as const;
  for(const key of required)if(!env[key]?.trim())throw new Error(`missing email alert setting: ${key}`);
  const port=Number(env.JTW_SMTP_PORT??'587');
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('invalid email alert setting: JTW_SMTP_PORT');
  if(/[\r\n]/.test(`${env.JTW_ALERT_EMAIL_FROM}${env.JTW_ALERT_EMAIL_TO}`))throw new Error('invalid email alert address');
  return {host:env.JTW_SMTP_HOST!.trim(),port,secure:env.JTW_SMTP_SECURE==='true',user:env.JTW_SMTP_USER!.trim(),password:env.JTW_SMTP_PASSWORD!,from:env.JTW_ALERT_EMAIL_FROM!.trim(),to:env.JTW_ALERT_EMAIL_TO!.trim()};
}

export function buildEmailAlert(input:EmailAlertInput){
  if(input.event==='low-booking'){
    const occurredAt=(input.occurredAt??new Date()).toISOString();
    const lines=['次日班次低人数人工介入提醒','环境：测试环境',`路线：${input.tripTitle??'未命名路线'}`,`班次：${input.departsAt??'时间待确认'}`,`班次ID：${input.departureId??'未知'}`,`已确认人数：${input.passengerCount??0}`,`人工复核阈值：${input.threshold??4}`,`生成时间：${occurredAt}`,'','该班次不会自动取消。请运营人员确认车辆、司机和是否正常发车，并在后台完成配车。','此邮件由 Japan Travel Weekend 班次截单任务自动发送。'];
    return {subject:`[JT Weekend][需人工介入] 次日班次仅 ${input.passengerCount??0} 人`,text:lines.join('\n')};
  }
  const isAlert=input.event==='alert';
  const title=isAlert?'测试 API 异常告警':'测试 API 恢复通知';
  const occurredAt=(input.occurredAt??new Date()).toISOString();
  const lines=[title,`环境：测试环境`,`服务：${input.endpoint}`,`状态：${isAlert?'连续健康检查失败':'健康检查已恢复'}`,`连续失败次数：${input.consecutiveFailures}`,`时间：${occurredAt}`,'',isAlert?'请登录运营后台并检查 API、数据库及 Stripe 测试连接。':'本次事件已自动关闭，请复核服务日志。','此邮件由 Japan Travel Weekend 测试监控自动发送。'];
  return {subject:`[JT Weekend][测试] ${title}`,text:lines.join('\n')};
}

export async function sendEmailAlert(config:EmailAlertConfig,input:EmailAlertInput){
  const transport=nodemailer.createTransport({host:config.host,port:config.port,secure:config.secure,auth:{user:config.user,pass:config.password},connectionTimeout:10_000,greetingTimeout:10_000,socketTimeout:15_000});
  const message=buildEmailAlert(input);
  const result=await transport.sendMail({from:config.from,to:config.to,subject:message.subject,text:message.text,disableFileAccess:true,disableUrlAccess:true});
  return {provider:'smtp',messageId:result.messageId};
}
