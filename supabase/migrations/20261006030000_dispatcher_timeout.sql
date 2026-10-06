-- A full batch of 20 emails takes about 15 to 20 seconds because sends are
-- spaced for Resend's rate limit, so give the cron HTTP call 30 seconds.
select cron.schedule(
  'message-dispatcher',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/message-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatcher-token', (select decrypted_secret from vault.decrypted_secrets where name = 'dispatcher_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where extract(hour from now() at time zone 'Asia/Dhaka') between 8 and 21
    and exists (
    select 1 from public.message_outbox
    where (status = 'queued' and next_attempt_at <= now())
       or (status = 'sending' and updated_at < now() - interval '10 minutes')
  )
  $$
);
