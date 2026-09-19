import {useEffect,useState,type FormEvent} from 'react';
import {useApp} from './store';
import {validBoostPost,type BoostPlatform} from './boostPost';
import './travelShareCampaign.css';

export function TravelShareCampaign(){
  const {services,state}=useApp();
  return <ShareCampaign key={state.user?.email??'anonymous'} services={services}/>;
}
function ShareCampaign({services}:{services:ReturnType<typeof useApp>['services']}){
  const [data,setData]=useState<Awaited<ReturnType<NonNullable<typeof services>['loadOwnShareCampaign']>>|null>(null);
  const [platform,setPlatform]=useState<BoostPlatform>('tiktok');
  const [url,setUrl]=useState('');
  const [mentioned,setMentioned]=useState(false);
  const [authorized,setAuthorized]=useState(false);
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true;
    if(services)void services.loadOwnShareCampaign().then(value=>{if(active)setData(value)}).catch(()=>{if(active)setNotice('活动读取失败，请刷新后重试')});
    return()=>{active=false};
  },[services]);
  if(!services)return <section className="boost-card"><h2>Travelers Boost</h2><p>请登录后查看可参加的活动。</p></section>;
  if(!data)return <section className="boost-card"><h2>Travelers Boost</h2><p role="status">{notice||'正在读取活动状态…'}</p></section>;
  if(data.error)return <section className="boost-card"><h2>Travelers Boost</h2><p role="alert">{data.error}</p></section>;
  if(!data.campaign)return <section className="boost-card"><h2>Travelers Boost</h2><p>活动尚未开放。开放后提交本人的公开帖子链接，不上传视频文件，不保证曝光或获选。</p></section>;
  const canSubmit=validBoostPost(platform,url)&&mentioned&&authorized&&!busy&&data.orders.length>0;
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!canSubmit||!data.campaign)return;
    const form=event.currentTarget;const fields=new FormData(form);setBusy(true);setNotice('');
    try{
      const result=await services.submitShareLink({
        campaignId:String(data.campaign.id),orderId:String(fields.get('orderId')),platform,url:url.trim(),
        platformAccount:String(fields.get('platformAccount')),authorizationVersion:'share-link-limited-v2',
        mentionConfirmed:mentioned,authorized,
      });
      if(!result.ok){setNotice(result.error??'提交失败，请重试');return}
      setNotice('已提交推广助力候选，等待核验；不代表已获选。');
      form.reset();setUrl('');setMentioned(false);setAuthorized(false);
      try{setData(await services.loadOwnShareCampaign())}catch{setNotice('候选已提交，但记录刷新失败；请刷新查看，不要重复提交。')}
    }catch{setNotice('网络异常，输入已保留；请先查看提交记录再重试，避免重复提交。')}
    finally{setBusy(false)}
  };
  return <section className="boost-card"><small>TRAVELERS BOOST</small><h2>让更多人看见你的旅程</h2>
    <p>在自己的平台发布 → @ JTW 对应官方账号 → 提交公开链接 → 等待人工核验。不会抓取或托管原视频，也不承诺播放量、涨粉或获选。</p>
    <form onSubmit={submit}>
      <label>关联本人订单<select name="orderId" required><option value="">请选择已完成行程的订单</option>{data.orders.map(order=><option value={String(order.id)} key={String(order.id)}>{String(order.id).slice(0,8)}</option>)}</select></label>
      <small>是否完成行程由服务端核验；仅付款不能取得活动资格。</small>
      <label>平台<select value={platform} onChange={event=>setPlatform(event.target.value as BoostPlatform)}><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option></select></label>
      <label>本人平台账号<input name="platformAccount" required minLength={2}/></label>
      <label>公开帖子链接<input required type="url" value={url} onChange={event=>setUrl(event.target.value)} placeholder="https://…"/></label>
      {url&&!validBoostPost(platform,url)&&<p role="alert">请填写所选平台的公开帖子链接，不接受个人主页或其他网站。</p>}
      <label className="boost-consent"><input type="checkbox" checked={mentioned} onChange={event=>setMentioned(event.target.checked)}/><span>我已在这篇帖子 @ JTW 对应官方账号，内容属于本人。</span></label>
      <label className="boost-consent"><input type="checkbox" checked={authorized} onChange={event=>setAuthorized(event.target.checked)}/><span>我授权 JTW 展示此指定公开帖、监测其公开数据并原生 Repost；不含下载、二次剪辑、重新上传或付费广告。音乐及同行者肖像需另行取得许可。</span></label>
      <button className="button full" disabled={!canSubmit}>{busy?'正在提交':'提交推广助力候选'}</button>
    </form>
    {notice&&<p role="status">{notice}</p>}
    {data.submissions.length>0&&<section><h3>我的提交记录</h3>{data.submissions.map(item=><article key={String(item.id)}>
      <b>{String(item.platform)}</b><p>{{pending:'候选待核验',valid:'核验通过（不代表获选）',needs_information:'需要补充资料',ineligible:'不符合资格',withdrawn:'已撤回'}[String(item.status)]??'状态待核对'}</p>
      <a href={String(item.post_url)} target="_blank" rel="noreferrer">查看原帖</a>
      <small>提交于 {new Date(String(item.created_at)).toLocaleString('zh-CN',{timeZone:'Asia/Tokyo'})} · 公开数据待人工核验，自动指标未接入。</small>
    </article>)}</section>}
  </section>;
}
