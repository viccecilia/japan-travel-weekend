import {readFileSync} from 'node:fs';import {describe,expect,it} from 'vitest';
const sql=readFileSync('supabase/migrations/202609050067_guided_tour_companion.sql','utf8');
const scope=readFileSync('supabase/migrations/202609050068_guided_tour_scope_and_progress.sql','utf8');
const membership=readFileSync('supabase/migrations/202609050069_guided_assignment_membership_policy.sql','utf8');
const photos=readFileSync('supabase/migrations/202609050070_guided_tour_photo_sources.sql','utf8');
describe('guided tour migration',()=>{
 it('stores plans, nodes, assignments and privacy-safe progress',()=>{for(const table of ['guided_tour_plans','guided_tour_nodes','vehicle_group_guided_tours','guided_tour_progress'])expect(sql).toContain(`public.${table}`);expect(sql).not.toContain('last_latitude');expect(sql).not.toContain('location_history')});
 it('seeds both areas and branching meal routes',()=>{for(const value of ['kodaiji-dropoff','kiyomizu-niomon','togetsukyo-dropoff','arashiyama-meal','arashiyama-meal-last','tateishi-pickup'])expect(sql).toContain(value)});
 it('notifies only paid or confirmed passengers when free time begins',()=>{expect(sql).toContain("o.status in ('paid','confirmed')");expect(sql).toContain("'free-time-started'");expect(sql).toContain('start_vehicle_group_free_time')});
 it('scopes assignments and progress to the paid passenger vehicle group',()=>{expect(scope).toContain('vgo.vehicle_group_id=public.vehicle_group_guided_tours.vehicle_group_id');expect(scope).toContain('o.account_id=auth.uid()');expect(scope).toContain('save_own_guided_tour_progress');expect(scope).toContain("o.status in ('paid','confirmed')")});
 it('uses the hardened paid membership helper for assignment reads',()=>expect(membership).toContain('public.can_receive_vehicle_group(vehicle_group_id)'));
 it('keeps owned and Google photo metadata separate',()=>{expect(photos).toContain('owned_photo jsonb');expect(photos).toContain('google_photo jsonb');expect(photos).toContain('never persist, cache, or rehost')});
});
