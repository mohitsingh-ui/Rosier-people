"use client";
import { ActionForm, Input, Submit, FormActions } from "@/components/ui/form";
import { changePassword } from "@/server/auth";

export function PasswordForm() {
  return (
    <ActionForm action={changePassword} success="Password updated">
      <Input label="Current password" name="current" type="password" autoComplete="current-password" required />
      <Input label="New password" name="password" type="password" autoComplete="new-password" required minLength={10} hint="At least 10 characters with letters and numbers" />
      <Input label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />
      <FormActions><Submit>Update password</Submit></FormActions>
    </ActionForm>
  );
}
