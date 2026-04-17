const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseDispatchNo(subject) {
  const match = subject.match(/\[#(DISP\d+)#\]/);
  return match ? match[1] : null;
}

function parseFlightInfo(text) {
  const dep   = text.match(/DEP[:\s]+([A-Z]{4})/)?.[1] || '';
  const dest  = text.match(/DEST[:\s]+([A-Z]{4})/)?.[1] || '';
  const date  = text.match(/(\d{2}\s+\w{3}\s+\d{4})/)?.[1] || '';
  const std   = text.match(/STD[:\s]+([\d:]+)/)?.[1] || '';
  const eta   = text.match(/ETA[:\s]+([\d:]+)/)?.[1] || '';
  const fob   = text.match(/FOB[:\s]+([\d,]+)/)?.[1] || '';
  const route = text.match(/ROUTE[:\s]+(.+)/)?.[1] || '';
  return { dep, dest, date, std, eta, fob, route };
}

async function processEmail(subject, text) {
  const dispatchNo = parseDispatchNo(subject);
  if (!dispatchNo) return;

  console.log(`Processing: ${dispatchNo}`);

  const { data: existing } = await supabase
    .from('plans')
    .select('id')
    .eq('dispatch_no', dispatchNo)
    .single();

  const flightInfo = parseFlightInfo(text);

  if (!existing) {
    const { data: plan } = await supabase.from('plans').insert({
      dispatch_no: dispatchNo,
      subject,
      ...flightInfo,
      status: 'available'
    }).select().single();

    await supabase.from('plan_versions').insert({
      plan_id: plan.id,
      dispatch_no: dispatchNo,
      version_no: 1,
      raw_text: text
    });

    console.log(`New plan added: ${dispatchNo}`);
  } else {
    const { count } = await supabase
      .from('plan_versions')
      .select('*', { count: 'exact' })
      .eq('dispatch_no', dispatchNo);

    await supabase.from('plan_versions').insert({
      plan_id: existing.id,
      dispatch_no: dispatchNo,
      version_no: (count || 0) + 1,
      raw_text: text
    });

    console.log(`Plan updated: ${dispatchNo} v${(count || 0) + 1}`);
  }
}

async function main() {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: 'raporturetildi@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    logger: false,
  });

  await client.connect();

  const lock = await client.getMailboxLock('INBOX');
  try {
    for await (const message of client.fetch(
      { subject: 'TC-REC Flight Briefing Package' },
      { source: true }
    )) {
      const parsed = await simpleParser(message.source);
      const subject = parsed.subject || '';
      const text    = parsed.text || '';
      if (subject.includes('TC-REC Flight Briefing Package')) {
        await processEmail(subject, text);
      }
    }
  } finally {
    lock.release();
  }

  await client.logout();
  console.log('Done.');
}

main().catch(console.error);