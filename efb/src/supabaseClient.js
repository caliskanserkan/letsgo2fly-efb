import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

export { supabase };

// ─── AMC 20-25 Compliant Event Logger ────────────────────────────────────────
export async function logEvent(planId, action, details = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('flight_logs').insert({
      plan_id:  planId  || null,
      pilot_id: user?.id || null,
      action,
      details: {
        ...details,
        platform: /iPad|iPhone/.test(navigator.userAgent) ? 'iPad' : 'Browser',
        timestamp_utc: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.warn('logEvent failed:', e);
  }
}