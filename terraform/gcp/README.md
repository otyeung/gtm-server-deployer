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

When `custom_domain` is not empty, the module creates an external HTTPS load balancer backed by a serverless NEG for the GTM server Cloud Run service. The module currently requires `use_managed_ssl = true` for custom domains because self-managed certificate inputs are not implemented yet, and it normalizes custom-domain-derived DNS values to lowercase before creating Certificate Manager and Cloud DNS resources. With `enable_cloud_dns = true`, Cloud DNS records are created for the load balancer A record and certificate DNS authorization record, and the module outputs the managed zone name servers as `cloud_dns_name_servers`.

If Terraform creates a Cloud DNS managed zone for the full custom domain, delegate that zone from the parent DNS zone using the output name servers unless the domain is already delegated to the new zone. This is especially important for common subdomain setups, where creating the child zone alone does not make the hostname resolvable until the parent zone points at the new name servers.

Cloud Run `*.run.app` URLs remain available and are the default HTTPS path when no custom domain is provided.

## License

Licensed under the Apache License, Version 2.0. See the repository [LICENSE](../../LICENSE) file for details.
