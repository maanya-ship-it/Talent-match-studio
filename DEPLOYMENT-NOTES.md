# Production deployment

1. Keep the company Sheets private; do not commit raw company spreadsheets or resumes to this repository.
2. Connect the private Sheet through the approved company data connection before replacing the current static roster.
3. Confirm the Cloudflare Pages `AI` binding is configured for `/api/blurb`.
4. Run the QA checklist against a representative sample of candidates and JDs.
5. Verify hard constraints, role matching, metric integrity and recruiter-context isolation before deployment.
6. Deploy only after the production branch passes manual regression testing.
