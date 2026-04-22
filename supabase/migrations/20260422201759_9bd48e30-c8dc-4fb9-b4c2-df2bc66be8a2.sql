-- App settings table for cost center name and global UI preferences
CREATE TABLE public.app_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cost_center_name TEXT NOT NULL DEFAULT 'Kostnadssenter XYZ',
  default_unit TEXT NOT NULL DEFAULT 'tNOK',
  singleton BOOLEAN NOT NULL DEFAULT true UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read app_settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Public insert app_settings" ON public.app_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update app_settings" ON public.app_settings FOR UPDATE USING (true);
CREATE POLICY "Public delete app_settings" ON public.app_settings FOR DELETE USING (true);

CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default row
INSERT INTO public.app_settings (cost_center_name, default_unit) 
VALUES ('Kostnadssenter XYZ', 'tNOK');