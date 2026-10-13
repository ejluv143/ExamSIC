// Google Classroom: what Examinus asks Google for.

// What Examinus asks Google for: the teacher's courses and rosters, with students' emails so they match accounts.
export const classroomScopes = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.rosters.readonly",
  "https://www.googleapis.com/auth/classroom.profile.emails",
] as const;

