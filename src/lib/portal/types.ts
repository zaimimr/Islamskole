import type { SessionUser } from "@/lib/auth";

export const ATTENDANCE_STATUSES = ["til_stede", "fravaer", "sent", "meldt_fravaer"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export type PortalContext = {
  user: SessionUser | null;
  email: string | null;
  guardianIds: string[];
  isTeacher: boolean;
  isGuardian: boolean;
  isStudent: boolean;
  isAdmin: boolean;
};

export type PortalPerson = {
  first_name: string | null;
  last_name: string | null;
};

export type PortalGuardianContact = PortalPerson & {
  phone: string | null;
};

export type PortalPickupPerson = {
  name: string;
  phone: string | null;
  relation: string | null;
};

export type PortalChild = {
  student_id: string;
  first_name: string | null;
  last_name: string | null;
  birth_date: string | null;
  age: number | null;
  class_id: string;
  class_name_no: string;
  class_name_en: string;
  school_year_id: string;
  school_year_label: string;
  teachers: PortalPerson[];
  remaining_ore: number | null;
};

export type PortalSelfNote = {
  id: string;
  date: string;
  homework: string | null;
  summary: string | null;
  lesson_id: string | null;
  subject: string | null;
  start_position: number | null;
  end_position: number | null;
};

export type PortalSelf = {
  student_id: string;
  first_name: string | null;
  last_name: string | null;
  birth_date: string | null;
  age: number | null;
  class_id: string | null;
  class_name_no: string | null;
  class_name_en: string | null;
  school_year_id: string | null;
  school_year_label: string | null;
  teachers: PortalPerson[];
  notes: PortalSelfNote[];
  attendance: { date: string; status: AttendanceStatus; lesson_id: string | null }[];
};

export type PortalClass = {
  class_id: string;
  name_no: string;
  name_en: string;
  school_year_id: string;
  school_year_label: string;
  role: string;
  student_count: number;
  substitute_until: string | null;
};

export type PortalSubstituteOption = {
  class_id: string;
  name_no: string;
  name_en: string;
  student_count: number;
};

export type AbsenceSource = "app" | "laerer";

export type PortalRosterRow = {
  student_id: string;
  first_name: string | null;
  last_name: string | null;
  birth_date: string | null;
  age: number | null;
  guardians: PortalGuardianContact[];
  attendance_status: AttendanceStatus | null;
  attendance_marked_at: string | null;
  inherited_from_lesson_id?: string | null;
  absence_report_id: string | null;
  absence_reason: string | null;
  absence_source: AbsenceSource | null;
  allergies: string | null;
  medical_notes: string | null;
  photo_consent: boolean | null;
  pickup: PortalPickupPerson[];
};

export type PortalSchoolDay = {
  id: string;
  school_year_id: string;
  date: string;
  cancelled: boolean;
  note: string | null;
};

export type PortalSchoolDays = {
  schoolYearId: string | null;
  upcoming: PortalSchoolDay[];
  past: PortalSchoolDay[];
};

export type PortalClassNote = {
  id: string;
  class_id: string;
  school_day_id: string;
  lesson_id: string;
  subject: string | null;
  start_position: number | null;
  end_position: number | null;
  date: string | null;
  homework: string | null;
  summary: string | null;
  author_guardian_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PortalAbsenceReport = {
  id: string;
  student_id: string;
  school_day_id: string;
  date: string | null;
  reason: string | null;
  created_at: string;
  withdrawn_at: string | null;
};

export type PortalAttendance = {
  student_id: string;
  school_day_id: string;
  lesson_id: string | null;
  date: string | null;
  status: AttendanceStatus;
  marked_at: string;
};

export type PortalLesson = {
  lesson_id: string;
  school_day_id: string;
  date: string;
  class_id: string;
  class_name_no: string;
  class_name_en: string;
  start_position: number;
  end_position: number;
  start_label: string | null;
  end_label: string | null;
  starts_at: string | null;
  ends_at: string | null;
  subject: string | null;
  teacher_guardian_id: string | null;
  teacher_first_name: string | null;
  teacher_last_name: string | null;
  co_teacher_guardian_id: string | null;
  co_teacher_first_name: string | null;
  co_teacher_last_name: string | null;
  is_substitute: boolean;
  cancelled: boolean;
  is_mine: boolean;
  note: string | null;
};

export type PortalTimeSlot = {
  position: number;
  label: string;
  starts_at: string;
  ends_at: string;
};

export type PortalErrorCode =
  | "invalid"
  | "unauthenticated"
  | "forbidden"
  | "duplicate"
  | "closed"
  | "rate_limited"
  | "not_found"
  | "unknown";

export type PortalActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: PortalErrorCode };
