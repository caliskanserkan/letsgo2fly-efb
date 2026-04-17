const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const imap = new Imap({
  user: 'raporturetildi@gmail.com',
  password: process.env.GMAIL_APP_PASSWORD,
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
});

function parseDispatchNo(subject) {
  const match = subject.match(/\[#(DISP\d+)#\]/);
  return match ? match[1] : null;
}

function parseFlightInfo(text) {
  // Basit parser — PDF text'inden bilgi çıkar
  const dep   = text.match(/DEP[:\s]+([A-Z]{4})/)?.[1] || '';
  const dest  = text.match(/DEST[:\s]+([A-Z]{4})/)?.[1] || '';
  const date  = text.match(/(\d{2}\s+\w{3}\s+\d{4})/)?.[1] || '';
  const std   = text.match(/STD[:\s]+([\d:]+)/)?.[1] || '';
  const eta   = text.match(/ETA[:\s]+([\d:]+)/)?.[1] || '';
  const fob   = text.match(/FOB[:\s]+([\d,]+)/)?.[1] || '';
  const route = text.match(/ROUTE[:\s]+(.+)/)?.[1] || '';
  return { dep, dest, date, std, eta, fob, route };
}

async function processEmail(subject, pdfText) {
  const dispatchNo = parseDispatchNo(subject);
  if (!dispatchNo) return;

  console.log(`Processing: ${dispatchNo}`);

  // Aynı dispatch no var mı kontrol et
  const { data: existing } = await supabase
    .from('plans')
    .select('id')
    .eq('dispatch_no', dispatchNo)
    .single();

  const flightInfo = parseFlightInfo(pdfText);

  if (!existing) {
    // Yeni plan ekle
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
      raw_text: pdfText
    });

    console.log(`New plan added: ${dispatchNo}`);
  } else {
    // Güncelleme — yeni versiyon ekle
    const { count } = await supabase
      .from('plan_versions')
      .select('*', { count: 'exact' })
      .eq('dispatch_no', dispatchNo);

    await supabase.from('plan_versions').insert({
      plan_id: existing.id,
      dispatch_no: dispatchNo,
      version_no: (count || 0) + 1,
      raw_text: pdfText
    });

    console.log(`Plan updated: ${dispatchNo} v${(count || 0) + 1}`);
  }
}

function fetchEmails() {
  imap.once('ready', () => {
    imap.openBox('INBOX', false, (err, box) => {
      if (err) throw err;

      imap.search(['UNSEEN', ['SUBJECT', 'TC-REC Flight Briefing Package']], (err, results) => {
        if (err || !results.length) {
          console.log('No new plans found.');
          imap.end();
          return;
        }

        const f = imap.fetch(results, { bodies: '', struct: true });

        f.on('message', (msg) => {
          msg.on('body', (stream) => {
            simpleParser(stream, async (err, parsed) => {
              if (err) return;
              const subject = parsed.subject || '';
              const text    = parsed.text || '';
              await processEmail(subject, text);
            });
          });
        });

        f.once('end', () => {
          imap.end();
        });
      });
    });
  });

  imap.once('error', (err) => console.error('IMAP error:', err));
  imap.once('end', () => console.log('Done.'));
  imap.connect();
}

fetchEmails();