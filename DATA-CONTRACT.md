# Candidate Data Contract

The application uses four separate layers.

## 1. Matching data
Used to filter/rank candidates:
- Target roles
- Functional/sector fit
- Compensation target/range
- Location
- Hard constraints

## 2. Verified candidate evidence
Allowed in recruiter-facing copy:
- Professional identity
- Roles held
- Companies
- Projects
- Responsibilities
- Achievements
- Metrics
- Skills
- Parsed resume evidence

## 3. Recruiter context
Operational only; never candidate achievement evidence:
- Status
- Priority
- Sourcing history
- Applications
- Interviews
- Rejections
- Recruiter/MoF notes
- Internal process comments

## 4. Resume state
- Available
- Source/link
- Parsed successfully

### Generation rule
The client may submit a raw candidate record, but `/api/blurb` sanitizes it server-side and generates only from the resulting evidence payload. This prevents recruiter/process fields from becoming achievements even if the client sends them.
