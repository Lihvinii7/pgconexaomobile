import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nbruivedpqeqycgkaegi.supabase.co';
const supabaseAnonKey = 'sb_publishable_RiM6NG2oO2PqxYfCM33MWg_IxTXMOG3';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);