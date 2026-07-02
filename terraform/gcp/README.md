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

## Optional Custom Domain

When `custom_domain` is not empty, the module creates an external HTTPS load balancer backed by a serverless NEG for the GTM server Cloud Run service. With `use_managed_ssl = true`, Certificate Manager creates a Google-managed certificate through DNS authorization. With `enable_cloud_dns = true`, Cloud DNS records are created for the load balancer A record and certificate DNS authorization record.

Cloud Run `*.run.app` URLs remain available and are the default HTTPS path when no custom domain is provided.

## License

Licensed under the Apache License, Version 2.0. See the repository [LICENSE](../../LICENSE) file for details.
