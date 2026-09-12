export type PassengerSalutation="先生"|"女士"|"";

export function splitPassengerDisplayName(value:string):{name:string;salutation:PassengerSalutation}{
  const normalized=value.trim();
  if(normalized.endsWith("先生"))return{name:normalized.slice(0,-2).trim(),salutation:"先生"};
  if(normalized.endsWith("女士"))return{name:normalized.slice(0,-2).trim(),salutation:"女士"};
  return{name:normalized,salutation:""};
}

export function composePassengerDisplayName(name:string,salutation:Exclude<PassengerSalutation,"">):string{
  return `${name.trim()}${salutation}`;
}
