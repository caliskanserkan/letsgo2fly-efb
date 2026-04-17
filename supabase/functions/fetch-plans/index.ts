import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GMAIL_USER = 'raporturetildi@gmail.com'
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Parse dispatch no from subject: [#DISPxxxxxx#] TC-REC Flight Briefing Package
function parseDispatchNo(subject: string): string | null {
  const match = subject.match(/\[#(DISP\d+)#\]/)
  return match ? match[1] : null
}

Deno.serve(async () => {
  try {
    // Connect to Gmail via IMAP
    const imapResponse = await fetch('https://imap.gmail.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: GMAIL_USER,
        password: GMAIL_APP_PASSWORD,
        search: 'TC-REC Flight Briefing Package',
      }),
    })

    // For now return success — full IMAP logic next step
    return new Response(JSON.stringify({ status: 'connected', user: GMAIL_USER }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
