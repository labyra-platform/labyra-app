import { redirect } from 'next/navigation';

export default async function SettingsIndex() {
  redirect('/dashboard/settings/account');
}
