import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Panel } from "@/components/clinic/page";
import { StatusBadge } from "@/components/clinic/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useClinic } from "@/lib/clinic/store";
import { prettyDate } from "@/lib/clinic/data";

export const Route = createFileRoute(
  "/_authenticated/profile",
)({
  head: () => ({
    meta: [
      {
        title: "My Profile — CareBridge",
      },
      {
        name: "description",
        content:
          "Your contact details, medical history and emergency contact on file.",
      },
      {
        property: "og:title",
        content: "My Profile — CareBridge",
      },
      {
        property: "og:description",
        content:
          "Personal details, allergies, conditions and emergency contact.",
      },
    ],
  }),
  component: ProfilePage,
});

function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-3 last:border-0">
      <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>

      <span className="min-w-0 text-sm text-right">
        {value || "Not provided"}
      </span>
    </div>
  );
}

type ProfileForm = {
  fullName: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
  bloodType: string;
  allergies: string;
  conditions: string;
  address: string;
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactPhone: string;
};

function profileToForm(
  patient: ReturnType<typeof useClinic>["currentPatient"],
): ProfileForm {
  return {
    fullName: patient.name,
    phone: patient.phone,
    gender: patient.gender,
    dateOfBirth: patient.dob,
    bloodType: patient.bloodType,
    allergies: patient.allergies.join(", "),
    conditions: patient.conditions.join(", "),
    address: patient.address,
    emergencyContactName:
      patient.emergency.name,
    emergencyContactRelation:
      patient.emergency.relation,
    emergencyContactPhone:
      patient.emergency.phone,
  };
}

