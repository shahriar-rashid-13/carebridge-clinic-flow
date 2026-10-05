-- Fixes for the Supabase security and performance advisors (see docs/supabase-advisors.md).
-- Behaviour for signed-in users is unchanged; only anonymous access, per-row re-evaluation,
-- duplicate indexes, and missing foreign key indexes change.

-- 1. Trigger functions without a fixed search_path.
alter function public.guard_profile_role_change() set search_path = public;
alter function public.guard_appointment_update() set search_path = public;

-- 2. SECURITY DEFINER functions must not run for anonymous callers.
revoke execute on function public.get_user_role() from public, anon;
grant execute on function public.get_user_role() to authenticated;

revoke execute on function public.promote_patient_to_doctor(uuid, text, numeric, text[], text[], boolean, text, text) from public, anon;
revoke execute on function public.promote_patient_to_receptionist(uuid) from public, anon;

-- 3. Internal functions: handle_new_user runs as the auth.users trigger and rls_auto_enable as an
-- event trigger, so no API role needs to call them directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- 4. Evaluate auth.uid() and get_user_role() once per query instead of once per row.
alter policy "Users can create their own AI conversations" on public.ai_conversations
  with check (user_id = (select auth.uid()));
alter policy "Users can delete their own AI conversations" on public.ai_conversations
  using (user_id = (select auth.uid()));
alter policy "Users can update their own AI conversations" on public.ai_conversations
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy "Users can view their own AI conversations" on public.ai_conversations
  using (user_id = (select auth.uid()));

alter policy "Users can create their own AI messages" on public.ai_messages
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.ai_conversations conversation
      where conversation.id = ai_messages.conversation_id
        and conversation.user_id = (select auth.uid())
    )
  );
alter policy "Users can view their own AI messages" on public.ai_messages
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.ai_conversations conversation
      where conversation.id = ai_messages.conversation_id
        and conversation.user_id = (select auth.uid())
    )
  );

alter policy "Users can view their own AI pending actions" on public.ai_pending_actions
  using (user_id = (select auth.uid()));

alter policy "Users mark own notifications read" on public.notifications
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));
alter policy "Users read own notifications" on public.notifications
  using (recipient_id = (select auth.uid()));

alter policy "Patients and reception read waitlist" on public.waitlist
  using (patient_id = (select auth.uid()) or (select public.get_user_role()) = 'receptionist');
alter policy "Patients and reception read offers" on public.waitlist_offers
  using (patient_id = (select auth.uid()) or (select public.get_user_role()) = 'receptionist');

-- 5. Duplicate unique indexes; the *_key indexes back the unique constraints and stay.
drop index public.bills_appointment_id_unique;
drop index public.prescriptions_appointment_id_unique;

-- 6. Foreign keys without a covering index.
create index if not exists appointment_followups_resolved_by_idx on public.appointment_followups (resolved_by);
create index if not exists notifications_appointment_id_idx on public.notifications (appointment_id);
create index if not exists waitlist_offers_appointment_id_idx on public.waitlist_offers (appointment_id);
create index if not exists waitlist_offers_patient_id_idx on public.waitlist_offers (patient_id);
create index if not exists waitlist_offers_waitlist_id_idx on public.waitlist_offers (waitlist_id);
