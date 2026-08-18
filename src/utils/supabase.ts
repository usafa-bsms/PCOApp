import { createClient } from '@supabase/supabase-js'
import { supabaseUrl, supabasePublishableKey } from '../env'

export const supabase = createClient(supabaseUrl, supabasePublishableKey)