import { Resend } from 'resend';
import { email as emailConfig } from '../config';

let client: Resend | null = null;

function getClient(): Resend {
  if (!client) {
    client = new Resend(emailConfig.resendApiKey);
  }
  return client;
}

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(input: SendEmailInput) {
  const { data, error } = await getClient().emails.send({
    from: emailConfig.fromAddress,
    to: input.to,
    // Transport invariants enforced at the sink so every future caller
    // inherits them: no control chars in a header (CRLF injection hygiene —
    // Resend is a JSON API, but its MIME handling isn't ours to trust) and
    // no subject past the RFC 5322 998-char line limit (providers reject the
    // send). Callers own presentation-level truncation.
    subject: input.subject.replace(/[\x00-\x1f\x7f]+/g, ' ').trim().slice(0, 998),
    html: input.html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }

  return data;
}
