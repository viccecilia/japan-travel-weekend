import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../store";
import type { OperationsMerchandising } from "../../shared/integrations/supabaseOperations";
export function MarketingCenter() {
  const { services } = useApp();
  const [rows, setRows] = useState<OperationsMerchandising[]>([]);
  const [linkReview,setLinkReview]=useState<{campaigns:Array<Record<string,unknown>>;submissions:Array<Record<string,unknown>>}|null>(null);
  const [notice, setNotice] = useState("");
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
        <header><div><span>LINK CAMPAIGN</span><h2>旅行分享链接活动</h2></div><small>默认关闭 · 不接收游客视频文件</small></header>
        <p>仅保存 TikTok、Instagram、Facebook 帖子链接、账号、核验记录和转载授权。评分规则、官方账号及统计窗口未配置前，系统禁止公布排名和发券。</p>
        <div className="operations-dispatch-list">{linkReview?.campaigns.map(campaign=><article key={String(campaign.id)}><b>{String(campaign.campaign_month)} · {String(campaign.status)}</b><span>投稿 {linkReview.submissions.filter(item=>item.campaign_id===campaign.id).length} 条</span><small>{JSON.stringify(campaign.scoring_rules)==='{}'?'评分规则待配置':'评分规则已配置'} · {JSON.stringify(campaign.official_handles)==='{}'?'官方账号待配置':'官方账号已配置'}</small></article>)}</div>
        {!linkReview?.campaigns.length&&<p className="operations-notice">当前没有活动记录，公开入口保持关闭。</p>}
      </section>
    </main>
  );
}
