import {describe,expect,it} from 'vitest';
import {buildEmailAlert,readEmailAlertConfig} from '../server/emailAlerts';

describe('测试环境邮件告警',()=>{
  it('默认关闭且不要求 SMTP 密钥',()=>{expect(readEmailAlertConfig({})).toBeNull()});
  it('启用后拒绝缺失密钥与非法端口',()=>{
    expect(()=>readEmailAlertConfig({JTW_EMAIL_ALERT_ENABLED:'true'})).toThrow('JTW_SMTP_HOST');
    expect(()=>readEmailAlertConfig({JTW_EMAIL_ALERT_ENABLED:'true',JTW_SMTP_HOST:'smtp.example.test',JTW_SMTP_USER:'user',JTW_SMTP_PASSWORD:'secret',JTW_ALERT_EMAIL_FROM:'from@example.test',JTW_ALERT_EMAIL_TO:'to@example.test',JTW_SMTP_PORT:'0'})).toThrow('JTW_SMTP_PORT');
    expect(()=>readEmailAlertConfig({JTW_EMAIL_ALERT_ENABLED:'true',JTW_SMTP_HOST:'smtp.example.test',JTW_SMTP_USER:'user',JTW_SMTP_PASSWORD:'secret',JTW_ALERT_EMAIL_FROM:'from@example.test\r\nBcc: bad@example.test',JTW_ALERT_EMAIL_TO:'to@example.test'})).toThrow('address');
  });
  it('生成告警和恢复的中文纯文本邮件',()=>{
    const alert=buildEmailAlert({event:'alert',endpoint:'api-test.japan-travel.info',consecutiveFailures:3,occurredAt:new Date('2026-08-26T10:00:00Z')});
    const recovery=buildEmailAlert({event:'recovery',endpoint:'api-test.japan-travel.info',consecutiveFailures:0,occurredAt:new Date('2026-08-26T10:05:00Z')});
    expect(alert.subject).toContain('异常告警');expect(alert.text).toContain('连续失败次数：3');expect(recovery.subject).toContain('恢复通知');expect(recovery.text).toContain('事件已自动关闭');
  });
  it('生成低人数班次人工介入邮件且明确不会自动取消',()=>{
    const message=buildEmailAlert({event:'low-booking',endpoint:'departure-cutoff',consecutiveFailures:0,departureId:'departure-1',tripTitle:'京都与奈良一日游',departsAt:'2026-09-06T08:00:00+09:00',passengerCount:3,threshold:4});
    expect(message.subject).toContain('需人工介入');
    expect(message.text).toContain('已确认人数：3');
    expect(message.text).toContain('不会自动取消');
  });
});
