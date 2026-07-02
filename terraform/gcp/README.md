# GCP Terraform Module

This module deploys the GCP MVP for `gtm-server-deployer`.

## Resources

- Required Google Cloud APIs
- Secret Manager secret for the GTM container config
- Cloud Run service account and Secret Manager access
- Cloud Run GTM Server Container
- Optional Cloud Run Preview Server
- Public Cloud Run invoker IAM when enabled

## Usage

```bash
terraform init
terraform plan -out=tfplan -var-file=/absolute/path/to/.gtm-server-deployer/terraform.tfvars.json
terraform apply tfplan
```

The application generates the tfvars file and runs these commands from the local deployment engine.
