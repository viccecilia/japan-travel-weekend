export const businessRules={firstValidOrderDiscountPercent:5,referrerCreditPercent:5,creditValidityDays:180,creditPerOrderCapYen:1000,ambassadorCommissionPercent:5,tiers:[{name:'Explorer',trips:0},{name:'Traveller',trips:2},{name:'Insider',trips:3},{name:'VIP Traveller',trips:5}] as const};
export function tierFor(completed:number){return [...businessRules.tiers].reverse().find(t=>completed>=t.trips)??businessRules.tiers[0]}
export function nextTier(completed:number){return businessRules.tiers.find(t=>t.trips>completed)}
