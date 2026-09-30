import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClinicProvider, useClinic } from "@/lib/clinic/store";
import {
  authFor,
  clinicRows,
  MARCUS_DOCTOR_ID,
  MARCUS_USER_ID,
  SARAH_ID,
  TOM_ID,
} from "../helpers/clinic-fixtures";
import { memoryDb } from "../helpers/memory-db";

const { fake } = await vi.hoisted(async () => import("../helpers/supabase"));
const auth = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));

vi.mock("@/lib/supabase/client", () => ({ supabase: fake.client }));
vi.mock("@/lib/auth/store", () => ({ useAuth: () => auth.state }));

type Clinic = ReturnType<typeof useClinic>;

let db: ReturnType<typeof memoryDb>;

const renderClinic = async (role: "patient" | "doctor" | "receptionist") => {
  auth.state = authFor(role);
  const ref: { current: Clinic | null } = { current: null };
  function Probe() {
    ref.current = useClinic();
    return <p>clinic ready</p>;
  }
  render(
    <ClinicProvider>
      <Probe />
    </ClinicProvider>,
  );
  await screen.findByText("clinic ready");
  return () => ref.current!;
};

const lastQuery = (table: string, op: string) =>
  [...fake.queries].reverse().find((query) => query.table === table && query.op === op);

beforeEach(() => {
  fake.reset();
  db = memoryDb(clinicRows());
  fake.onQuery(db.handler);
});

it("useClinic throws outside ClinicProvider", () => {
  const Broken = () => {
    useClinic();
    return null;
  };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  expect(() => render(<Broken />)).toThrow("useClinic must be used inside ClinicProvider");
});

describe("loading", () => {
  it("loads and maps clinic data", async () => {
    const clinic = await renderClinic("patient");
    expect(clinic().doctors).toHaveLength(1);
    expect(clinic().doctors[0]).toMatchObject({
      name: "Dr. Marcus Vance",
      days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    });
    expect(clinic().patients.map((patient) => patient.id)).toEqual([SARAH_ID, TOM_ID]);
    expect(clinic().invoices[0]).toMatchObject({
      id: "INV-1001",
      databaseId: "bill-uuid-1",
      doctorId: MARCUS_DOCTOR_ID,
    });
    expect(clinic().currentPatient.name).toBe("Sarah Jenkins");
  });

  it("shows an error screen and retries", async () => {
    let failing = true;
    fake.onQuery((query) =>
      failing && query.table === "bills"
        ? { error: new Error("permission denied") }
        : db.handler(query),
    );
    auth.state = authFor("patient");
    render(
      <ClinicProvider>
        <p>clinic ready</p>
      </ClinicProvider>,
    );

    expect(await screen.findByText("Clinic data could not be loaded")).toBeInTheDocument();
    expect(screen.getByText("Loading bills failed: permission denied")).toBeInTheDocument();

    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("clinic ready")).toBeInTheDocument();
  });
});