function commaSeparatedToArray(
  value: string,
): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function ProfilePage() {
  const {
    currentPatient: p,
    appointments,
    role,
    getDoctor,
    updatePatientProfile,
  } = useClinic();

  const [editing, setEditing] =
    React.useState(false);

  const [saving, setSaving] =
    React.useState(false);

  const [error, setError] =
    React.useState<string | null>(
      null,
    );

  const [success, setSuccess] =
    React.useState(false);

  const [form, setForm] =
    React.useState<ProfileForm>(
      () => profileToForm(p),
    );

  /*
   * Keep form synchronized with the
   * current database-backed patient.
   *
   * We only reset it when entering
   * edit mode, so typing does not
   * get overwritten by unrelated
   * renders.
   */
  const openEditMode = () => {
    setForm(profileToForm(p));
    setError(null);
    setSuccess(false);
    setEditing(true);
  };

  const cancelEdit = () => {
    setForm(profileToForm(p));
    setError(null);
    setSuccess(false);
    setEditing(false);
  };

  const updateField = (
    field: keyof ProfileForm,
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setError(null);
    setSuccess(false);
  };

  const saveProfile = async () => {
    if (!form.fullName.trim()) {
      setError(
        "Full name cannot be empty.",
      );
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await updatePatientProfile({
        fullName:
          form.fullName.trim(),

        phone:
          form.phone.trim(),

        gender:
          form.gender.trim(),

        dateOfBirth:
          form.dateOfBirth,

        bloodType:
          form.bloodType.trim(),

        allergies:
          commaSeparatedToArray(
            form.allergies,
          ),

        conditions:
          commaSeparatedToArray(
            form.conditions,
          ),

        address:
          form.address.trim(),

        emergencyContactName:
          form.emergencyContactName.trim(),

        emergencyContactRelation:
          form.emergencyContactRelation.trim(),

        emergencyContactPhone:
          form.emergencyContactPhone.trim(),
      });

      setSuccess(true);
      setEditing(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not update your profile.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (role !== "patient") {
    return (
      <PageHeader
        title="Patient view only"
        description="Switch the role selector to Patient to see this profile."
      />
    );
  }

  const history = appointments
    .filter(
      (a) =>
        a.patientId === p.id &&
        a.status === "Completed",
    )
    .sort((a, b) =>
      b.date.localeCompare(a.date),
    );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Patient portal"
        title="My profile"
        description={p.email}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {success && (
            <p className="text-sm font-medium text-primary">
              Profile updated
              successfully.
            </p>
          )}

          {error && (
            <p className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
        </div>

        {!editing && (
          <Button
            type="button"
            onClick={openEditMode}
          >
            Edit profile
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-6">
          <Panel
            title="Personal details"
            description="Update your basic contact information."
          >
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full-name">
                  Full name
                </Label>

                <Input
                  id="full-name"
                  value={form.fullName}
                  onChange={(event) =>
                    updateField(
                      "fullName",
                      event.target.value,
                    )
                  }
                  placeholder="Your full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">
                  Email
                </Label>

                <Input
                  id="email"
                  value={p.email}
                  disabled
                  readOnly
                />

                <p className="text-xs text-muted-foreground">
                  Email is managed by
                  your login account.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">
                  Phone
                </Label>

                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(event) =>
                    updateField(
                      "phone",
                      event.target.value,
                    )
                  }
                  placeholder="+880..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gender">
                  Gender
                </Label>

                <Input
                  id="gender"
                  value={form.gender}
                  onChange={(event) =>
                    updateField(
                      "gender",
                      event.target.value,
                    )
                  }
                  placeholder="e.g. Male"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date-of-birth">
                  Date of birth
                </Label>

                <Input
                  id="date-of-birth"
                  type="date"
                  value={
                    form.dateOfBirth
                  }
                  onChange={(event) =>
                    updateField(
                      "dateOfBirth",
                      event.target.value,
                    )
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="blood-type">
                  Blood type
                </Label>

                <Input
                  id="blood-type"
                  value={
                    form.bloodType
                  }
                  onChange={(event) =>
                    updateField(
                      "bloodType",
                      event.target.value,
                    )
                  }
                  placeholder="e.g. O+"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">
                  Address
                </Label>

                <Textarea
                  id="address"
                  value={form.address}
                  onChange={(event) =>
                    updateField(
                      "address",
                      event.target.value,
                    )
                  }
                  placeholder="Your current address"
                  rows={3}
                />
              </div>
            </div>
          </Panel>

          <Panel
            title="Medical history"
            description="Keep your health information up to date."
          >
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="conditions">
                  Conditions
                </Label>

                <Textarea
                  id="conditions"
                  value={
                    form.conditions
                  }
                  onChange={(event) =>
                    updateField(
                      "conditions",
                      event.target.value,
                    )
                  }
                  placeholder="e.g. Asthma, Diabetes"
                  rows={4}
                />

                <p className="text-xs text-muted-foreground">
                  Separate multiple
                  conditions with
                  commas.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="allergies">
                  Allergies
                </Label>

                <Textarea
                  id="allergies"
                  value={
                    form.allergies
                  }
                  onChange={(event) =>
                    updateField(
                      "allergies",
                      event.target.value,
                    )
                  }
                  placeholder="e.g. Penicillin, Peanuts"
                  rows={4}
                />

                <p className="text-xs text-muted-foreground">
                  Separate multiple
                  allergies with
                  commas.
                </p>
              </div>
            </div>
          </Panel>

          <Panel
            title="Emergency contact"
            description="Someone the clinic can contact if necessary."
          >
            <div className="grid gap-5 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="emergency-name">
                  Name
                </Label>

                <Input
                  id="emergency-name"
                  value={
                    form.emergencyContactName
                  }
                  onChange={(event) =>
                    updateField(
                      "emergencyContactName",
                      event.target.value,
                    )
                  }
                  placeholder="Contact name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="emergency-relation">
                  Relation
                </Label>

                <Input
                  id="emergency-relation"
                  value={
                    form.emergencyContactRelation
                  }
                  onChange={(event) =>
                    updateField(
                      "emergencyContactRelation",
                      event.target.value,
                    )
                  }
                  placeholder="e.g. Father"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="emergency-phone">
                  Phone
                </Label>

                <Input
                  id="emergency-phone"
                  value={
                    form.emergencyContactPhone
                  }
                  onChange={(event) =>
                    updateField(
                      "emergencyContactPhone",
                      event.target.value,
                    )
                  }
                  placeholder="+880..."
                />
              </div>
            </div>
          </Panel>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={cancelEdit}
              disabled={saving}
            >
              Cancel
            </Button>

            <Button
              type="button"
              onClick={() =>
                void saveProfile()
              }
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : "Save changes"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Personal details">
            <Row
              label="Full name"
              value={p.name}
            />

            <Row
              label="Date of birth"
              value={
                p.dob
                  ? prettyDate(p.dob)
                  : ""
              }
            />

            <Row
              label="Gender"
              value={p.gender}
            />

            <Row
              label="Phone"
              value={p.phone}
            />

            <Row
              label="Address"
              value={p.address}
            />
          </Panel>

          <Panel title="Medical history">
            <Row
              label="Blood type"
              value={p.bloodType}
            />

            <Row
              label="Conditions"
              value={
                p.conditions
                  .join(", ") ||
                "None recorded"
              }
            />

            <Row
              label="Allergies"
              value={
                p.allergies
                  .join(", ") ||
                "None"
              }
            />

            <Row
              label="Visits completed"
              value={String(
                history.length,
              )}
            />
          </Panel>

          <Panel title="Emergency contact">
            <Row
              label="Name"
              value={
                p.emergency.name
              }
            />

            <Row
              label="Relation"
              value={
                p.emergency.relation
              }
            />

            <Row
              label="Phone"
              value={
                p.emergency.phone
              }
            />
          </Panel>

          <Panel title="Past visits">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No completed visits
                yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {history.map(
                  (a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-3 py-3 first:pt-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {a.reason}
                        </p>

                        <p className="truncate text-xs text-muted-foreground">
                          {
                            getDoctor(
                              a.doctorId,
                            )?.name
                          }{" "}
                          ·{" "}
                          {prettyDate(
                            a.date,
                          )}
                        </p>
                      </div>

                      <StatusBadge
                        status={
                          a.status
                        }
                      />
                    </li>
                  ),
                )}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}