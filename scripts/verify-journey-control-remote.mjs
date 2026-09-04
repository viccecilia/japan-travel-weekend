import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !publishableKey || !serviceKey) throw new Error('Supabase environment is incomplete');

const publicClient = () => createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
async function signIn(email, password) {
  const client = publicClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Fictional account login failed: ${error.message}`);
  return client;
}
function assert(value, message) { if (!value) throw new Error(message); }
async function rpc(client, name, args = {}) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

const passenger = await signIn(process.env.PASSENGER_EMAIL, process.env.PASSENGER_PASSWORD);
const driver = await signIn(process.env.DRIVER_EMAIL, process.env.DRIVER_PASSWORD);
const roomRows = await rpc(passenger, 'get_accessible_trip_room');
const room = Array.isArray(roomRows) ? roomRows[0] : roomRows;
assert(room?.vehicle_group_id && room?.room_id, 'Passenger has no accessible fictional trip room');
const groupId = room.vehicle_group_id;
const roomId = room.room_id;

const itinerary = await rpc(passenger, 'get_vehicle_group_itinerary', { p_vehicle_group: groupId });
assert(Array.isArray(itinerary) && itinerary.length >= 2, 'Formal itinerary is unavailable');
const tasks = await rpc(driver, 'get_staff_portal_tasks');
assert(tasks?.some((task) => task.vehicle_group_id === groupId), 'Driver and passenger are not assigned to the same fictional group');
const target = itinerary.find((stop) => stop.id === 'fushimi-inari') ?? itinerary[3];
assert(target?.id && target.latitude && target.longitude, 'Target itinerary stop is incomplete');

const advanceKey = crypto.randomUUID();
const advanced = await rpc(driver, 'advance_vehicle_group_to_itinerary_stop', {
  p_vehicle_group: groupId,
  p_stop_id: target.id,
  p_reason: '虚构验收：到达景点并更新下一集合点',
  p_idempotency_key: advanceKey,
});
assert(advanced?.[0]?.status === 'in_progress', 'Journey did not enter in-progress state');

await rpc(driver, 'record_staff_execution_event', {
  p_vehicle_group: groupId,
  p_event_type: 'meeting_started',
  p_detail: { source: 'fictional-acceptance' },
  p_idempotency_key: crypto.randomUUID(),
});

const meetingRows = await rpc(passenger, 'get_current_vehicle_group_meeting', { p_vehicle_group: groupId });
const meeting = Array.isArray(meetingRows) ? meetingRows[0] : meetingRows;
assert(meeting?.status === 'active', 'Driver meeting action did not activate passenger arrival control');
assert(Number(meeting.latitude) === Number(target.latitude) && Number(meeting.longitude) === Number(target.longitude), 'Meeting retained stale coordinates');

const messages = await rpc(passenger, 'get_trip_room_messages_for_member', { p_room: roomId });
const templates = new Set((messages ?? []).map((message) => message.template_key));
assert(templates.has('meeting_changed'), 'Meeting change system notice is missing');
assert(templates.has('vehicle_arrived'), 'Driver meeting-started notice is missing');
assert(templates.has('stop_arrived'), 'Stop-arrival system notice is missing');

await rpc(passenger, 'acknowledge_vehicle_group_meeting', { p_vehicle_group: groupId, p_revision: meeting.revision });
const acknowledgedRows = await rpc(passenger, 'get_current_vehicle_group_meeting', { p_vehicle_group: groupId });
const acknowledged = Array.isArray(acknowledgedRows) ? acknowledgedRows[0] : acknowledgedRows;
assert(acknowledged?.acknowledged === true, 'Passenger meeting acknowledgement was not persisted');

const contextRows = await rpc(passenger, 'get_passenger_trip_context_v2', { p_vehicle_group: groupId });
const context = Array.isArray(contextRows) ? contextRows[0] : contextRows;
if (context?.passenger_id) {
  await rpc(passenger, 'set_own_passenger_checkin', {
    p_passenger: context.passenger_id,
    p_status: 'at_meeting_point',
    p_idempotency_key: crypto.randomUUID(),
  });
}

const simulatedLocation = { latitude: 34.9949, longitude: 135.785, accuracy: 15 };
await rpc(driver, 'publish_driver_location', {
  p_vehicle_group: groupId,
  p_latitude: simulatedLocation.latitude,
  p_longitude: simulatedLocation.longitude,
  p_accuracy_meters: simulatedLocation.accuracy,
  p_minutes: 15,
});
const locationRows = await rpc(passenger, 'get_active_driver_location', { p_vehicle_group: groupId });
const location = Array.isArray(locationRows) ? locationRows[0] : locationRows;
assert(Number(location?.latitude) === simulatedLocation.latitude && Number(location?.longitude) === simulatedLocation.longitude, 'Passenger did not receive simulated driver location');
await rpc(driver, 'stop_driver_location', { p_vehicle_group: groupId });
const stoppedLocation = await rpc(passenger, 'get_active_driver_location', { p_vehicle_group: groupId });
assert(!stoppedLocation || (Array.isArray(stoppedLocation) && stoppedLocation.length === 0), 'Driver location remained active after stop');

const completed = await rpc(driver, 'advance_vehicle_group_journey', {
  p_vehicle_group: groupId,
  p_action: 'trip_completed',
  p_stop_name: '',
  p_reason: '虚构验收行程已完成',
  p_idempotency_key: crypto.randomUUID(),
});
assert(completed?.[0]?.status === 'completed' && completed?.[0]?.room_status === 'closed', 'Journey or trip room did not close');
const sendAttempt = await passenger.rpc('send_trip_room_message', {
  p_room: roomId,
  p_content: '这条消息不应被写入',
  p_idempotency_key: crypto.randomUUID(),
});
assert(Boolean(sendAttempt.error), 'Closed trip room still accepted a passenger message');

const { data: outbox, error: outboxError } = await service
  .from('notification_outbox')
  .select('event_type,status')
  .eq('payload->>vehicleGroupId', groupId);
if (outboxError) throw new Error(`notification_outbox: ${outboxError.message}`);
const eventTypes = new Set((outbox ?? []).map((event) => event.event_type));
for (const required of ['meeting-started', 'trip-progress', 'trip-completed']) assert(eventTypes.has(required), `Notification outbox is missing ${required}`);

console.log(JSON.stringify({
  ok: true,
  routeStops: itinerary.length,
  activeMeetingVerified: true,
  passengerAcknowledgementVerified: true,
  passengerArrivalControlVerified: meeting.status === 'active',
  systemNoticesVerified: ['meeting_changed', 'vehicle_arrived', 'stop_arrived'],
  simulatedDriverLocationVerified: true,
  driverLocationStopped: true,
  tripCompleted: true,
  roomReadOnly: true,
  notificationEventsVerified: ['meeting-started', 'trip-progress', 'trip-completed'],
}));
