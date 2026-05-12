-- Fix Glenn's surname: Mayes, not Mercer. The Phase 1 seed had the wrong
-- value because Claude guessed and Sean didn't catch it until later.
-- Idempotent — only flips the row if it still says Mercer.

UPDATE public.email_user_aliases
SET display_name = 'Glenn Mayes'
WHERE user_email = 'glenn.m@nextkey.com.au'
  AND display_name = 'Glenn Mercer';
