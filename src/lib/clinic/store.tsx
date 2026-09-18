import * as React from "react";
import { useAuth } from "@/lib/auth/store";
import { supabase } from "@/lib/supabase/client";
import {
  appointmentStatusValue,
  mapAppointment,
  mapDoctor,
  mapInvoice,
  mapPrescription,
  mapProfileToPatient,
} from "./adapters";
import type {
  Appointment,
  Doctor,
  Invoice,
  InvoiceItem,
  Medication,
  Patient,
  Prescription,
  Role,
} from "./types";

type Row = Record<string, unknown>;

interface ClinicState {
  role: Role;
  setRole: (role: Role) => void;
  currentPatientId: string;
  currentDoctorId: string;
  setCurrentDoctorId: (id: string) => void;
  doctors: Doctor[];
  patients: Patient[];
  appointments: Appointment[];
  prescriptions: Prescription[];
  invoices: Invoice[];
  currentPatient: Patient;
  currentDoctor: Doctor;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  getDoctor: (id: string) => Doctor | undefined;
  getPatient: (id: string) => Patient | undefined;
  bookAppointment: (input: {
    patientId: string;
    doctorId: string;
    date: string;
    slot: string;
    reason: string;
    notes: string;
  }) => Promise<void>;
  setAppointmentStatus: (id: string, status: Appointment["status"]) => Promise<void>;
  rescheduleAppointment: (id: string, date: string, slot: string) => Promise<void>;
  completeConsultation: (input: {
    appointmentId: string;
    diagnosis: string;
    medications: Medication[];
    notes: string;
  }) => Promise<void>;
  upsertDoctor: (doctor: Doctor) => Promise<void>;
  toggleDoctorActive: (id: string) => Promise<void>;
  createInvoice: (appointmentId: string, items: InvoiceItem[]) => Promise<void>;
  markInvoicePaid: (id: string, method: string) => Promise<void>;
  isSlotTaken: (doctorId: string, date: string, slot: string) => boolean;
}

const ClinicContext = React.createContext<ClinicState | null>(null);

const emptyPatient = (id: string, name: string, email: string): Patient => ({
  id,
  name,
  email,
  phone: "",
  dob: "",
  gender: "",
  bloodType: "",
  allergies: [],
  conditions: [],
  address: "",
  emergency: { name: "", relation: "", phone: "" },
});

const emptyDoctor: Doctor = {
  id: "",
  name: "No doctor assigned",
  specialty: "",
  fee: 0,
  days: [],
  slots: [],
  active: false,
  bio: "",
  room: "",
};

const rowError = (operation: string, error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown Supabase error";
  return `${operation} failed: ${message}`;
};

const fetchClinicData = async (userId: string, userRole: Role) => {
  const [profilesResult, doctorsResult, appointmentsResult, prescriptionsResult, billsResult] =
    await Promise.all([
      supabase.from("profiles").select("*"),
      supabase
        .from("doctors")
        .select("*, profile:profiles!doctors_user_id_fkey(id, full_name, email, role)"),
      supabase.from("appointments").select("*"),
      supabase.from("prescriptions").select("*"),
      supabase.from("bills").select("*"),
    ]);

  const results = [
    ["Loading profiles", profilesResult.error],
    ["Loading doctors", doctorsResult.error],
    ["Loading appointments", appointmentsResult.error],
    ["Loading prescriptions", prescriptionsResult.error],
    ["Loading bills", billsResult.error],
  ] as const;
  const failed = results.find(([, error]) => error);
  if (failed?.[1]) throw new Error(rowError(failed[0], failed[1]));

  const profiles = (profilesResult.data ?? []) as Row[];
  const profileById = new Map(profiles.map((profile) => [String(profile.id), profile]));
  const doctorRows = (doctorsResult.data ?? []) as Row[];
  const doctors = doctorRows.map((doctor) =>
    mapDoctor(
      doctor,
      (doctor.profile as Row | null | undefined) ?? profileById.get(String(doctor.user_id)),
    ),
  );

  return {
    profiles,
    doctors,
    patients: profiles
      .filter((profile) => profile.role === "patient")
      .map(mapProfileToPatient),
    appointments: ((appointmentsResult.data ?? []) as Row[]).map(mapAppointment),
    prescriptions: ((prescriptionsResult.data ?? []) as Row[]).map(mapPrescription),
    invoices: ((billsResult.data ?? []) as Row[]).map((bill) => {
      const appointment = ((appointmentsResult.data ?? []) as Row[]).find(
        (item) => String(item.id) === String(bill.appointment_id),
      );
      return mapInvoice({ ...bill, doctor_id: appointment?.doctor_id });
    }),
    currentDoctorId:
      userRole === "doctor"
        ? String(doctorRows.find((doctor) => String(doctor.user_id) === userId)?.id ?? "")
        : "",
  };
};

