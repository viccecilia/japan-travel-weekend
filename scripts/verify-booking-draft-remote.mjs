import { createClient } from '@supabase/supabase-js'

const required = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'JTW_OWNER_EMAIL',
  'JTW_OWNER_PASSWORD',
  'JTW_OTHER_EMAIL',
  'JTW_OTHER_PASSWORD',
  'JTW_OPERATIONS_EMAIL',
  'JTW_OPERATIONS_PASSWORD',
]

for (const name of required) {
  if (!process.env[name]) throw new Error(`缺少远程验收配置：${name}`)
}
const options = { auth: { autoRefreshToken: false, persistSession: false } }
const owner = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options)
const other = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options)
const operations = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options)

const testSlug = 'test-golden-path-remote-validation'
const idempotencyKey = `test-draft-${Date.now()}`
let draftId

const fail = (message, error) => {
  throw new Error(`${message}${error?.message ? `：${error.message}` : ''}`)
}
const signIn = async (client, emailName, passwordName) => {
  const { error } = await client.auth.signInWithPassword({
    email: process.env[emailName],
    password: process.env[passwordName],
  })
  if (error) fail('虚构测试账户登录失败', error)
}

try {
  await Promise.all([
    signIn(owner, 'JTW_OWNER_EMAIL', 'JTW_OWNER_PASSWORD'),
    signIn(other, 'JTW_OTHER_EMAIL', 'JTW_OTHER_PASSWORD'),
    signIn(operations, 'JTW_OPERATIONS_EMAIL', 'JTW_OPERATIONS_PASSWORD'),
  ])

  const { data: departures, error: departureError } = await owner.rpc('list_sellable_departures')
  if (departureError) fail('读取 TEST 发班失败', departureError)
  const departure = departures.find((row) => row.trip_slug === testSlug)
  if (!departure) fail('未找到 SQL Editor 建立的 TEST 发班')
  const departureId = departure.id

  const draftParameters = {
    p_departure: departureId,
    p_adults: 2,
    p_children: 1,
    p_infants: 1,
    p_passenger_private: {
      name: 'TEST 乘客',
      phone: 'TEST-NOT-A-PHONE',
      emergency: 'TEST-EMERGENCY',
    },
    p_assistance_private: {
      childSeat: { quantity: 1, status: '确认中' },
      stroller: { quantity: 1 },
      wheelchair: { needed: true, requiresAccessibleVehicle: true },
      other: { privateNote: 'TEST PRIVATE NOTE', largeLuggage: 1 },
    },
    p_operational_review_status: 'reviewing',
    p_accepted_cancellation: true,
    p_accepted_terms: true,
    p_idempotency_key: idempotencyKey,
  }

  const { data: firstDraft, error: firstError } = await owner.rpc('save_own_booking_draft', draftParameters)
  if (firstError) fail('本人保存 TEST 草稿失败', firstError)
  draftId = firstDraft

  const { data: repeatedDraft, error: repeatError } = await owner.rpc('save_own_booking_draft', draftParameters)
  if (repeatError || repeatedDraft !== draftId) fail('草稿幂等重试失败', repeatError)

  const { data: ownerRows, error: ownerError } = await owner.from('booking_drafts').select('id').eq('id', draftId)
  if (ownerError || ownerRows.length !== 1) fail('本人无法读取自己的草稿', ownerError)

  const { data: otherRows, error: otherError } = await other.from('booking_drafts').select('id').eq('id', draftId)
  if (otherError || otherRows.length !== 0) fail('无关乘客草稿隔离失败', otherError)

  const { data: operationRows, error: operationError } = await operations.rpc('get_operations_booking_drafts')
  if (operationError) fail('运营安全摘要读取失败', operationError)
  const summary = operationRows.find((row) => row.draft_id === draftId)
  if (!summary || summary.seat_impact !== 4 || summary.operational_review_status !== 'reviewing') {
    fail('运营安全摘要缺少 TEST 草稿或计数错误')
  }
  const serializedSummary = JSON.stringify(summary)
  for (const privateValue of ['TEST 乘客', 'TEST-NOT-A-PHONE', 'TEST-EMERGENCY', 'TEST PRIVATE NOTE']) {
    if (serializedSummary.includes(privateValue)) fail('运营安全摘要泄露了私密原始字段')
  }

  const { error: mismatchError } = await owner.rpc('save_own_booking_draft', {
    ...draftParameters,
    p_adults: 1,
  })
  if (!mismatchError || !mismatchError.message.includes('idempotency parameter mismatch')) {
    fail('相同幂等键的参数冲突未被拒绝')
  }

  console.log('REMOTE_BOOKING_DRAFT=PASS')
  console.log('OWNER_READ=PASS')
  console.log('UNRELATED_PASSENGER_ISOLATION=PASS')
  console.log('OPERATIONS_SAFE_PROJECTION=PASS')
  console.log('IDEMPOTENCY=PASS')
} finally {
  await Promise.allSettled([owner.auth.signOut(), other.auth.signOut(), operations.auth.signOut()])
  console.log('TEST_FIXTURE_CLEANUP=REQUIRES_SQL_EDITOR')
}
