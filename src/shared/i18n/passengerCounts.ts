import type {PassengerLocale} from './passengerLocale';

const labels:Record<PassengerLocale,{adult:(n:number)=>string;seat:(n:number)=>string}>={
  'zh-CN':{adult:n=>`${n} 位成人`,seat:n=>`${n} 个座位`},
  'zh-TW':{adult:n=>`${n} 位成人`,seat:n=>`${n} 個座位`},
  ja:{adult:n=>`${n}名の大人`,seat:n=>`${n}席`},
  en:{adult:n=>`${n} ${n===1?'adult':'adults'}`,seat:n=>`${n} ${n===1?'seat':'seats'}`},
  es:{adult:n=>`${n} ${n===1?'adulto':'adultos'}`,seat:n=>`${n} ${n===1?'asiento':'asientos'}`},
  vi:{adult:n=>`${n} người lớn`,seat:n=>`${n} ghế`},
  ne:{adult:n=>`${n} वयस्क`,seat:n=>`${n} सिट`},
  ko:{adult:n=>`성인 ${n}명`,seat:n=>`${n}석`},
};

export function passengerAdultCount(locale:PassengerLocale,count:number){return labels[locale].adult(count);}
export function passengerSeatCount(locale:PassengerLocale,count:number){return labels[locale].seat(count);}
