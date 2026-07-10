import { Resend } from 'resend';
import { email as emailConfig } from '../config';
import { sanitizeSubject } from './subject';

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
    // inherits them (RFC 5322 998-char line limit; see sanitizeSubject).
    // Callers own presentation-level truncation.
    subject: sanitizeSubject(input.subject, 998),
    html: input.html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }

  return data;
}
