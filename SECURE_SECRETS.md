# Secure Secrets Storage Guidance

Short checklist for keeping secrets out of the repository:

- Commit only `.env.example` (placeholders) to the repo.
- Add `.env` and other env files to `.gitignore` (done).
- Use a secrets manager in CI/CD (GitHub Actions Secrets, GitHub Vault, Azure Key Vault, AWS Secrets Manager, or HashiCorp Vault).
- For local development, store secrets in the OS keychain, a local `.env` file excluded from git, or an encrypted file.

Quick options:

- GitHub Actions: add repo secrets in Settings → Secrets and reference them in workflows.
- Encrypt file locally with OpenSSL (example):

```powershell
# encrypt
OpenSSL enc -aes-256-cbc -salt -in .env -out .env.enc
# decrypt
OpenSSL enc -d -aes-256-cbc -in .env.enc -out .env
```

- Use `gpg` to encrypt single recipients and commit the `.env.gpg` file.

If you'd like, I can:

- Create a sample GitHub Actions workflow to inject secrets at build time.
- Generate an encrypted `.env.enc` using OpenSSL (you'll need to provide a passphrase).

GitHub Actions example
----------------------

Add the following secret names in your repository Settings → Secrets and variables → Actions:

- `DATABASE_URL`
- `JWT_SECRET`
- `REFRESH_TOKEN_SECRET`
- `EMAIL_USER`
- `EMAIL_PASS`
- `EMAIL_HOST` (e.g., smtp.mailtrap.io)
- `GOOGLE_API_KEY`
- `OPENAI_API_KEY`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `CURRENCY_API_KEY`

Deployment secrets
------------------

If you want the workflow to deploy to a VM/server on `main`, add these repository secrets as well:

- `DEPLOY_HOST` (e.g., 203.0.113.10)
- `DEPLOY_USER` (e.g., ubuntu)
- `DEPLOY_PATH` (remote directory to sync to)
- `DEPLOY_SSH_KEY` (private key content; add as a secret)

Notes:
- The workflow restricts deploy to pushes to `main` and uses the `production` environment in Actions. Protect that branch in GitHub if you require approvals.
- Provide only the private key for `DEPLOY_SSH_KEY`; the action uses an SSH agent to authenticate.

I added a sample workflow at `.github/workflows/ci-secrets.yml` that demonstrates how to inject these repository secrets into the `geezle-backend` job and run install/build/test steps.

If you want, I can modify the workflow to run specific deployment steps or restrict it to protected branches only.