export function ClinicProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, isAuthenticated, isLoading: authLoading } = useAuth();
  const [role, setRole] = React.useState<Role>(profile?.role ?? user?.role ?? "patient");
  const [currentDoctorId, setCurrentDoctorId] = React.useState("");
  const [doctors, setDoctors] = React.useState<Doctor[]>([]);
  const [patients, setPatients] = React.useState<Patient[]>([]);
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const [prescriptions, setPrescriptions] = React.useState<Prescription[]>([]);
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    if (profile?.role) setRole(profile.role);
  }, [profile?.role]);

  React.useEffect(() => {
    if (user?.role !== "doctor") {
      setCurrentDoctorId("");
      return;
    }
    void supabase
      .from("doctors")
      .select("id, user_id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error: doctorError }) => {
        if (doctorError) {
          setError(rowError("Resolving doctor identity", doctorError));
          return;
        }
        if (data?.id) setCurrentDoctorId(String(data.id));
      });
  }, [user?.id, user?.role]);

  React.useEffect(() => {
    if (authLoading || !isAuthenticated || !user) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchClinicData(user.id, user.role)
      .then((data) => {
        if (cancelled) return;
        setDoctors(data.doctors);
        setPatients(data.patients);
        setAppointments(data.appointments);
        setPrescriptions(data.prescriptions);
        setInvoices(data.invoices);
        setCurrentDoctorId(data.currentDoctorId);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Clinic data could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, reloadKey, user]);

  const reload = async () => {
    setReloadKey((key) => key + 1);
  };

  const currentPatientId = user?.id ?? "";
  const currentPatient =
    patients.find((patient) => patient.id === currentPatientId) ??
    (profile ? emptyPatient(profile.id, profile.full_name ?? user?.name ?? "", user?.email ?? "") : emptyPatient("", "", ""));
  const currentDoctor = doctors.find((doctor) => doctor.id === currentDoctorId) ?? emptyDoctor;

  const value: ClinicState = {
    role,
    setRole,
    currentPatientId,
    currentDoctorId,
    setCurrentDoctorId,
    doctors,
    patients,
    appointments,
    prescriptions,
    invoices,
    currentPatient,
    currentDoctor,
    loading,
    error,
    reload,
    getDoctor: (id) => doctors.find((doctor) => doctor.id === id),
    getPatient: (id) => patients.find((patient) => patient.id === id),

    bookAppointment: async (input) => {
      const { data, error: insertError } = await supabase
        .from("appointments")
        .insert({
          patient_id: currentPatientId,
          doctor_id: input.doctorId,
          appointment_date: input.date,
          time_slot: input.slot,
          reason: input.reason,
          notes: input.notes,
          status: "requested",
        })
        .select()
        .single();
      if (insertError) throw new Error(rowError("Booking appointment", insertError));
      setAppointments((items) => [mapAppointment(data as Row), ...items]);
    },

    setAppointmentStatus: async (id, status) => {
      const { data, error: updateError } = await supabase
        .from("appointments")
        .update({ status: appointmentStatusValue(status) })
        .eq("id", id)
        .select()
        .single();
      if (updateError) throw new Error(rowError("Updating appointment status", updateError));
      const updated = mapAppointment(data as Row);
      setAppointments((items) => items.map((item) => (item.id === id ? updated : item)));
    },

    rescheduleAppointment: async (id, date, slot) => {
      const { data, error: updateError } = await supabase
        .from("appointments")
        .update({ appointment_date: date, time_slot: slot, status: "confirmed" })
        .eq("id", id)
        .select()
        .single();
      if (updateError) throw new Error(rowError("Rescheduling appointment", updateError));
      const updated = mapAppointment(data as Row);
      setAppointments((items) => items.map((item) => (item.id === id ? updated : item)));
    },

    completeConsultation: async ({ appointmentId, diagnosis, medications, notes }) => {
      const appointment = appointments.find((item) => item.id === appointmentId);
      if (!appointment) throw new Error("The appointment could not be found.");
      if (prescriptions.some((prescription) => prescription.appointmentId === appointmentId)) {
        throw new Error("This appointment already has a prescription. It cannot be submitted again.");
      }
      const { data: prescriptionData, error: prescriptionError } = await supabase
        .from("prescriptions")
        .insert({
          appointment_id: appointmentId,
          doctor_id: appointment.doctorId,
          patient_id: appointment.patientId,
          diagnosis,
          notes,
          medicines: JSON.stringify(medications),
        })
        .select()
        .single();
      if (prescriptionError) {
        const duplicate = "code" in prescriptionError && prescriptionError.code === "23505";
        throw new Error(
          duplicate
            ? "This appointment already has a prescription. It cannot be submitted again."
            : rowError("Saving prescription", prescriptionError),
        );
      }

      const { data: appointmentData, error: appointmentError } = await supabase
        .from("appointments")
        .update({ status: "completed" })
        .eq("id", appointmentId)
        .select()
        .single();
      if (appointmentError) throw new Error(rowError("Completing appointment", appointmentError));

      setPrescriptions((items) => [mapPrescription(prescriptionData as Row), ...items]);
      const updatedAppointment = mapAppointment(appointmentData as Row);
      setAppointments((items) => items.map((item) => (item.id === appointmentId ? updatedAppointment : item)));
    },

    upsertDoctor: async (doctor) => {
      const existing = doctors.some((item) => item.id === doctor.id);
      if (!existing) {
        throw new Error("A doctor must have an existing authenticated profile before they can be added.");
      }
      const payload = {
        specialization: doctor.specialty,
        consultation_fee: doctor.fee,
        available_days: doctor.days,
        slots: doctor.slots,
        status: doctor.active ? "active" : "inactive",
        bio: doctor.bio,
        room: doctor.room,
      };
      const { data, error: doctorError } = await supabase
        .from("doctors")
        .update(payload)
        .eq("id", doctor.id)
        .select()
        .single();
      if (doctorError) throw new Error(rowError("Updating doctor", doctorError));
      const userId = (data as Row).user_id;
      if (userId && doctor.name.trim()) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ full_name: doctor.name.trim() })
          .eq("id", userId);
        if (profileError) throw new Error(rowError("Updating doctor profile", profileError));
      }
      const mapped = mapDoctor(data as Row);
      setDoctors((items) => items.map((item) => (item.id === mapped.id ? { ...mapped, name: doctor.name } : item)));
    },

    toggleDoctorActive: async (id) => {
      const doctor = doctors.find((item) => item.id === id);
      if (!doctor) throw new Error("The doctor could not be found.");
      const { data, error: updateError } = await supabase
        .from("doctors")
        .update({ status: doctor.active ? "inactive" : "active" })
        .eq("id", id)
        .select()
        .single();
      if (updateError) throw new Error(rowError("Updating doctor availability", updateError));
      const updated = mapDoctor(data as Row);
      setDoctors((items) => items.map((item) => (item.id === id ? { ...updated, name: doctor.name } : item)));
    },

    createInvoice: async (appointmentId, items) => {
      const appointment = appointments.find((item) => item.id === appointmentId);
      if (!appointment) throw new Error("The appointment could not be found.");
      const { data, error: insertError } = await supabase
        .from("bills")
        .insert({
          appointment_id: appointmentId,
          patient_id: appointment.patientId,
          amount: items.reduce((sum, item) => sum + item.amount, 0),
          items,
          status: "unpaid",
        })
        .select()
        .single();
      if (insertError) throw new Error(rowError("Creating bill", insertError));
      setInvoices((existing) => [mapInvoice({ ...(data as Row), doctor_id: appointment.doctorId }), ...existing]);
    },

    markInvoicePaid: async (id, method) => {
      const { data, error: updateError } = await supabase
        .from("bills")
        .update({ status: "paid", payment_method: method, paid_at: new Date().toISOString() })
        .eq("id", invoices.find((invoice) => invoice.id === id)?.databaseId ?? id)
        .select()
        .single();
      if (updateError) throw new Error(rowError("Recording payment", updateError));
      const existing = invoices.find((invoice) => invoice.id === id);
      setInvoices((items) => items.map((item) => (item.id === id ? { ...mapInvoice({ ...(data as Row), doctor_id: existing?.doctorId }), doctorId: existing?.doctorId ?? "" } : item)));
    },

    isSlotTaken: (doctorId, date, slot) =>
      appointments.some(
        (appointment) =>
          appointment.doctorId === doctorId &&
          appointment.date === date &&
          appointment.slot === slot &&
          (appointment.status === "Requested" || appointment.status === "Confirmed"),
      ),
  };

  if (isAuthenticated && loading) {
    return (
      <ClinicContext.Provider value={value}>
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </ClinicContext.Provider>
    );
  }

  if (isAuthenticated && error) {
    return (
      <ClinicContext.Provider value={value}>
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-sm">
            <h1 className="text-lg font-semibold text-foreground">Clinic data could not be loaded</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{error}</p>
            <button
              type="button"
              className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              onClick={() => void reload()}
            >
              Try again
            </button>
          </div>
        </div>
      </ClinicContext.Provider>
    );
  }

  return <ClinicContext.Provider value={value}>{children}</ClinicContext.Provider>;
}

export function useClinic() {
  const context = React.useContext(ClinicContext);
  if (!context) throw new Error("useClinic must be used inside ClinicProvider");
  return context;
}

export function newDoctorId() {
  return `new-${Date.now()}`;
}