describe("patient actions", () => {
  it("isSlotTaken ignores cancelled appointments", async () => {
    const clinic = await renderClinic("patient");
    expect(clinic().isSlotTaken(MARCUS_DOCTOR_ID, "2026-10-05", "09:00 AM")).toBe(true);
    expect(clinic().isSlotTaken(MARCUS_DOCTOR_ID, "2026-10-05", "10:00 AM")).toBe(false);
  });

  it("books an appointment as requested", async () => {
    const clinic = await renderClinic("patient");

    await act(() =>
      clinic().bookAppointment({
        patientId: SARAH_ID,
        doctorId: MARCUS_DOCTOR_ID,
        date: "2026-10-06",
        slot: "11:00 AM",
        reason: "Headache",
        notes: "",
      }),
    );

    expect(lastQuery("appointments", "insert")?.payload).toEqual({
      patient_id: SARAH_ID,
      doctor_id: MARCUS_DOCTOR_ID,
      appointment_date: "2026-10-06",
      time_slot: "11:00 AM",
      reason: "Headache",
      notes: "",
      status: "requested",
    });
    expect(clinic().appointments[0]).toMatchObject({ reason: "Headache", status: "Requested" });
    expect(clinic().isSlotTaken(MARCUS_DOCTOR_ID, "2026-10-06", "11:00 AM")).toBe(true);
  });

  it("explains a double-booked slot", async () => {
    const clinic = await renderClinic("patient");
    fake.onQuery((query) =>
      query.table === "appointments" && query.op === "insert"
        ? {
            error: {
              code: "23505",
              constraint: "appointments_active_slot_unique",
              message: "duplicate",
            },
          }
        : db.handler(query),
    );

    await expect(
      clinic().bookAppointment({
        patientId: SARAH_ID,
        doctorId: MARCUS_DOCTOR_ID,
        date: "2026-10-05",
        slot: "09:00 AM",
        reason: "x",
        notes: "",
      }),
    ).rejects.toThrow(
      "This time slot was just booked by another patient. Please choose another slot.",
    );
  });

  it("rejects a blank profile name", async () => {
    const clinic = await renderClinic("patient");
    await expect(
      clinic().updatePatientProfile({
        fullName: "   ",
        phone: "",
        gender: "",
        dateOfBirth: "",
        bloodType: "",
        allergies: [],
        conditions: [],
        address: "",
        emergencyContactName: "",
        emergencyContactRelation: "",
        emergencyContactPhone: "",
      }),
    ).rejects.toThrow("Full name cannot be empty.");
  });

  it("updates the own profile with trimmed values", async () => {
    const clinic = await renderClinic("patient");

    await act(() =>
      clinic().updatePatientProfile({
        fullName: " Sarah J. ",
        phone: " 555-0100 ",
        gender: "Female",
        dateOfBirth: "",
        bloodType: "O+",
        allergies: ["Penicillin"],
        conditions: [],
        address: " 1 Main St ",
        emergencyContactName: "Tom",
        emergencyContactRelation: "Brother",
        emergencyContactPhone: "555-0101",
      }),
    );

    const update = lastQuery("profiles", "update");
    expect(update?.filters).toContainEqual({ method: "eq", args: ["id", SARAH_ID] });
    expect(update?.payload).toMatchObject({
      full_name: "Sarah J.",
      phone: "555-0100",
      date_of_birth: null,
      address: "1 Main St",
    });
    expect(clinic().currentPatient).toMatchObject({ name: "Sarah J.", allergies: ["Penicillin"] });
  });
});

describe("doctor actions", () => {
  it("resolves the signed-in doctor", async () => {
    const clinic = await renderClinic("doctor");
    expect(clinic().currentDoctorId).toBe(MARCUS_DOCTOR_ID);
    expect(clinic().currentDoctor.name).toBe("Dr. Marcus Vance");
  });

  it("completes a consultation with a prescription", async () => {
    const clinic = await renderClinic("doctor");
    const medications = [
      { name: "Aspirin", dosage: "75mg", frequency: "daily", duration: "30 days" },
    ];

    await act(() =>
      clinic().completeConsultation({
        appointmentId: "a-requested",
        diagnosis: "Angina",
        medications,
        notes: "Rest",
      }),
    );

    expect(lastQuery("prescriptions", "insert")?.payload).toEqual({
      appointment_id: "a-requested",
      doctor_id: MARCUS_DOCTOR_ID,
      patient_id: SARAH_ID,
      diagnosis: "Angina",
      notes: "Rest",
      medicines: JSON.stringify(medications),
    });
    expect(lastQuery("appointments", "update")?.payload).toEqual({ status: "completed" });
    expect(clinic().appointments.find((item) => item.id === "a-requested")?.status).toBe(
      "Completed",
    );
    expect(clinic().prescriptions[0]?.medications).toEqual(medications);
  });

  it("refuses a second prescription for the same appointment", async () => {
    const clinic = await renderClinic("doctor");
    await expect(
      clinic().completeConsultation({
        appointmentId: "a-completed",
        diagnosis: "x",
        medications: [],
        notes: "",
      }),
    ).rejects.toThrow("This appointment already has a prescription. It cannot be submitted again.");
    expect(lastQuery("prescriptions", "insert")).toBeUndefined();
  });
});

