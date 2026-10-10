import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {resolveAttractionId} from '../shared/attractions';

const source=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');

describe('Passenger UI polish contracts',()=>{
  it('keeps level-one pages arrow-free and level-two back compact with a history fallback',()=>{
    const app=source('./App.tsx');
    const header=source('./PassengerPageHeader.tsx');
    expect(app).toContain("new Set(['/app','/app/trips','/app/orders','/app/messages','/app/profile'])");
    expect(app).toContain("&&!pathname.startsWith('/app/my-trip/room')");
    expect(header).toContain("navigate(-1)");
    expect(header).toContain("navigate(backTo,{replace:true})");
    expect(header).toContain('aria-hidden="true">‹</span>');
    expect(header).not.toContain('<span>{label}</span>');
  });

  it('constrains the desktop home shell and uses dot carousel indicators inside the hero',()=>{
    const css=source('./discover.css');
    expect(css).toContain('max-width:460px');
    expect(css).toContain('.discover-dots [aria-current=true]');
    expect(css).toContain('border-radius:50%');
    expect(css).not.toContain('[aria-current=true] span{width:20px');
  });

  it('keeps departure selection customer-facing and omits remaining-seat copy from Route Detail V2',()=>{
    const app=source('./App.tsx');
    expect(app).toContain('route-departure-picker');
    expect(app).toContain('立即预订');
    expect(app).toContain('item.price.toLocaleString(intlLocale)');
    const hero=app.slice(app.indexOf('function RouteV2Hero'),app.indexOf('function RouteV2List'));
    expect(hero).not.toContain('minimumGuests');
    expect(hero).not.toContain('availableSeats');
  });

  it('presents one payment CTA, a draft state, and a coherent expired recovery status',()=>{
    const app=source('./App.tsx');
    expect(app).toContain('payment-draft-card');
    expect(app).toContain('确认支付 ¥');
    expect(app).toContain('等待价格确认');
    expect(app).toContain('支付由 Stripe 安全处理');
    expect(app).toContain('支付已超时，可重新确认价格后继续');
    expect(app).toContain("'zh-CN':'报名人数'");
  });

  it('renders a normal empty chat and a handled attachment bottom sheet',()=>{
    const chat=source('./PassengerChatRoom.tsx');
    const tripRoom=source('./TripRoom.tsx');
    const css=source('../styles.css');
    expect(chat).toContain('pc-empty-state');
    expect(chat).toContain('暂无消息');
    expect(chat).toContain('pc-sheet-handle');
    expect(chat).toContain('pc-sheet-actions');
    expect(chat).not.toContain('pc-sheet-close');
    expect(chat.indexOf('pc-modal-backdrop pc-composer-backdrop')).toBeLessThan(chat.indexOf('<footer className="pc-composer">'));
    expect(tripRoom).toContain('senderId: message.author_id === currentUserId ? "me"');
    expect(chat).toContain("own?'own':'other'");
    expect(css).toContain('.passenger-chat-page .pc-message.own{flex-direction:row;justify-content:flex-end}');
    expect(css).toContain('.pc-message.own .pc-bubble');
    expect(css).toContain('background:#fff0a5');
    expect(css).toContain('.app-frame:has(.passenger-chat-page)>.bottom-nav{width:min(430px,100%)}');
    expect(css).toContain('grid-template-columns:38px minmax(0,1fr) 64px');
    expect(css).toContain('padding:9px 11px calc(9px + env(safe-area-inset-bottom))');
    expect(css).toContain('.passenger-chat-page .pc-composer{display:block;width:min(430px,100%)');
    expect(css).not.toContain('.passenger-chat-page .pc-composer{width:min(430px,100vw)');
    expect(css).toContain('.passenger-chat-page .pc-compose-row{width:100%}');
    expect(css).toContain('padding:10px 16px 18px;border-radius:24px');
    expect(css).toContain('width:52px;height:52px');
  });
});

describe('reviewed Attraction mapping and inline audio',()=>{
  it('uses exact canonical aliases in multiple locales',()=>{
    expect(resolveAttractionId({title:'天桥立'},'zh-CN')).toBe('amanohashidate');
    expect(resolveAttractionId({title:'Amanohashidate'},'en')).toBe('amanohashidate');
    expect(resolveAttractionId({title:'大原三千院'},'zh-CN')).toBe('sanzen-in');
  });

  it('does not fuzzy-map route-specific activities',()=>{
    expect(resolveAttractionId({title:'岚山自由活动'},'zh-CN')).toBeNull();
    expect(resolveAttractionId({title:' 天桥立 '},'zh-CN')).toBeNull();
  });

  it('only mounts inline audio when a published audio URL is returned and keeps the full guide link',()=>{
    const app=source('./App.tsx');
    expect(app).toContain('guide?.audioUrl&&<RouteInlineAudio');
    expect(app).toContain('attractionGuideHref(attractionId,returnTo)');
  });
});
