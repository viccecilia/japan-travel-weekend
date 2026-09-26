import {useNavigate} from 'react-router-dom';
import {useApp} from './store';

type Locale='zh-CN'|'zh-TW'|'ja'|'en'|'ko'|'es'|'vi'|'ne';
const labels:Record<Locale,string>={'zh-CN':'返回','zh-TW':'返回',ja:'戻る',en:'Back',ko:'뒤로',es:'Volver',vi:'Quay lại',ne:'फर्कनुहोस्'};

/** Compact common navigation for passenger subpages. */
export function PassengerPageHeader({backTo,title}:{backTo:string;title?:string}){
  const {state}=useApp();const navigate=useNavigate();const label=labels[(state.ui.locale??'zh-CN') as Locale]??labels.en;
  const back=()=>{
    const index=(window.history.state as {idx?:unknown}|null)?.idx;
    if(typeof index==='number'&&index>0)navigate(-1);
    else navigate(backTo,{replace:true});
  };
  return <header className="passenger-page-header"><button type="button" className="passenger-page-back" onClick={back} aria-label={label}><span aria-hidden="true">←</span><span>{label}</span></button>{title&&<b>{title}</b>}</header>;
}
