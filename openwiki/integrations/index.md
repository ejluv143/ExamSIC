# Files

- [Image and drawing storage (S3)](asset-storage.md) - How question images and student drawings/photos are uploaded directly to a private S3-compatible bucket with presigned POSTs, verified by the API, shown through short-lived signed URLs according to visibility rules, and cleaned up daily.
- [Code runner and SQL grader](code-runner-and-sql-grader.md) - How code answers are executed — the apps/runner Docker sandbox service and its /run protocol, the API's Runner client, the sql.js SQL grader in a killable child process, the in-browser Run button for Python, JavaScript and SQL, and what happens when the runner is missing.
- [Google sign-in and Classroom import](google-classroom.md) - How Google OAuth is used for sign-in, sign-up and linking a teacher's Google account with read-only Classroom scopes, how courses are imported as classes and rosters synced, and how imported roster entries are later claimed by students.
