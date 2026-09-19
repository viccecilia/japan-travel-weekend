import {useEffect, useState} from 'react';
import {nextTokyoDays, tokyoDateKey} from './homeUpcomingDepartures';
import type {PassengerLocale} from '../shared/i18n/passengerLocale';
import './homeV3.css';

import {homeV3Labels} from './homeV3Copy';
// Some embedded browsers omit ICU locales; keep navigation labels in the selected language.
const weekdays:Record<PassengerLocale,readonly string[]>={
  'zh-CN':['周日','周一','周二','周三','周四','周五','周六'],
  'zh-TW':['週日','週一','週二','週三','週四','週五','週六'],
  ja:['日','月','火','水','木','金','土'],en:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
  es:['dom','lun','mar','mié','jue','vie','sáb'],vi:['CN','T2','T3','T4','T5','T6','T7'],
  ne:['आइत','सोम','मङ्गल','बुध','बिही','शुक्र','शनि'],ko:['일','월','화','수','목','금','토'],
};
export function HomeDatePicker({locale,date,onChange}:{locale:PassengerLocale;date:string;onChange:(date:string)=>void}) {
  const [today,setToday]=useState(()=>tokyoDateKey(new Date()));
  useEffect(()=>{
    const refresh=()=>setToday(tokyoDateKey(new Date()));
    const timer=window.setInterval(refresh,30_000);
    window.addEventListener('focus',refresh);
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh)};
  },[]);
  const labels={[locale]:homeV3Labels(locale)};
  const days=nextTokyoDays(new Date(`${today}T00:00:00+09:00`));
  return <section className="home-v3-dates" aria-label={labels[locale][0]}>
    <h2>{labels[locale][0]}</h2>
    <div className="home-v3-days">{days.map(day=>{
      const value=new Date(`${day}T12:00:00+09:00`);
      return <button key={day} type="button" aria-pressed={day===date} onClick={()=>onChange(day)}>
        <span>{weekdays[locale][value.getUTCDay()]}</span>
        <b>{Number(day.slice(-2))}</b>
      </button>;
    })}</div>
    <label>{labels[locale][1]}<input type="date" min={today} value={date} onChange={event=>{if(/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)&&event.target.value>=today)onChange(event.target.value)}}/></label>
  </section>;
}