describe("receptionist actions", () => {
  it("confirms an appointment", async () => {
    const clinic = await renderClinic("receptionist");
    await act(() => clinic().setAppointmentStatus("a-requested", "Confirmed"));
    expect(lastQuery("appointments", "update")?.payload).toEqual({ status: "confirmed" });
    expect(clinic().appointments.find((item) => item.id === "a-requested")?.status).toBe(
      "Confirmed",
    );
  });

  it("reschedules and confirms in one step", async () => {
    const clinic = await renderClinic("receptionist");
    await act(() => clinic().rescheduleAppointment("a-requested", "2026-10-07", "10:00 AM"));
    expect(lastQuery("appointments", "update")?.payload).toEqual({
      appointment_date: "2026-10-07",
      time_slot: "10:00 AM",
      status: "confirmed",
    });
    expect(clinic().appointments.find((item) => item.id === "a-requested")).toMatchObject({
      date: "2026-10-07",
      slot: "10:00 AM",
      status: "Confirmed",
    });
  });

  it("creates an unpaid invoice totalling its items", async () => {
    const clinic = await renderClinic("receptionist");
    await act(() =>
      clinic().createInvoice("a-requested", [
        { label: "Consultation", amount: 80 },
        { label: "ECG", amount: 45.5 },
      ]),
    );
    expect(lastQuery("bills", "insert")?.payload).toMatchObject({
      appointment_id: "a-requested",
      patient_id: SARAH_ID,
      amount: 125.5,
      status: "unpaid",
    });
    expect(clinic().invoices[0]).toMatchObject({
      total: 125.5,
      status: "Unpaid",
      doctorId: MARCUS_DOCTOR_ID,
    });
  });

  it("marks an invoice paid by its database id", async () => {
    const clinic = await renderClinic("receptionist");
    await act(() => clinic().markInvoicePaid("INV-1001", "Card"));
    const update = lastQuery("bills", "update");
    expect(update?.filters).toContainEqual({ method: "eq", args: ["id", "bill-uuid-1"] });
    expect(update?.payload).toMatchObject({ status: "paid", payment_method: "Card" });
    expect(clinic().invoices[0]).toMatchObject({ status: "Paid", method: "Card" });
  });

  it("toggles doctor availability", async () => {
    const clinic = await renderClinic("receptionist");
    await act(() => clinic().toggleDoctorActive(MARCUS_DOCTOR_ID));
    expect(lastQuery("doctors", "update")?.payload).toEqual({ status: "inactive" });
    expect(clinic().doctors[0]).toMatchObject({ active: false, name: "Dr. Marcus Vance" });
  });

  it("updates a doctor schedule and profile name", async () => {
    const clinic = await renderClinic("receptionist");
    const doctor = clinic().doctors[0]!;

    await act(() =>
      clinic().upsertDoctor({
        ...doctor,
        name: " Dr. M. Vance ",
        days: ["Friday", "Mon"],
        slots: ["2:00pm", "02:00 PM"],
      }),
    );

    expect(lastQuery("doctors", "update")?.payload).toMatchObject({
      available_days: ["Mon", "Fri"],
      slots: ["02:00 PM"],
      status: "active",
    });
    const profileUpdate = lastQuery("profiles", "update");
    expect(profileUpdate?.payload).toEqual({ full_name: "Dr. M. Vance" });
    expect(profileUpdate?.filters).toContainEqual({ method: "eq", args: ["id", MARCUS_USER_ID] });
  });

  it("refuses to add a doctor without a profile", async () => {
    const clinic = await renderClinic("receptionist");
    await expect(clinic().upsertDoctor({ ...clinic().doctors[0]!, id: "new-1" })).rejects.toThrow(
      "A doctor must have an existing authenticated profile before they can be added.",
    );
  });

  it("promotes a patient to doctor through the RPC", async () => {
    const clinic = await renderClinic("receptionist");
    fake.onRpc(() => ({
      data: {
        id: "d-new",
        user_id: TOM_ID,
        specialization: "Dermatology",
        status: "active",
        profile: { full_name: "Tom Baker" },
      },
    }));

    await act(() =>
      clinic().promotePatientToDoctor({
        profileId: TOM_ID,
        specialization: " Dermatology ",
        consultationFee: 60,
        availableDays: ["Tuesday"],
        slots: ["9:00am"],
        active: true,
        bio: "",
        room: " 105 ",
      }),
    );

    expect(fake.rpcs[0]).toEqual({
      name: "promote_patient_to_doctor",
      args: {
        p_target_profile_id: TOM_ID,
        p_specialization: "Dermatology",
        p_consultation_fee: 60,
        p_available_days: ["Tue"],
        p_slots: ["09:00 AM"],
        p_active: true,
        p_bio: "",
        p_room: "105",
      },
    });
    expect(clinic().doctors.map((doctor) => doctor.name)).toContain("Tom Baker");
    expect(clinic().patients.map((patient) => patient.id)).not.toContain(TOM_ID);
  });
});
