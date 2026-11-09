-- Private bucket for recorded sales calls (Glenn's work phone, 0477 201 245).
-- Written by Elvis's call recorder (service role) under leads/<lead_id>/<file>.mp3; read only through
-- GET /api/opportunities/[id]/recording, which signs a 10-minute URL. No public access, no policies:
-- the service role bypasses storage RLS and nothing else should reach these files.
-- 25 MB covers about 100 minutes of 32 kbps mono MP3.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('call-recordings', 'call-recordings', false, 26214400, array['audio/mpeg', 'audio/wav', 'audio/mp4'])
on conflict (id) do nothing;
