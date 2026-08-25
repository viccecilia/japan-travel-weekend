export function seatOrderTotal(unitPrice:number|null|undefined,seats:number){
  if(unitPrice==null||!Number.isSafeInteger(unitPrice)||unitPrice<1||!Number.isSafeInteger(seats)||seats<1)return null;
  const total=unitPrice*seats;
  return Number.isSafeInteger(total)?total:null;
}
