export type NotificationEvent='order-confirmed'|'bank-transfer-pending'|'meeting-updated'|'trip-room-opened'|'departure-reminder'|'departure-delayed'|'boarding-completed';
export type NotificationChannel='email'|'sms'|'push';
export type NotificationPreference={marketing:boolean;channels:NotificationChannel[]};
export type NotificationRequest={eventId:string;event:NotificationEvent;recipientId:string;data:Record<string,string>;necessaryForFulfilment:boolean;preference:NotificationPreference};
export type NotificationResult={accepted:boolean;reason:'accepted'|'provider-unavailable'|'duplicate'|'preference-disabled';externalId:string|null};
export interface NotificationDeliveryProvider{available:boolean;deliver(input:NotificationRequest):Promise<{externalId:string|null}>}

export const notificationTemplates:Record<NotificationEvent,{title:string;required:string[]}>= {
  'order-confirmed':{title:'订单已确认',required:['orderNumber']},
  'bank-transfer-pending':{title:'银行转账待人工确认',required:['orderNumber']},
  'meeting-updated':{title:'集合信息已变更',required:['departureId']},
  'trip-room-opened':{title:'行程房间已开放',required:['departureId']},
  'departure-reminder':{title:'发车前提醒',required:['departureId']},
  'departure-delayed':{title:'行程延误通知',required:['departureId']},
  'boarding-completed':{title:'登车已完成',required:['boardingId']},
};

export class NotificationDispatcher{
  private readonly processed=new Map<string,NotificationResult>();
  constructor(private readonly provider:NotificationDeliveryProvider|null){}
  async dispatch(input:NotificationRequest):Promise<NotificationResult>{
    const prior=this.processed.get(input.eventId);if(prior)return {...prior,reason:'duplicate'};
    if(!input.necessaryForFulfilment&&input.preference.channels.length===0){const result={accepted:false,reason:'preference-disabled' as const,externalId:null};this.processed.set(input.eventId,result);return result;}
    if(!this.provider?.available)return {accepted:false,reason:'provider-unavailable' as const,externalId:null};
    for(const field of notificationTemplates[input.event].required)if(!input.data[field])throw new Error(`通知缺少必要字段：${field}`);
    const delivered=await this.provider.deliver(input);const result={accepted:true,reason:'accepted' as const,externalId:delivered.externalId};this.processed.set(input.eventId,result);return result;
  }
}
