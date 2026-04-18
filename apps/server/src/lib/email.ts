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
    subject: input.subject,
    html: input.html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }

  return data;
}
