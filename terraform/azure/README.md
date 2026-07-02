# Azure Terraform Module

Azure deployment is outside the GCP MVP. The intended Azure architecture is:

- Azure Container Apps for the GTM server and preview server
- Azure DNS for DNS automation
- Application Gateway or Container Apps ingress for HTTPS routing
- Managed certificates
- Azure Monitor for logs and metrics

This directory exists so the repository structure communicates the multi-cloud roadmap while keeping the first release focused on GCP.

## License

Licensed under the Apache License, Version 2.0. See the repository [LICENSE](../../LICENSE) file for details.
