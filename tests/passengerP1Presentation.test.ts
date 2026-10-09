import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const app=readFileSync(resolve(process.cwd(),'src/app/App.tsx'),'utf8');
const tripRoom=readFileSync(resolve(process.cwd(),'src/app/TripRoom.tsx'),'utf8');
const migration=readFileSync(resolve(process.cwd(),'supabase/migrations/20261002093000_passenger_system_event_idempotency.sql'),'utf8');

describe('Passenger P1 presentation and event safety',()=>{
  it('shows the five-category policy summary after route-specific content and links to full rules',()=>{
    expect(app).not.toContain('placement="top"');
    expect(app).not.toContain('placement="full"');
    expect(app).not.toContain('<RouteShortNotice');
    expect(app).toContain('<RoutePolicySummary');
    expect(app).toContain('routeFinalCopy[locale]');
    expect(app).toContain('to="/legal/travel-conditions"');
    expect(app.indexOf('<RoutePolicySummary')).toBeGreaterThan(app.indexOf("localizedList('preparation'"));
  });
  it('uses an accessible chevron accordion instead of plus/minus controls for policy content',()=>{
    expect(app).toContain('function PolicyAccordion');
    expect(app).toContain('aria-expanded={open}');
    expect(app).toContain('className={open?\'open\':\'\'}');
    expect(app).not.toContain('<summary>{full.title}<span>＋</span></summary>');
  });
  it('separates notification state from its related-order CTA and hides internal-only explanation',()=>{
    expect(app).toContain('notification-status');
    expect(app).toContain('notification-cta');
    expect(app).not.toContain('{n.footer}');
  });
  it('renders system templates in the passenger locale while preserving real messages',()=>{
    expect(tripRoom).toContain('if (message.template_key) return templateTranslation(message.template_key, locale);');
    expect(tripRoom).toContain('if (!autoTranslate) return null;');
  });
  it('uses localized common role labels and a localized current-meeting title',()=>{
    expect(tripRoom).toContain('passengerRound1Copy[locale].common.driver');
    expect(tripRoom).toContain('name: chatCopy.currentMeeting');
    expect(tripRoom).not.toContain('passengerRound1Copy[locale].chat.driver');
  });
  it('deduplicates only identical system events in the write layer, never human chat',()=>{
    expect(migration).toContain('new.template_key is not null');
    expect(migration).toContain('prior.template_key=new.template_key');
    expect(migration).toContain("interval '15 minutes'");
  });
});
