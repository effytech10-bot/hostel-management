"use server";

import { revalidatePath } from "next/cache";
import { admissionSchema, studentPasswordSchema, transferSchema, updateProfileSchema } from "@/lib/validation/students";
import { requireRole } from "@/server/auth/session";
import type { ActionState } from "@/server/errors";
import { formToObject, runForm } from "@/server/forms";
import { photoFromForm } from "@/server/storage";
import {
  admitStudent,
  resetStudentPassword,
  transferSeat,
  updateStudentProfile,
  type AdmissionResult,
} from "@/server/services/students";

function refresh() {
  revalidatePath("/admin/students", "layout");
  revalidatePath("/cashier/students", "layout");
  revalidatePath("/admin/buildings", "layout");
  revalidatePath("/admin");
}

export type AdmissionState = ActionState & { admitted?: AdmissionResult };

export async function admitStudentAction(_prev: AdmissionState, formData: FormData): Promise<AdmissionState> {
  const actor = await requireRole("admin", "cashier");
  const { state, value } = await runForm(admissionSchema, formToObject(formData), (data) =>
    admitStudent(actor, data, photoFromForm(formData.get("photo"))),
  );
  if (!value) return state;
  refresh();
  return { ok: true, admitted: value };
}

export async function updateStudentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin", "cashier");
  const { state } = await runForm(updateProfileSchema, formToObject(formData), (data) =>
    updateStudentProfile(actor, data, photoFromForm(formData.get("photo"))),
  );
  if (state.ok) refresh();
  return state.ok ? { ok: true, message: "Profile saved." } : state;
}

export async function transferSeatAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin", "cashier");
  const { state } = await runForm(transferSchema, formToObject(formData), (data) => transferSeat(actor, data));
  if (state.ok) refresh();
  return state.ok ? { ok: true, message: "Seat / rent updated." } : state;
}

export async function resetStudentPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole("admin", "cashier");
  const { state, value } = await runForm(studentPasswordSchema, formToObject(formData), (data) =>
    resetStudentPassword(actor, data),
  );
  return value ? { ok: true, message: value } : state;
}
