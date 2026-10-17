import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const passenger=readFileSync('supabase/migrations/20261016152000_reuse_active_passenger_location_share.sql','utf8');
const meeting=readFileSync('supabase/migrations/20261016152100_restrict_meeting_updates_to_operations.sql','utf8');

describe('location continuity and meeting permissions',()=>{
 it('reuses one active passenger share while retaining consent, membership and expiry checks',()=>{
  expect(passenger).toMatch(/select s\.id[\s\S]*s\.expires_at > now\(\)[\s\S]*for update/);
  expect(passenger).toContain('public.is_vehicle_group_member(p_vehicle_group)');
  expect(passenger).toContain("j.status = 'completed'");
  expect(passenger).toContain("set search_path = ''");
  expect(passenger).toContain('revoke all on function public.publish_own_location_share');
 });
 it('keeps meeting mutation available to operations but not ordinary authenticated staff',()=>{
  expect(meeting).toContain('not public.is_operations()');
  expect(meeting).toMatch(/revoke all on function public\.update_vehicle_group_meeting[\s\S]*authenticated/);
  expect(meeting).toContain('operations_update_vehicle_group_meeting');
 });
});
