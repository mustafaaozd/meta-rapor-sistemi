// ============================================================================
// SUPABASE BAĞLANTI AYARLARI
// Supabase panelinden (Project Settings > API) aldığın bilgileri
// aşağıdaki iki satıra yapıştır. Kurulum adımları README.md dosyasında.
// ============================================================================

const SUPABASE_URL = "https://llwinuyajmuxfrhlgasm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Af3pfedzivRbXJr1tIUbCA_xtB02ekZ";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Video depolama bucket adları (schema.sql ile birebir uyumlu olmalı)
const VIDEO_BUCKET = "hook-videos";
const LOGO_BUCKET = "brand-logos";
const CREATIVE_BUCKET = "creatives";
