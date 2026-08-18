const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !isHttpUrl(url)) {
  throw new Error(
    'Missing or invalid VITE_SUPABASE_URL. Copy .env.example to .env and set it.'
  )
}
if (!key || key.length < 10) {
  throw new Error(
    'Missing or invalid VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env and set it.'
  )
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export const supabaseUrl = url
export const supabasePublishableKey = key