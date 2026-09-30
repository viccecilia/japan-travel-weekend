import {useEffect,useMemo,useState} from 'react';
import {useApp} from '../store';
import type {OperationsPolicyTemplate} from '../../shared/integrations/supabaseOperations';

const locales=['zh-CN','ja','en','ko','vi','ne','es'] as const;
const labels:Record<(typeof locales)[number],string>={'zh-CN':'中文',ja:'日本語',en:'English',ko:'한국어',vi:'Tiếng Việt',ne:'नेपाली',es:'Español'};
const schemas={
  global:['trip_adjustment_notice','included','excluded','meeting_and_lateness','trip_rules','weather_and_force_majeure','special_traveler_notes','luggage','meals','belongings','local_laws','safety','communication'],
  service_time:['service_scope','included_service','schedule_and_overtime','service_limits','route_adjustments','service_safety'],
  cancellation:['cancellation_windows','refund_rules','change_rules','no_show','force_majeure','refund_process'],
} as const;
const sectionLabels:Record<string,string>={trip_adjustment_notice:'行程重要说明',included:'费用包含',excluded:'费用不包含',meeting_and_lateness:'集合与迟到',trip_rules:'行程规则',weather_and_force_majeure:'天气及不可抗力',cancellation_policy:'退改规则',special_traveler_notes:'特殊人群说明',luggage:'行李说明',meals:'用餐说明',belongings:'个人财物',local_laws:'当地法规',safety:'安全提示',communication:'联系方式与出行通知'};
Object.assign(sectionLabels,{service_scope:'10小时服务范围',included_service:'服务包含内容',schedule_and_overtime:'服务时段与超时处理',service_limits:'服务限制',route_adjustments:'行程调整',service_safety:'服务安全说明',cancellation_windows:'取消时限',refund_rules:'退款比例与规则',change_rules:'改期与变更',no_show:'未到场',force_majeure:'不可抗力',refund_process:'退款流程'});
const policyKind=(item:OperationsPolicyTemplate|null)=>item?.templateKey==='standard-10h-v1'?'service_time':item?.templateKey==='standard-24h-v1'?'cancellation':'global';
const policyTitle=(kind:keyof typeof schemas)=>({global:'JTW 旅游通用规则',service_time:'标准10小时服务规则',cancellation:'标准24小时退改规则'}[kind]);
const normalize=(value:Record<string,Record<string,string>>)=>Object.fromEntries(locales.map(locale=>[locale,value[locale]??{}]));

export function PolicyTemplateManager(){
  const {services}=useApp();const [items,setItems]=useState<OperationsPolicyTemplate[]>([]);const [selected,setSelected]=useState<OperationsPolicyTemplate|null>(null);const [locale,setLocale]=useState<(typeof locales)[number]>('zh-CN');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
  const load=async()=>{if(!services)return;setBusy(true);const result=await services.operations.listPolicyTemplates();setItems(result.data);setNotice(result.error??'');setBusy(false);};
  useEffect(()=>{void load();},[services]);
  const localizations=useMemo(()=>normalize(selected?.localizations??{}),[selected]);
  const keys=selected?schemas[policyKind(selected)]:schemas.global;
  const complete=useMemo(()=>locales.filter(code=>keys.every(key=>Boolean(localizations[code][key]?.trim()))).length,[keys,localizations]);
  const patch=(key:string,value:string)=>setSelected(current=>current?{...current,localizations:{...localizations,[locale]:{...localizations[locale],[key]:value}}}:current);
  const save=async()=>{if(!services||!selected)return;setBusy(true);const result=await services.operations.savePolicyDraft(selected.templateId,localizations);setNotice(result.ok?'通用规则草稿已保存。':`保存失败：${result.error}`);if(result.ok)await load();setBusy(false);};
  const publish=async()=>{if(!services||!selected)return;setBusy(true);const result=await services.operations.publishPolicyDraft(selected.templateId);setNotice(result.ok?'通用规则新版本已发布；所有当前路线将读取此版本。':`发布失败：${result.error}`);if(result.ok)await load();setBusy(false);};
  return <main className="operations-page"><header className="operations-hero"><div><span>POLICY CMS</span><h1>通用规则模板</h1><p>三类规则独立版本化；已发布版本与历史订单快照均不会被编辑。</p></div></header>{notice&&<p className="operations-notice" role="status">{notice}</p>}<section className="operations-section"><header><h2>规则模块</h2><small>选择一个模块后只显示它自己的业务字段。</small></header>{items.map(item=>{const kind=policyKind(item);return <button key={item.templateId} className="button secondary" onClick={()=>setSelected({...item,localizations:normalize(item.localizations)})}>{policyTitle(kind)} · {item.templateKey} · {item.versionState?`v${item.versionNumber} ${item.versionState}`:'尚无版本'}</button>})}</section>{selected&&<section className="operations-section"><header><div><h2>{policyTitle(policyKind(selected))}</h2><small>{selected.templateKey} · {selected.versionState?`v${selected.versionNumber} ${selected.versionState}`:'尚无版本'} · 完整 {complete}/7</small></div><select value={locale} onChange={event=>setLocale(event.target.value as typeof locale)}>{locales.map(code=><option key={code} value={code}>{labels[code]}</option>)}</select></header><div className="product-editor-stack">{keys.map(key=><label key={key} className="product-editor-field"><span>{sectionLabels[key]}</span><textarea value={localizations[locale][key]??''} onChange={event=>patch(key,event.target.value)} placeholder="由运营录入经审核的正式文本"/></label>)}</div><div className="operations-task-actions"><button className="button secondary" disabled={busy} onClick={()=>void save()}>保存新 Draft</button><button className="button" disabled={busy||complete<7} onClick={()=>void publish()}>发布新版本（需 7/7）</button></div></section>}</main>;
}
