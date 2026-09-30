-- ============================================================
-- ExpenseTracker — Full Schema
-- ============================================================

-- 1. User Profiles
CREATE TABLE user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  first_name text,
  last_name text,
  phone text,
  avatar_url text,
  date_of_birth date,
  bio text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. User Settings
CREATE TABLE user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'INR',
  locale text NOT NULL DEFAULT 'en-IN',
  date_format text NOT NULL DEFAULT 'DD MMM YYYY',
  month_start integer NOT NULL DEFAULT 1,
  monthly_budget numeric NOT NULL DEFAULT 65000,
  theme text NOT NULL DEFAULT 'light',
  notifications_enabled boolean NOT NULL DEFAULT true,
  budget_alert_threshold numeric NOT NULL DEFAULT 80
);

-- 3. Categories (per-user)
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  icon text DEFAULT 'Tag',
  color text DEFAULT '#64748b',
  is_default boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

-- 4. Transaction Types (per-user)
CREATE TABLE transaction_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#64748b',
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

-- 5. Person Tags (per-user)
CREATE TABLE person_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

-- 6. Investment Kinds (per-user)
CREATE TABLE investment_kinds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

-- 7. Transactions
CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  category text NOT NULL,
  type text NOT NULL,
  amount numeric NOT NULL,
  date date NOT NULL,
  person text NOT NULL DEFAULT 'Self',
  investment_kind text,
  recurring boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_transactions_user_date ON transactions (user_id, date DESC);
CREATE INDEX idx_transactions_user_type ON transactions (user_id, type);
CREATE INDEX idx_categories_user ON categories (user_id, sort_order);
CREATE INDEX idx_transaction_types_user ON transaction_types (user_id);
CREATE INDEX idx_person_tags_user ON person_tags (user_id);
CREATE INDEX idx_investment_kinds_user ON investment_kinds (user_id);

-- ============================================================
-- Enable RLS on ALL tables
-- ============================================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_kinds ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- ============================================================

-- user_profiles
CREATE POLICY "Users can view their own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- user_settings
CREATE POLICY "Users can view their own settings"
  ON user_settings FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own settings"
  ON user_settings FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- categories
CREATE POLICY "Users can manage their own categories"
  ON categories FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- transaction_types
CREATE POLICY "Users can manage their own transaction types"
  ON transaction_types FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- person_tags
CREATE POLICY "Users can manage their own person tags"
  ON person_tags FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- investment_kinds
CREATE POLICY "Users can manage their own investment kinds"
  ON investment_kinds FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- transactions
CREATE POLICY "Users can manage their own transactions"
  ON transactions FOR ALL
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================
-- Trigger: auto-populate defaults for new users
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create profile
  INSERT INTO public.user_profiles (user_id) VALUES (new.id);

  -- Create settings
  INSERT INTO public.user_settings (user_id) VALUES (new.id);

  -- Default categories
  INSERT INTO public.categories (user_id, name, icon, color, is_default, sort_order) VALUES
    (new.id, 'Home',          'Home',        '#6366f1', true, 1),
    (new.id, 'Food',          'UtensilsCrossed', '#f97316', true, 2),
    (new.id, 'Transport',     'Car',         '#3b82f6', true, 3),
    (new.id, 'Subscriptions', 'CreditCard',  '#8b5cf6', true, 4),
    (new.id, 'Health',        'Heart',       '#ef4444', true, 5),
    (new.id, 'Family',        'Users',       '#ec4899', true, 6),
    (new.id, 'Work',          'Briefcase',   '#0ea5e9', true, 7),
    (new.id, 'Shopping',      'ShoppingBag', '#14b8a6', true, 8),
    (new.id, 'Investments',   'TrendingUp',  '#d97706', true, 9),
    (new.id, 'Other',         'Tag',         '#64748b', true, 10);

  -- Default transaction types
  INSERT INTO public.transaction_types (user_id, name, color, is_default) VALUES
    (new.id, 'Income',     '#10b981', true),
    (new.id, 'Expense',    '#64748b', true),
    (new.id, 'Investment', '#d97706', true);

  -- Default person tags
  INSERT INTO public.person_tags (user_id, name, is_default) VALUES
    (new.id, 'Self',    true),
    (new.id, 'Family',  true),
    (new.id, 'Medical', true);

  -- Default investment kinds
  INSERT INTO public.investment_kinds (user_id, name, is_default) VALUES
    (new.id, 'SIP',    true),
    (new.id, 'Stocks', true),
    (new.id, 'FD',     true),
    (new.id, 'Gold',   true),
    (new.id, 'Crypto', true);

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger the function every time a user is created
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================
-- Storage bucket for avatars
-- ============================================================
-- Run in Supabase Dashboard → SQL Editor:
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- Then add storage policies:
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (select auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND (select auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND (select auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view avatars"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');
