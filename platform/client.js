import { platformConfig } from './config.js';

let clientPromise;

export function isPlatformConfigured() {
  return Boolean(platformConfig.supabaseUrl && platformConfig.supabaseAnonKey);
}

export async function getClient() {
  if (!isPlatformConfigured()) return null;
  if (!clientPromise) {
    clientPromise = import('https://esm.sh/@supabase/supabase-js@2.58.0')
      .then(({ createClient }) => createClient(platformConfig.supabaseUrl, platformConfig.supabaseAnonKey));
  }
  return clientPromise;
}
