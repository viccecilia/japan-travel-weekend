import type {Departure,MeetingPoint,TripRoomMessage,VehicleGroupMember} from '../types';

export const departures:Departure[]=[
 {id:'dep-kyoto-sample',tripSlug:'kyoto-nara-classic',dateLabel:'Saturday · Sample',weekend:'this',status:'almost_full_demo',meetingTime:'08:00',meetingPoint:'Osaka Station · Sample meeting point',isSample:true},
 {id:'dep-amano-sample',tripSlug:'amanohashidate-ine',dateLabel:'Sunday · Sample',weekend:'this',status:'available_demo',meetingTime:'07:30',meetingPoint:'Osaka · Final point TBD',isSample:true},
 {id:'dep-biwa-sample',tripSlug:'biwako-shirahige',dateLabel:'Next Saturday · Sample',weekend:'next',status:'few_seats_demo',meetingTime:'08:00',meetingPoint:'Osaka · Final point TBD',isSample:true},
 {id:'dep-kobe-sample',tripSlug:'kobe-arima-rokko',dateLabel:'Later · Sample',weekend:'later',status:'available_demo',meetingTime:'TBD',meetingPoint:'TBD',isSample:true},
];
export const demoMeeting:MeetingPoint={name:'Kiyomizu Parking Area · Demo',time:'14:20',note:'Meet beside the blue vehicle sign.',latDemo:34.994,lngDemo:135.785};
export const demoMembers:VehicleGroupMember[]=[
 {id:'p1',displayName:'Alex D.',role:'passenger',languages:['en'],boarding:'returned',sharesLocation:false},
 {id:'p2',displayName:'Mina K.',role:'passenger',languages:['ja','en'],boarding:'returned',sharesLocation:false},
 {id:'p3',displayName:'David L.',role:'passenger',languages:['zh','en'],boarding:'away',sharesLocation:true},
 {id:'staff1',displayName:'Ken · Driver',role:'driver',languages:['ja','en','zh'],boarding:'boarded',sharesLocation:true},
];
export const initialTripRoomMessages:TripRoomMessage[]=[
 {id:'m1',author:'Trip Room',role:'system',original:'Vehicle Group A opened. Private contact details are never shown.',important:true,kind:'text'},
 {id:'m2',author:'Ken · Driver',role:'driver',original:'Hello! I am your driver tomorrow. Please meet at 08:00 at the sample Osaka Station point.',translation:'翻译预留 / Translation preview',important:true,kind:'text'},
];
export const driverTemplates=['Introduce myself','Confirm tomorrow’s meeting','Vehicle arrived','Departing in 10 minutes','Departing in 5 minutes','Please return to vehicle','Traffic delay','Meeting point changed'];
