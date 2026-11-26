-- Verbatim from supabase/migrations/0022_create_platform_friends_and_farm_assists.sql
CREATE TABLE IF NOT EXISTS public.platform_friendships (
  user_a_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  blocked_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_a_id, user_b_id),
  CONSTRAINT platform_friendships_ordered_pair CHECK (user_a_id < user_b_id),
  CONSTRAINT platform_friendships_blocker_check CHECK (
    (status = 'active' AND blocked_by_user_id IS NULL) OR
    (status = 'blocked' AND blocked_by_user_id IN (user_a_id, user_b_id))
  )
);
