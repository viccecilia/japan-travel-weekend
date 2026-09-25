import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../store";
import type { OperationsMerchandising } from "../../shared/integrations/supabaseOperations";
import {DiscoverManager} from './DiscoverManager';
export function MarketingCenter() {
  const { services } = useApp();
  const [rows, setRows] = useState<OperationsMerchandising[]>([]);
  const [linkReview,setLinkReview]=useState<{campaigns:Array<Record<string,unknown>>;submissions:Array<Record<string,unknown>>}|null>(null);
  const [notice, setNotice] = useState("");
  const [reviewing,setReviewing]=useState<Record<string,boolean>>({});
  const refreshLinkReview=async()=>{const review=await services?.operations.loadLinkCampaignReview();if(review){setLinkReview(review);setNotice(review.error??'')}};
  useEffect(() => {
    void Promise.all([services?.operations.listMerchandising(),services?.operations.loadLinkCampaignReview()]).then(([result,review])=>{setRows(result?.data??[]);if(review)setLinkReview(review);setNotice(result?.error??review?.error??"")});
  }, [services]);
  return (
    <main className="operations-page">
      <header className="operations-hero">
        <div>
          <span>MERCHANDISING</span>
          <h1>首页推荐与季节专题</h1>
          <p>展示排序、季节有效期与销售班次彼此独立；红叶状态不作天气保证。</p>
        </div>
        <Link className="button secondary" to="/app/operations">
          返回工作台
        </Link>
      </header>
      <DiscoverManager/>
      <section className="operations-section">
        {notice && <p role="alert">{notice}</p>}
        <div className="operations-dispatch-list">
          {rows.map((row) => (
            <article key={row.tripId}>
              <div>
                <b>{row.title}</b>
                <span>
                  首页顺序 {row.featuredRank ?? "未设置"} ·{" "}
                  {row.campaignKey ?? "常规路线"}
                </span>
              </div>
              <strong>
                {row.travelFrom && row.travelUntil
                  ? `${row.travelFrom} 至 ${row.travelUntil}`
                  : "全年内容，实际可订日看班次"}
              </strong>
              <small>
                翻译准备：
                {Object.entries(row.localeReadiness)
                  .filter(([, ready]) => ready)
                  .map(([locale]) => locale)
                  .join("、") || "待核对"}
              </small>
            </article>
          ))}
        </div>
      </section>
      <section className="operations-section">
        <header><div><span>TRAVEL MOMENTS</span><h2>旅行作品投稿</h2></div><small>默认关闭 · 不接收游客视频文件</small></header>
        <p>仅保存 TikTok、Instagram 帖子链接、账号、真实完团订单、核验记录和明确转载授权。评分规则、官方账号及统计窗口未配置前，系统禁止公布排名和发券。</p>
        <div className="operations-dispatch-list">{linkReview?.campaigns.map(campaign=><article key={String(campaign.id)}><b>{String(campaign.campaign_month)} · {String(campaign.status)}</b><span>投稿 {linkReview.submissions.filter(item=>item.campaign_id===campaign.id).length} 条</span><small>{JSON.stringify(campaign.scoring_rules)==='{}'?'评分规则待配置':'评分规则已配置'} · {JSON.stringify(campaign.official_handles)==='{}'?'官方账号待配置':'官方账号已配置'}</small></article>)}</div>
        <div className="operations-dispatch-list">{linkReview?.submissions.map(item=>{const account=item.account as {display_name?:string}|null;const order=item.order as {id?:string;departure?:{departs_at?:string;trip?:{title?:string}}}|null;const id=String(item.id);const update=async(status:'valid'|'needs_information')=>{const reason=window.prompt(status==='valid'?'核验说明（至少 3 个字）':'请说明需要补充的内容（至少 3 个字）','已核验公开作品、@账号与完团订单');if(!reason)return;setReviewing(value=>({...value,[id]:true}));const result=await services?.operations.verifyTravelMomentSubmission({submissionId:id,status,reason});setReviewing(value=>({...value,[id]:false}));setNotice(result?.error??(status==='valid'?'已设为有效投稿':'已标记为需要补充'));if(result?.ok)void refreshLinkReview()};return <article key={id}><b>{String(item.platform).toUpperCase()} · {String(item.status)}</b><span>{account?.display_name??'JTW user'} · {order?.departure?.trip?.title??'路线待读取'} · {order?.departure?.departs_at??''}</span><a href={String(item.post_url)} target="_blank" rel="noreferrer">{String(item.platform_account)} · 打开原帖</a><small>订单 {String(item.order_id)} · {String(item.created_at)} · mention {String((item.authorization_scope as Record<string,unknown>|null)?.mention_confirmed===true)} · 授权 {String((item.authorization_scope as Record<string,unknown>|null)?.authorized===true)}</small>{String(item.status)==='pending'&&<div className="operations-inline-actions"><button className="button secondary" disabled={reviewing[id]} onClick={()=>void update('needs_information')}>需要补充</button><button className="button" disabled={reviewing[id]} onClick={()=>void update('valid')}>核验有效</button></div>}</article>})}</div>
        {!linkReview?.campaigns.length&&<p className="operations-notice">当前没有活动记录，公开入口保持关闭。</p>}
      </section>
    </main>
  );
}
