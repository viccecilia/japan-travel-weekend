import {useState} from 'react';
import {Link} from 'react-router-dom';
import {demoMeeting,demoMembers,driverTemplates} from '../shared/data/operations';
import {operationsConfig} from '../shared/config/businessRules';
import {useDemo} from './store';

const Action=({children,onClick}:{children:string;onClick?:()=>void})=><button className="room-action" type="button" onClick={onClick}>{children}</button>;

export function MyTrip(){return <>
 <div className="app-title"><div className="eyebrow">Tomorrow · Demo itinerary</div><h1>Kyoto &amp; Nara</h1><p>Your operational home for Vehicle Group A.</p></div>
 <div className="trip-status"><span>Trip Room open</span><b>Meet 08:00</b><small>Osaka Station · Sample point</small></div>
 <div className="receipt"><div><span>Your vehicle</span><b>Alphard · Group A</b></div><div><span>Driver</span><b>Ken · EN / 日本語 / 中文</b></div><div><span>Seats</span><b>6 booked / 6 capacity</b></div></div>
 <Link className="button full" to="/app-demo/my-trip/room">Open Vehicle Trip Room</Link>
 <Link className="button secondary full room-link" to="/app-demo/boarding-pass/TRIP-DEMO">Boarding Pass Demo</Link>
 <p className="privacy">Opens: {operationsConfig.tripRoomOpens}. Vehicle assignment and all details are sample data.</p>
 </>}

export function TripRoom(){
 const {state,setState}=useDemo(); const [notice,setNotice]=useState(''); const [staff,setStaff]=useState(false);
 const returned=demoMembers.filter(m=>m.role==='passenger'&&m.boarding==='returned').length;
 const passengers=demoMembers.filter(m=>m.role==='passenger').length;
 const share=(value:boolean)=>{setState({...state,tripRoom:{...state.tripRoom,sharingLocation:value}});setNotice(value?'Demo location shared with this vehicle’s driver/guide only.':'Location sharing stopped.');};
 const photo=()=>{setState({...state,tripRoom:{...state.tripRoom,messages:[...state.tripRoom.messages,{id:`photo-${state.tripRoom.messages.length}`,author:'You',role:'passenger',original:'Surroundings photo · local Demo placeholder',kind:'photo_demo'}]}});setNotice('Photo placeholder saved only in this browser.');};
 const broadcast=(template:string)=>{setState({...state,tripRoom:{...state.tripRoom,messages:[...state.tripRoom.messages,{id:`msg-${state.tripRoom.messages.length}`,author:'Ken · Driver',role:'driver',original:`${template} · Demo message`,translation:'Translation field reserved',important:true,kind:'text'}]}});};
 return <div className="trip-room">
  <div className="room-head"><div><span>VEHICLE GROUP A · LIVE DATA NOT CONNECTED</span><h1>Next meeting</h1><b>{demoMeeting.time} · 00:24:18 <small>Demo countdown</small></b><p>{demoMeeting.name}<br/>{demoMeeting.note}</p></div><button type="button" onClick={()=>setStaff(!staff)}>{staff?'Passenger view':'Staff demo'}</button></div>
  <div className="demo-map" role="img" aria-label="Illustrative map showing a sample driver, meeting point and your location"><span className="map-label">SIMULATED MAP · NO GPS</span><i className="map-road one"/><i className="map-road two"/><b className="pin driver">🚐<small>Driver</small></b><b className="pin meeting">◆<small>Meet</small></b><b className="pin you">●<small>You</small></b></div>
  <div className="driver-strip"><div><small>Driver location · simulated</small><b>Ken is 420 m away</b></div><span>{returned}/{passengers} returned</span></div>
  <div className="room-actions"><Action onClick={()=>setNotice('Navigation is a Demo. Future: open Google Maps walking directions to the current driver coordinates.')}>Walk to Driver</Action>{state.tripRoom.sharingLocation?<Action onClick={()=>share(false)}>Stop Sharing</Action>:<Action onClick={()=>share(true)}>Share My Location</Action>}<Action onClick={photo}>Take / Send Photo</Action><Link className="room-action" to="/app-demo/boarding-pass/TRIP-DEMO">Boarding Pass</Link><Action onClick={()=>setNotice('Demo help: no message or call is sent.')}>Help</Action></div>
  {notice&&<div className="demo-notice room-notice" role="status">{notice}</div>}
  {staff&&<section className="staff-panel"><h2>Driver / staff preview</h2><p>Passenger locations appear only after active consent.</p><div className="member-list">{demoMembers.filter(m=>m.role==='passenger').map(m=><div key={m.id}><b>{m.displayName}</b><span>{m.boarding}{m.sharesLocation?' · location shared':''}</span></div>)}</div><h3>Template broadcast</h3><div className="template-grid">{driverTemplates.map(t=><button type="button" key={t} onClick={()=>broadcast(t)}>{t}</button>)}</div></section>}
  <section className="vehicle-chat"><h2>Vehicle Chat</h2><p className="privacy">Only this vehicle’s passengers and assigned staff. No private phone, LINE, WhatsApp or WeChat details.</p>{state.tripRoom.messages.map(m=><article key={m.id} className={m.important?'important':''}><header><b>{m.author}</b><span>{m.kind==='photo_demo'?'LOCAL PHOTO DEMO':m.role}</span></header><p>{m.original}</p>{m.translation&&<details><summary>Original + Translation</summary><p>{m.translation}</p></details>}</article>)}</section>
 </div>;
}

export function AppPrivateGroups(){return <><div className="app-title"><div className="eyebrow">Separate from seat pool</div><h1>Private Groups</h1><p>For companies, schools, clubs, friends and families travelling together.</p></div><div className="private-card"><b>30 people? Start here.</b><ul><li>Custom date and pickup</li><li>Group size and multi-vehicle planning</li><li>Multilingual support</li><li>Professional transportation</li></ul></div><button className="button full" type="button">Request a Quote · Demo / TBD</button><p className="privacy">No quote or form is submitted. Pricing remains TBD.</p></>}
