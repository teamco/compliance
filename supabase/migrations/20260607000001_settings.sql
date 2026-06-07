-- supabase/migrations/20260607000001_settings.sql

-- User preference columns on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme      text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS language   text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{}';

-- Push subscriptions (one per browser/device per user)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint   text        NOT NULL UNIQUE,
  keys       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_subscriptions: own select"
  ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "push_subscriptions: own insert"
  ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_subscriptions: own delete"
  ON public.push_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- In-app notifications (populated in Plan 2 when workflow transitions occur)
CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type       text        NOT NULL,
  payload    jsonb       NOT NULL DEFAULT '{}',
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications: own select"
  ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notifications: own update"
  ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
