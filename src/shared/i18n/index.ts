export const languages={en:'English',ja:'日本語',vi:'Tiếng Việt — Coming Soon',ne:'नेपाली — Coming Soon'} as const;
export type Locale=keyof typeof languages;
const en={preview:'Preview',trips:'Trips',how:'How it works',rewards:'Rewards',safety:'Safety',about:'About',openApp:'Open App Demo',viewTrips:'View upcoming trips',tagline:'Explore Kansai. Meet new people.',subline:'Small-group weekend trips from Osaka for international residents.',joinAlone:'Join alone',noJapanese:'No Japanese required',tbd:'TBD',sample:'Sample / Demo only'};
export const messages={en,ja:en,vi:en,ne:en};
