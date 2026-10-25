# AWS setup (one time, by the account owner)

Nothing here needs AWS keys on a computer: stacks are created from the AWS console (CloudFormation → Create stack →
Upload a template file), or through the AWS MCP connector while you are signed in.

1. **Domain:** Route 53 → Registered domains → register (e.g. `yassineyandouzi.dev`, ~$15/year). Route 53 creates
   the hosted zone; note its **Hosted zone ID**.
2. **Bootstrap** (region **us-east-1**): stack `portfolio-bootstrap` from `bootstrap.yaml`. Parameters: `BucketName`
   = `yandouzi-portfolio-<12-digit account id>`, `AlertEmail` = your address (stays in AWS only). Confirm the budget
   alert e-mail AWS sends you. Note output `DeployRoleArn`.
3. **Certificate** (region **us-east-1**): stack `portfolio-certificate` from `certificate.yaml` with `DomainName` and
   `HostedZoneId`. Wait for `CREATE_COMPLETE` (DNS validation is automatic, ~5 min). Note `CertificateArn`.
4. **Site** (region **ca-central-1**): stack `portfolio-site` from `site.yaml` with `BucketName`, `DomainName`,
   `CertificateArn`, `HostedZoneId`. Note `DistributionId`.
5. **GitHub** → repo Settings → Secrets and variables → Actions → **Variables** (not secrets, none are sensitive):
   `AWS_ROLE_ARN`, `S3_BUCKET`, `CF_DISTRIBUTION_ID`, `SITE_URL` (= `https://<your domain>`).

After step 5, every push to `main` builds, tests and deploys the site (`.github/workflows/deploy.yml`).

Costs at portfolio traffic: S3 + CloudFront about $1/month, Route 53 hosted zone $0.50/month, plus the domain.
Budget alerts e-mail you at $5 and $20 per month.
