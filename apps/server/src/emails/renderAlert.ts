import { render } from '@react-email/render';
import { PropertyAlertEmail, type PropertyAlertEmailProps } from './PropertyAlertEmail';

export type { AlertItem, PropertyAlertEmailProps } from './PropertyAlertEmail';

export async function renderAlertEmail(props: PropertyAlertEmailProps): Promise<string> {
  return render(PropertyAlertEmail(props));
}
