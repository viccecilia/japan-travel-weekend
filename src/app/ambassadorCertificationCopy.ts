export type CertificationLocale='zh-CN'|'zh-TW'|'ja'|'en'|'ko'|'es'|'vi'|'ne';
type Question={prompt:string;options:string[]};
type CertificationCopy={heading:string;intro:string;progress:(done:number,total:number)=>string;submit:string;nextQuestion:string;correct:string;incorrect:string;retry:string;completed:string;review:string;unavailable:string;questions:Record<string,Question>};

const zhQuestions:Record<string,Question>={
  'direct-referral':{prompt:'哪一种关系属于 JTW 的直接推荐？',options:['新游客通过你的专属链接注册','朋友转发给其他人的间接注册','已有账号后来填写推荐码']},
  'qualified-seat':{prompt:'一个席位什么时候计入有效付费人次？',options:['订单创建后立即计入','已付款、实际登车且行程完成后','只要进入支付页面']},
  'payment-only':{prompt:'游客付款成功后，是否立即计入有效人次？',options:['是，付款就是最终条件','24 小时后自动计入','否，必须实际登车并完成行程']},
  'refund-no-show':{prompt:'退款、取消或未登车的席位如何处理？',options:['仍计一半人次','不计入，已计入时按规则撤销','始终保留为有效人次']},
  'ten-seat-gate':{prompt:'累计 10 个有效付费人次后会发生什么？',options:['自动获得现金感谢金资格','自动成为正式推广大使','解锁学习认证；全题通过并经运营审核后才升级']},
  'self-referral':{prompt:'可以用自己的推荐链接为自己或虚假账号下单吗？',options:['可以，只要付款','不可以，禁止自我推荐和虚假注册','每月可以一次']},
  'truthful-sharing':{prompt:'分享路线和优惠信息时应遵守哪项规则？',options:['准确说明条件，不承诺无法保证的优惠或收益','可以省略限制条件','可以保证每位游客都获得奖励']},
  'privacy':{prompt:'处理游客账号、订单和付款信息时，正确做法是什么？',options:['让游客把密码发给推广人','把订单截图公开到群里','只走官方流程，不索取密码、验证码或 Token']},
  'cash-timing':{prompt:'成为获批推广大使后，新推荐订单的现金感谢金何时确认？',options:['新游客注册时','首笔合资格行程完成并由系统确认后','分享链接后立即到账']},
  'withdrawal':{prompt:'当前提现规则是什么？',options:['余额满 ¥10,000 可申请，每自然月最多一次，不足继续累计','任何金额每天可提现','未满 ¥10,000 的余额月底清零']}
};
const enQuestions:Record<string,Question>={
  'direct-referral':{prompt:'Which relationship is a direct JTW referral?',options:['A new traveler registers through your personal link','A friend of a friend registers indirectly','An existing account adds a code later']},
  'qualified-seat':{prompt:'When does a seat count as a qualified paid seat?',options:['As soon as an order is created','After payment, actual boarding, and trip completion','After opening the payment page']},
  'payment-only':{prompt:'Does successful payment immediately count as a qualified seat?',options:['Yes, payment is the final condition','It counts automatically after 24 hours','No, the traveler must board and complete the trip']},
  'refund-no-show':{prompt:'How are refunded, cancelled, or no-show seats handled?',options:['They count as half a seat','They do not count and are reversed if previously counted','They always remain qualified']},
  'ten-seat-gate':{prompt:'What happens after 10 qualified paid seats?',options:['Cash rewards start automatically','The traveler becomes an ambassador automatically','Learning unlocks; all answers and operations approval are still required']},
  'self-referral':{prompt:'May you use your own link for yourself or fake accounts?',options:['Yes, if payment succeeds','No, self-referral and fake registrations are prohibited','Once per month']},
  'truthful-sharing':{prompt:'Which rule applies when sharing routes and offers?',options:['State conditions accurately and never guarantee unavailable benefits','Restrictions may be omitted','Every traveler may be promised a reward']},
  'privacy':{prompt:'What is the correct way to handle traveler account, order, and payment data?',options:['Ask the traveler to send their password','Post order screenshots publicly','Use official flows and never request passwords, codes, or tokens']},
  'cash-timing':{prompt:'After approval, when is cash reward confirmed for a new referral?',options:['At registration','After the first eligible trip is completed and confirmed','Immediately after sharing the link']},
  'withdrawal':{prompt:'What is the current withdrawal rule?',options:['At least ¥10,000, once per calendar month, with smaller balances carried forward','Any amount every day','Balances under ¥10,000 expire monthly']}
};
const jaQuestions:Record<string,Question>={
  'direct-referral':{prompt:'JTW の直接紹介に該当するのはどれですか？',options:['新規旅行者があなた専用リンクから登録','友人の友人による間接登録','既存アカウントが後からコードを入力']},
  'qualified-seat':{prompt:'有効な有料人数として計上される条件は？',options:['注文作成時','支払い、実際の乗車、旅行完了後','決済画面を開いた時']},
  'payment-only':{prompt:'支払い完了だけで直ちに有効人数になりますか？',options:['はい','24時間後に自動計上','いいえ、実際に乗車し旅行を完了する必要があります']},
  'refund-no-show':{prompt:'返金、キャンセル、無断欠席の席は？',options:['0.5人として計上','計上せず、計上済みなら取り消す','常に有効のまま']},
  'ten-seat-gate':{prompt:'有効な有料人数が10人に達すると？',options:['現金謝礼が自動開始','自動的に正式アンバサダーになる','学習が解放され、全問正解と運営承認が必要']},
  'self-referral':{prompt:'自分や架空アカウントに自分の紹介リンクを使えますか？',options:['支払えば可能','不可。自己紹介と架空登録は禁止','月1回のみ可能']},
  'truthful-sharing':{prompt:'ルートや特典を共有する際のルールは？',options:['条件を正確に伝え、保証できない特典を約束しない','制限は省略できる','全員への特典を保証できる']},
  'privacy':{prompt:'旅行者のアカウント・注文・決済情報の正しい扱いは？',options:['パスワードを送ってもらう','注文画面を公開する','公式手順を使い、パスワード・認証コード・Tokenを求めない']},
  'cash-timing':{prompt:'承認後、新しい紹介の現金謝礼が確定する時点は？',options:['新規登録時','初回対象旅行の完了がシステムで確認された後','リンク共有直後']},
  'withdrawal':{prompt:'現在の出金ルールは？',options:['¥10,000以上、暦月1回まで。不足分は繰越','毎日いくらでも出金可能','¥10,000未満は月末失効']}
};
const base:CertificationCopy={heading:'推广大使学习认证',intro:'逐题作答。每题会立即显示结果，答错可以重新选择；10 题全部答对后通过。',progress:(done,total)=>`已答对 ${done} / ${total}`,submit:'提交本题',nextQuestion:'下一题',correct:'回答正确',incorrect:'回答错误',retry:'请重新选择后再答一次。',completed:'10 道题全部正确，学习认证已通过。',review:'正在等待运营审核；审核通过后才会启用推广大使现金权益。',unavailable:'学习认证暂不可用。',questions:zhQuestions};
const en:CertificationCopy={heading:'Ambassador certification',intro:'Answer one question at a time. You receive immediate feedback and may retry an incorrect answer. All 10 must be correct.',progress:(done,total)=>`${done} / ${total} correct`,submit:'Submit answer',nextQuestion:'Next question',correct:'Correct',incorrect:'Incorrect',retry:'Choose another answer and try again.',completed:'All 10 answers are correct. Certification passed.',review:'Operations approval is pending. Cash Ambassador benefits begin only after approval.',unavailable:'Certification is not available.',questions:enQuestions};
const ja:CertificationCopy={heading:'アンバサダー学習認定',intro:'1問ずつ回答します。すぐに正誤が表示され、間違えた場合は再回答できます。10問全問正解で合格です。',progress:(done,total)=>`${done} / ${total} 問正解`,submit:'この回答を送信',nextQuestion:'次の問題',correct:'正解です',incorrect:'不正解です',retry:'別の回答を選んでもう一度お答えください。',completed:'10問すべて正解し、学習認定に合格しました。',review:'運営審査待ちです。承認後に現金アンバサダー特典が有効になります。',unavailable:'学習認定は現在利用できません。',questions:jaQuestions};

export const certificationCopy:Record<CertificationLocale,CertificationCopy>={
  'zh-CN':base,
  'zh-TW':{...base,heading:'推廣大使學習認證',intro:'逐題作答。每題會立即顯示結果，答錯可以重新選擇；10 題全部答對後通過。',submit:'提交本題',nextQuestion:'下一題',correct:'回答正確',incorrect:'回答錯誤',retry:'請重新選擇後再答一次。',completed:'10 道題全部正確，學習認證已通過。',review:'正在等待營運審核；審核通過後才會啟用推廣大使現金權益。'},
  ja,en,ko:en,es:en,vi:en,ne:en
};
