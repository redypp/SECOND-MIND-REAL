// IMPORTANT: Re-exports from app-client to ensure a single Supabase client
// instance is used across all app code (auth context, data-fetching hooks).
// Having two separate instances causes onAuthStateChange to fire on the wrong
// client after OAuth sign-in, breaking Google/Apple login.
//
// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export { supabase } from './app-client';