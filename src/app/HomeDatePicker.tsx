import {useEffect, useState} from 'react';
import {nextTokyoDays, tokyoDateKey} from './homeUpcomingDepartures';
import type {PassengerLocale} from '../shared/i18n/passengerLocale';
import './homeV3.css';

import {homeV3Labels} from './homeV3Copy';
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
        <span>{new Intl.DateTimeFormat(locale,{timeZone:'Asia/Tokyo',weekday:'short'}).format(value)}</span>
        <b>{Number(day.slice(-2))}</b>
      </button>;
    })}</div>
    <label>{labels[locale][1]}<input type="date" min={today} value={date} onChange={event=>{if(/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)&&event.target.value>=today)onChange(event.target.value)}}/></label>
  </section>;
}
